import { MAX_JOURNAL_TEXT_LENGTH } from "./state";

/**
 * §8 compliance: journal "talk-to-write" dictation MUST route the child's audio
 * through the same-origin, LiteLLM-backed transcription route — never the
 * browser Web Speech API, which streams open-ended child speech to a browser
 * vendor's cloud (Google/Apple). These helpers are the pure, unit-tested seam
 * shared by the client hook ({@link useDictation}) and are kept free of any
 * `MediaRecorder`/`fetch` so their contract can be verified in isolation.
 */

/** Where the client hook POSTs a short recording for bounded transcription. */
export const JOURNAL_DICTATION_ENDPOINT = "/api/journal-dictation";

/**
 * The mic-open ceiling for a single dictation take. A journal idea is short;
 * this stays at/under the kaelyn-stt 15s decoded-speech cap so a take always
 * fits one bounded transcription request.
 */
export const MAX_DICTATION_MS = 15_000;

/** The authored identity a dictation request must carry so the route can gate it. */
export interface DictationIdentity {
  learnerId: string;
  programSlug: string;
  unitKey?: string;
  activityId?: string;
}

/**
 * Build the multipart body for one dictation take. Returns null when the
 * authored route identity is incomplete (generated shelf hosts omit
 * unitKey/activityId) — dictation is authored-content-only, mirroring oral
 * reading, so a missing identity means "no compliant request is possible".
 */
export function createJournalDictationForm(
  audio: Blob,
  identity: DictationIdentity,
): FormData | null {
  if (!identity.unitKey || !identity.activityId) return null;
  const form = new FormData();
  form.append("file", audio, "dictation.webm");
  form.append("learnerId", identity.learnerId);
  form.append("programSlug", identity.programSlug);
  form.append("unitKey", identity.unitKey);
  form.append("activityId", identity.activityId);
  return form;
}

/** Trim + hard-cap a transcript to the journal text ceiling (defense in depth). */
export function boundDictationText(text: string): string {
  return text.trim().slice(0, MAX_JOURNAL_TEXT_LENGTH);
}

/**
 * Parse the route's JSON body into a bounded transcript. Anything malformed or
 * non-string collapses to "" (the calm "nothing was added" outcome), so a
 * gateway hiccup can never inject a non-string into the journal field.
 */
export function parseDictationResponse(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const text = (value as { text?: unknown }).text;
  return typeof text === "string" ? boundDictationText(text) : "";
}
