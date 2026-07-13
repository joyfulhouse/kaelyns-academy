// server-only: this module sends child audio to the bounded LiteLLM route and
// must never be imported into a Client Component. The project intentionally
// uses this comment guard because the `server-only` package is not installed.
import { getEnv } from "@/lib/env";

interface TranscriptionResponse {
  text?: unknown;
  words?: unknown;
}

export interface TranscriptionWord {
  word: string;
  start: number;
  end: number;
  probability?: number;
}

export interface VerboseTranscription {
  text: string;
  words?: TranscriptionWord[];
}

export interface TranscriptionOptions {
  wordTimestamps?: boolean;
}

function transcriptionUrl(base: string): string {
  return `${base.replace(/\/+$/, "")}/audio/transcriptions`;
}

/**
 * Send one short in-memory recording through the OpenAI-compatible LiteLLM
 * transcription route. Environment reads and network work remain lazy so builds
 * never connect to services at module evaluation time.
 */
export function transcribeOralReading(audio: Blob, target: string): Promise<string>;
export function transcribeOralReading(
  audio: Blob,
  target: string,
  options: { wordTimestamps: true },
): Promise<VerboseTranscription>;
export async function transcribeOralReading(
  audio: Blob,
  target: string,
  options: TranscriptionOptions = {},
): Promise<string | VerboseTranscription> {
  const base = getEnv("LITELLM_URL");
  const apiKey = getEnv("LITELLM_API_KEY");
  const form = new FormData();
  form.append("file", audio, "reading.webm");
  form.append("model", "kaelyn-stt");
  form.append("prompt", target);
  if (options.wordTimestamps === true) form.append("response_format", "verbose_json");

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
  if (options.wordTimestamps !== true) return data.text;

  const words = transcriptionWords(data.words);
  return words === undefined ? { text: data.text } : { text: data.text, words };
}

function transcriptionWords(value: unknown): TranscriptionWord[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((entry): TranscriptionWord[] => {
    if (!entry || typeof entry !== "object") return [];
    const { word, start, end, probability } = entry as Record<string, unknown>;
    if (
      typeof word !== "string" ||
      typeof start !== "number" ||
      !Number.isFinite(start) ||
      typeof end !== "number" ||
      !Number.isFinite(end)
    ) {
      return [];
    }
    if (typeof probability === "number" && Number.isFinite(probability)) {
      return [{ word, start, end, probability }];
    }
    return [{ word, start, end }];
  });
}
