import type { ZodType } from "zod";
import { getEnv } from "@/lib/env";

/**
 * OpenAI-compatible client for the homelab LiteLLM gateway. Every AI call in the
 * product goes through here (CLAUDE.md: never call provider SDKs directly).
 *
 * Build-safety: this module reads env and opens connections ONLY inside the
 * exported async functions, never at import time, so `next build` is safe.
 */

/**
 * Tutor routes on the homelab LiteLLM gateway (DeepSeek V4, B3 §3). `ds4-fast`
 * serves the READY band (sub-second, direct JSON); `ds4` serves the STRETCH
 * band (the same model at a fuller budget for richer prose). Both are the
 * NON-reasoning DeepSeek routes: chatJSON needs clean structured output, and a
 * reasoning model's thinking tokens corrupt/slow the JSON path (a prior route
 * 502'd at ~31s), so we deliberately avoid the reasoning routes here.
 *
 * `ha-assist` (the former tutor route) remains configured on the gateway but is
 * no longer used by the tutor. Model names are config: swapping a route here is
 * the only change needed to re-point either band.
 */
export const TUTOR_FAST = "ds4-fast" as const;
export const TUTOR_RICH = "ds4" as const;

export type TutorModel = typeof TUTOR_FAST | typeof TUTOR_RICH | (string & {});

/**
 * Default server-side request budget for a gateway call. A hung LiteLLM upstream
 * must not pin a Next.js request handler open indefinitely: server callers don't
 * pass a `signal`, so without this every stalled call would leak a handler (a
 * prior incident saw a reasoning route stall ~31s before a 502). 20s is
 * comfortably above the ds4 JSON path's few-second latency while still bounding
 * the worst case.
 */
const DEFAULT_MS = 20_000;

/**
 * Fence an untrusted string so the model reads it as data, not instructions.
 * Pair this at the call site with a SYSTEM line telling the model that text
 * between these markers is data only (see each caller's `UNTRUSTED_DATA_RULE`).
 * Defence-in-depth: the per-prompt zod schema remains the output boundary; this
 * just blunts prompt-injection from parent/child-supplied free text at the source.
 */
export function fenceUntrusted(value: string): string {
  // Strip any `<<<…>>>` fence token from the value first, so untrusted text
  // (a parent/child-supplied name or focus) can't emit its own `<<<END>>>` to
  // close the fence early and have whatever follows read as instructions.
  const sanitized = value.replace(/<<<[^>]*>>>/g, "");
  return `<<<UNTRUSTED>>>\n${sanitized}\n<<<END>>>`;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
}

export interface ChatJSONOptions<T> {
  model: TutorModel;
  system: string;
  user: string;
  /** Zod schema the parsed JSON MUST satisfy; a mismatch throws. */
  schema: ZodType<T>;
  /** 0..1; defaults low for deterministic, bounded generation. */
  temperature?: number;
  /** Hard ceiling on tokens; defaults to a modest budget. */
  maxTokens?: number;
  /** Abort signal for request-level timeouts. */
  signal?: AbortSignal;
}

/** Trim a LiteLLM base URL so we can append a clean `/chat/completions`. */
function completionsUrl(base: string): string {
  return `${base.replace(/\/+$/, "")}/chat/completions`;
}

/**
 * Some gateways wrap JSON in markdown fences or prose. Extract the first JSON
 * object/array so a chatty model still yields parseable content.
 */
function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const body = fence ? fence[1].trim() : trimmed;
  const start = body.search(/[[{]/);
  if (start === -1) return body;
  const lastObj = body.lastIndexOf("}");
  const lastArr = body.lastIndexOf("]");
  const end = Math.max(lastObj, lastArr);
  return end > start ? body.slice(start, end + 1) : body;
}

/**
 * POST a chat completion requesting JSON, parse it, and validate against `schema`.
 * Throws on transport errors, non-2xx, empty/malformed content, or schema
 * mismatch. Never returns unvalidated model output.
 */
export async function chatJSON<T>({
  model,
  system,
  user,
  schema,
  temperature = 0.4,
  maxTokens = 1200,
  signal,
}: ChatJSONOptions<T>): Promise<T> {
  const base = getEnv("LITELLM_URL");
  const apiKey = getEnv("LITELLM_API_KEY");

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  // Always bound the request with DEFAULT_MS; if the caller passed a signal,
  // combine the two so EITHER an external cancel OR the timeout aborts the fetch.
  const timeoutSignal = AbortSignal.timeout(DEFAULT_MS);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  let response: Response;
  try {
    response = await fetch(completionsUrl(base), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
      }),
      signal: requestSignal,
    });
  } catch (cause) {
    // An aborted fetch surfaces as a DOMException whose name is "TimeoutError"
    // when our AbortSignal.timeout fires, or "AbortError" when the caller's
    // signal cancels. Re-throw either as a clear, named error so it joins the
    // existing thrown-error path (callers catch and fall back to authored
    // content) instead of leaking a bare DOMException.
    if (cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError")) {
      const reason = timeoutSignal.aborted ? `timed out after ${DEFAULT_MS}ms` : "aborted";
      throw new Error(`LiteLLM request ${reason}`);
    }
    throw cause;
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`LiteLLM request failed (${response.status}): ${detail.slice(0, 500)}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("LiteLLM returned no message content");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(content));
  } catch (cause) {
    throw new Error(`LiteLLM returned non-JSON content: ${String(cause)}`);
  }

  // Validation is the security boundary: bounded, schema-checked output only.
  return schema.parse(parsed);
}
