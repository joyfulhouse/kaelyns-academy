export const MAX_JOURNAL_TEXT_LENGTH = 2_000;
export const MAX_JOURNAL_MARKS = 200;

interface ParticipationState {
  markCount: number;
  textLength: number;
  usedDictation: boolean;
}

export interface TextInsertion {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

/**
 * Count only what follows an authored starter. The Player renders its starter
 * separately, but this keeps the evidence rule correct for legacy callers too.
 */
export function contributedTextLength(text: string, sentenceStarter = ""): number {
  const contribution = text.trim();
  const starter = sentenceStarter.trim();
  if (!starter) return Math.min(contribution.length, MAX_JOURNAL_TEXT_LENGTH);
  if (contribution === starter) return 0;
  if (contribution.startsWith(starter)) {
    return Math.min(
      contribution.slice(starter.length).trim().length,
      MAX_JOURNAL_TEXT_LENGTH,
    );
  }
  return Math.min(contribution.length, MAX_JOURNAL_TEXT_LENGTH);
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
  existing: string,
  chunk: string,
  selectionStart: number,
  selectionEnd: number,
  preferBlank = false,
): TextInsertion {
  const normalizedChunk = chunk.trim();
  const boundedExisting = existing.slice(0, MAX_JOURNAL_TEXT_LENGTH);
  if (!normalizedChunk) {
    const caret = clampSelection(selectionStart, boundedExisting.length);
    return { text: boundedExisting, selectionStart: caret, selectionEnd: caret };
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
  const caret = Math.min(left.length + prefix.length + normalizedChunk.length, text.length);
  return { text, selectionStart: caret, selectionEnd: caret };
}

function clampSelection(value: number, textLength: number): number {
  if (!Number.isFinite(value)) return textLength;
  return Math.max(0, Math.min(Math.trunc(value), textLength));
}
