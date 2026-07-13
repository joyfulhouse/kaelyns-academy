import { normalizeOralReading, tokenMatches } from "./oralReadingMatch";

export interface OralReadingTimestampWord {
  word: string;
  start: number;
  end: number;
  probability?: number;
}

export interface OralReadingWordState {
  state: "correct" | "unclear";
}

export interface OralReadingAlignment {
  result: "matched" | "unclear";
  perWord: OralReadingWordState[];
  wcpm: number | undefined;
  correctCount: number;
  totalWords: number;
}

const MAX_WCPM = 300;
const MIN_TIMED_SPAN_SECONDS = 0.05;

function passageWords(passage: string): string[] {
  const trimmed = passage.trim();
  return trimmed ? trimmed.split(/\s+/) : [];
}

/**
 * Find the longest in-order set of forgiving token matches. Insertions in the
 * STT output and missed target words therefore do not shift every later word.
 */
function matchedPairs(targetWords: string[], spokenWords: OralReadingTimestampWord[]): number[][] {
  const targetTokens = targetWords.map(normalizeOralReading);
  const spokenTokens = spokenWords.map(({ word }) => normalizeOralReading(word));
  const rows = targetTokens.length + 1;
  const columns = spokenTokens.length + 1;
  const lengths = Array.from({ length: rows }, () => Array<number>(columns).fill(0));

  for (let targetIndex = targetTokens.length - 1; targetIndex >= 0; targetIndex -= 1) {
    for (let spokenIndex = spokenTokens.length - 1; spokenIndex >= 0; spokenIndex -= 1) {
      lengths[targetIndex][spokenIndex] = tokenMatches(
        targetTokens[targetIndex],
        spokenTokens[spokenIndex],
      )
        ? lengths[targetIndex + 1][spokenIndex + 1] + 1
        : Math.max(lengths[targetIndex + 1][spokenIndex], lengths[targetIndex][spokenIndex + 1]);
    }
  }

  const pairs: number[][] = [];
  let targetIndex = 0;
  let spokenIndex = 0;
  while (targetIndex < targetTokens.length && spokenIndex < spokenTokens.length) {
    if (tokenMatches(targetTokens[targetIndex], spokenTokens[spokenIndex])) {
      pairs.push([targetIndex, spokenIndex]);
      targetIndex += 1;
      spokenIndex += 1;
    } else if (lengths[targetIndex + 1][spokenIndex] >= lengths[targetIndex][spokenIndex + 1]) {
      targetIndex += 1;
    } else {
      spokenIndex += 1;
    }
  }
  return pairs;
}

function wordsCorrectPerMinute(
  pairs: number[][],
  spokenWords: OralReadingTimestampWord[],
): number | undefined {
  if (pairs.length === 0) return undefined;
  const firstSpoken = spokenWords[pairs[0][1]];
  const lastSpoken = spokenWords[pairs[pairs.length - 1][1]];
  const spanSeconds = lastSpoken.end - firstSpoken.start;
  if (!Number.isFinite(spanSeconds) || spanSeconds <= MIN_TIMED_SPAN_SECONDS) return undefined;
  const measured = pairs.length / (spanSeconds / 60);
  if (!Number.isFinite(measured) || measured < 0) return undefined;
  return Math.min(MAX_WCPM, Math.round(measured));
}

/**
 * Align a known target passage to timestamped STT words. The output contains
 * derived reading evidence only: raw recognized words never leave this call.
 * Optional STT probability is deliberately ignored for correctness.
 */
export function oralReadingAlign(
  passage: string,
  spokenWords: OralReadingTimestampWord[],
): OralReadingAlignment {
  const targetWords = passageWords(passage);
  const pairs = matchedPairs(targetWords, spokenWords);
  const matchedTargetIndexes = new Set(pairs.map(([targetIndex]) => targetIndex));
  const perWord: OralReadingWordState[] = targetWords.map((_, targetIndex) => ({
    state: matchedTargetIndexes.has(targetIndex) ? "correct" : "unclear",
  }));
  const correctCount = pairs.length;
  const totalWords = targetWords.length;

  return {
    result: totalWords > 0 && correctCount === totalWords ? "matched" : "unclear",
    perWord,
    wcpm: wordsCorrectPerMinute(pairs, spokenWords),
    correctCount,
    totalWords,
  };
}
