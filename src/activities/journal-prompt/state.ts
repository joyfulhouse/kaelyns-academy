export const MAX_JOURNAL_TEXT_LENGTH = 2_000;
export const MAX_JOURNAL_MARKS = 200;

interface ParticipationState {
  markCount: number;
  textLength: number;
  usedDictation: boolean;
}

export type JournalTextSource = "scaffold" | "manual" | "word-bank" | "dictation";

/** Ephemeral per-character provenance. Only the bounded summary leaves the Player. */
export interface JournalTextState {
  text: string;
  sources: readonly JournalTextSource[];
}

export interface TextInsertion {
  state: JournalTextState;
  selectionStart: number;
  selectionEnd: number;
}

export function createJournalTextState(
  text = "",
  source: JournalTextSource = "manual",
): JournalTextState {
  const bounded = text.slice(0, MAX_JOURNAL_TEXT_LENGTH);
  return { text: bounded, sources: Array<JournalTextSource>(bounded.length).fill(source) };
}

/** Count learner-originated characters without treating authored scaffolds as work. */
export function contributedTextLength(state: JournalTextState): number {
  const normalized = normalizeJournalTextState(state);
  let contribution = "";
  for (let index = 0; index < normalized.text.length; index += 1) {
    if (normalized.sources[index] !== "scaffold") contribution += normalized.text[index];
  }
  return contribution.trim().length;
}

export function usedDictation(state: JournalTextState): boolean {
  return normalizeJournalTextState(state).sources.includes("dictation");
}

/**
 * Reconcile a controlled-field edit by preserving provenance for the unchanged
 * prefix/suffix and marking only newly entered characters as manual input.
 */
export function applyManualJournalText(
  state: JournalTextState,
  nextText: string,
): JournalTextState {
  const current = normalizeJournalTextState(state);
  const next = nextText.slice(0, MAX_JOURNAL_TEXT_LENGTH);
  if (next === current.text) return current;

  let prefixLength = 0;
  while (
    prefixLength < current.text.length &&
    prefixLength < next.length &&
    current.text[prefixLength] === next[prefixLength]
  ) {
    prefixLength += 1;
  }

  let currentSuffixStart = current.text.length;
  let nextSuffixStart = next.length;
  while (
    currentSuffixStart > prefixLength &&
    nextSuffixStart > prefixLength &&
    current.text[currentSuffixStart - 1] === next[nextSuffixStart - 1]
  ) {
    currentSuffixStart -= 1;
    nextSuffixStart -= 1;
  }

  const insertedLength = nextSuffixStart - prefixLength;
  return {
    text: next,
    sources: [
      ...current.sources.slice(0, prefixLength),
      ...Array<JournalTextSource>(insertedLength).fill("manual"),
      ...current.sources.slice(currentSuffixStart),
    ],
  };
}

export function qualifiesForJournalCompletion(state: ParticipationState): boolean {
  // Dictation describes how text arrived; it is never evidence without text.
  return state.markCount > 0 || state.textLength > 0;
}

export function recognizedPhrase(phrase: string): string | null {
  const trimmed = phrase.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function firstBlankRange(text: string): { start: number; end: number } | null {
  const match = /_{3,}/.exec(text);
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}

/**
 * Insert a frame, word, or recognized phrase at the current selection. Word
 * bank choices can prefer an authored underscore blank. Returned caret bounds
 * always fit the capped text.
 */
export function insertJournalText(
  state: JournalTextState,
  chunk: string,
  selectionStart: number,
  selectionEnd: number,
  source: JournalTextSource,
  preferBlank = false,
): TextInsertion {
  const normalizedChunk = chunk.trim();
  const current = normalizeJournalTextState(state);
  const boundedExisting = current.text;
  if (!normalizedChunk) {
    const caret = clampSelection(selectionStart, boundedExisting.length);
    return { state: current, selectionStart: caret, selectionEnd: caret };
  }

  let start = clampSelection(selectionStart, boundedExisting.length);
  let end = clampSelection(selectionEnd, boundedExisting.length);
  if (end < start) [start, end] = [end, start];

  if (preferBlank && start === end) {
    const blank = firstBlankRange(boundedExisting);
    if (blank) {
      start = blank.start;
      end = blank.end;
    }
  }

  const left = boundedExisting.slice(0, start);
  const right = boundedExisting.slice(end);
  const replacingBlank = /^_{3,}$/.test(boundedExisting.slice(start, end));
  const prefix =
    !replacingBlank && left.length > 0 && !/\s$/.test(left) && !/^[,.;!?)]/.test(normalizedChunk)
      ? " "
      : "";
  const suffix =
    !replacingBlank &&
    right.length > 0 &&
    !/^\s|^[,.;!?)]/.test(right) &&
    !/\s$/.test(normalizedChunk)
      ? " "
      : "";
  const inserted = `${prefix}${normalizedChunk}${suffix}`;
  const text = `${left}${inserted}${right}`.slice(0, MAX_JOURNAL_TEXT_LENGTH);
  const sources = [
    ...current.sources.slice(0, start),
    ...Array<JournalTextSource>(inserted.length).fill(source),
    ...current.sources.slice(end),
  ].slice(0, MAX_JOURNAL_TEXT_LENGTH);
  const caret = Math.min(left.length + prefix.length + normalizedChunk.length, text.length);
  return { state: { text, sources }, selectionStart: caret, selectionEnd: caret };
}

function normalizeJournalTextState(state: JournalTextState): JournalTextState {
  const text = state.text.slice(0, MAX_JOURNAL_TEXT_LENGTH);
  const sources = Array.from(
    { length: text.length },
    (_, index): JournalTextSource => state.sources[index] ?? "manual",
  );
  return { text, sources };
}

function clampSelection(value: number, textLength: number): number {
  if (!Number.isFinite(value)) return textLength;
  return Math.max(0, Math.min(Math.trunc(value), textLength));
}
