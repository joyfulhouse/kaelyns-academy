import type { OralReadingResponse } from "./logic";

export const MAX_RECORDING_MS = 8_000;
export const MIN_SENTENCE_PACE_WCPM = 15;
export const SENTENCE_SETUP_MARGIN_MS = 3_000;
export const MAX_RECORDING_MS_FLOOR = MAX_RECORDING_MS;
// The mic-open ceiling. Leading/trailing silence is VAD-trimmed server-side, so
// this can exceed the kaelyn-stt 15s decoded-speech cap by the setup margin.
// The sentence passage schema (≤7 words) keeps actual reading within that cap
// at the 30 WCPM grade-1 target — 7 words ≈ 14s reading, + 3s margin = 17s.
export const MAX_RECORDING_MS_CEIL = 18_000;
export const MAX_VERIFY_ATTEMPTS = 2;
export const VERIFY_TIMEOUT_MS = 20_000;

/**
 * Give a beginning reader enough time to finish the authored sentence without
 * weakening the existing hard cap. Word mode continues to use
 * {@link MAX_RECORDING_MS} directly. The ceiling accommodates the longest
 * allowed passage (7 words) read at the 30 WCPM target plus setup margin.
 */
export function sentenceRecordingMs(wordCount: number): number {
  const boundedWordCount = Number.isFinite(wordCount) ? Math.max(0, wordCount) : 0;
  const readingMs = Math.round((boundedWordCount / MIN_SENTENCE_PACE_WCPM) * 60_000);
  return Math.min(
    MAX_RECORDING_MS_CEIL,
    Math.max(MAX_RECORDING_MS_FLOOR, readingMs + SENTENCE_SETUP_MARGIN_MS),
  );
}

export type VerificationResult = OralReadingResponse["results"][number];
export type OralReadingPhase =
  | "ready"
  | "requesting"
  | "listening"
  | "checking"
  | "unclear"
  | "fallback";

export const MIC_CLASSES: Record<"ready" | "busy" | "listening", string> = {
  ready: "bg-honey text-ink",
  busy: "bg-honey/55 text-ink",
  listening: "bg-accent-deep text-on-accent",
};

export function subscribeStatic(): () => void {
  return () => {};
}

export function browserHasMicrophone(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined"
  );
}

export function supportedMimeType(): string | undefined {
  const types = ["audio/webm;codecs=opus", "audio/webm"];
  return types.find((type) => MediaRecorder.isTypeSupported(type));
}

export function parseWordRouteResult(value: unknown): VerificationResult | "unavailable" {
  if (!value || typeof value !== "object") return "unavailable";
  const result = (value as { result?: unknown }).result;
  return result === "matched" || result === "unclear" || result === "no-speech"
    ? result
    : "unavailable";
}

export function canSubmitRecording(
  active: boolean,
  byteLength: number,
  recordingFailed = false,
): boolean {
  return active && !recordingFailed && byteLength > 0;
}

/** Gateway failures consume an upload too, preventing extra tries around the cap. */
export function canRecordAnother(submitted: number): boolean {
  return submitted < MAX_VERIFY_ATTEMPTS;
}

export function phaseAfterUnmatched(
  submittedSoFar: number,
): Extract<OralReadingPhase, "unclear" | "fallback"> {
  return submittedSoFar >= MAX_VERIFY_ATTEMPTS ? "fallback" : "unclear";
}
