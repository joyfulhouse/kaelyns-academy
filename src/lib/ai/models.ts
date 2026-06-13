import type { ZodType } from "zod";
import { getEnv } from "@/lib/env";

/**
 * OpenAI-compatible client for the homelab LiteLLM gateway. Every AI call in the
 * product goes through here (CLAUDE.md: never call provider SDKs directly).
 *
 * Build-safety: this module reads env and opens connections ONLY inside the
 * exported async functions, never at import time, so `next build` is safe.
 */

/** Named tutor routes configured in LiteLLM (Claude models behind the gateway). */
export const TUTOR_FAST = "kaelyn-tutor-fast" as const;
export const TUTOR_RICH = "kaelyn-tutor-rich" as const;

export type TutorModel = typeof TUTOR_FAST | typeof TUTOR_RICH | (string & {});

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

  const response = await fetch(completionsUrl(base), {
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
    signal,
  });

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
