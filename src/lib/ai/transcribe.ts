// server-only: this module sends child audio to the bounded LiteLLM route and
// must never be imported into a Client Component. The project intentionally
// uses this comment guard because the `server-only` package is not installed.
import { getEnv } from "@/lib/env";

interface TranscriptionResponse {
  text?: unknown;
}

function transcriptionUrl(base: string): string {
  return `${base.replace(/\/+$/, "")}/audio/transcriptions`;
}

/**
 * Send one short in-memory recording through the OpenAI-compatible LiteLLM
 * transcription route. Environment reads and network work remain lazy so builds
 * never connect to services at module evaluation time.
 */
export async function transcribeOralReading(audio: Blob, target: string): Promise<string> {
  const base = getEnv("LITELLM_URL");
  const apiKey = getEnv("LITELLM_API_KEY");
  const form = new FormData();
  form.append("file", audio, "reading.webm");
  form.append("model", "kaelyn-stt");
  form.append("prompt", target);

  const response = await fetch(transcriptionUrl(base), {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`LiteLLM transcription failed (${response.status})`);
  }

  const data = (await response.json()) as TranscriptionResponse;
  if (typeof data.text !== "string") {
    throw new Error("LiteLLM transcription returned no text");
  }
  return data.text;
}
