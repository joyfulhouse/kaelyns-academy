export type OralReadingMatchResult = "matched" | "unclear" | "no-speech";

const HOMOPHONE_GROUPS = [
  ["to", "too", "two", "2"],
  ["there", "their", "theyre"],
  ["no", "know"],
  ["for", "four", "4"],
  ["one", "won", "1"],
  ["see", "sea"],
  ["be", "bee"],
  ["hi", "high"],
  ["ate", "eight", "8"],
  ["red", "read"],
  ["zero", "oh", "0"],
  ["three", "3"],
  ["five", "5"],
  ["six", "6"],
  ["seven", "7"],
  ["nine", "9"],
  ["ten", "10"],
] as const;

const HOMOPHONE_CANONICAL = new Map<string, string>(
  HOMOPHONE_GROUPS.flatMap((group) => group.map((word) => [word, group[0]] as const)),
);

const NUMBER_WORDS = new Map<string, string>([
  ["zero", "0"],
  ["one", "1"],
  ["two", "2"],
  ["three", "3"],
  ["four", "4"],
  ["five", "5"],
  ["six", "6"],
  ["seven", "7"],
  ["eight", "8"],
  ["nine", "9"],
  ["ten", "10"],
]);

/** Lowercase, strip punctuation, collapse whitespace, and fold number words. */
export function normalizeOralReading(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!normalized) return "";
  return normalized
    .split(/\s+/)
    .map((word) => NUMBER_WORDS.get(word) ?? word)
    .join(" ");
}

function words(value: string): string[] {
  const tokenized = normalizeOralReading(value);
  return tokenized ? tokenized.split(/\s+/) : [];
}

function containsPhrase(haystack: string, needle: string): boolean {
  return (
    haystack === needle ||
    haystack.startsWith(`${needle} `) ||
    haystack.endsWith(` ${needle}`) ||
    haystack.includes(` ${needle} `)
  );
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let aIndex = 1; aIndex <= a.length; aIndex += 1) {
    const current = [aIndex];
    for (let bIndex = 1; bIndex <= b.length; bIndex += 1) {
      const substitution = previous[bIndex - 1] + (a[aIndex - 1] === b[bIndex - 1] ? 0 : 1);
      current[bIndex] = Math.min(previous[bIndex] + 1, current[bIndex - 1] + 1, substitution);
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * Compare a bounded STT transcript with the authored target. This function is
 * pure and returns only the child-safe tri-state; callers must discard the raw
 * transcript after this check.
 */
/**
 * A single spoken token counts as the target token when it is the same word,
 * a homophone, or — only for longer words where one edit really is a
 * near-miss pronunciation — within a length-scaled edit distance. Short
 * sight-words have unrelated one-edit neighbours everywhere ("to"→"go",
 * "the"→"she", "and"→"end"), so below five letters only exact/homophone may
 * match.
 */
export function tokenMatches(targetWord: string, spokenWord: string): boolean {
  if (targetWord === spokenWord) return true;
  const canonicalTarget = HOMOPHONE_CANONICAL.get(targetWord) ?? targetWord;
  const canonicalSpoken = HOMOPHONE_CANONICAL.get(spokenWord) ?? spokenWord;
  if (canonicalTarget === canonicalSpoken) return true;
  if (targetWord.length < 5) return false;
  const distanceLimit = Math.max(1, Math.floor(targetWord.length / 4));
  return levenshtein(targetWord, spokenWord) <= distanceLimit;
}

export function matchOralReading(
  target: string,
  transcript: string,
): OralReadingMatchResult {
  const normalizedTarget = normalizeOralReading(target);
  const normalizedTranscript = normalizeOralReading(transcript);
  if (!normalizedTranscript) return "no-speech";
  if (!normalizedTarget) return "unclear";

  const targetWords = words(target);
  const transcriptWords = words(transcript);

  // Accept the target surrounded by a little extra speech ("um, the") — but a
  // long utterance that merely CONTAINS the target ("I did not say the") is
  // not a reading of it, so cap the surplus at two extra words.
  if (
    transcriptWords.length <= targetWords.length + 2 &&
    containsPhrase(normalizedTranscript, normalizedTarget)
  ) {
    return "matched";
  }

  // Otherwise every target word must be read: same word count, and each
  // spoken token must match its counterpart. This stops a one-edit slip on a
  // compact phrase ("we can" → "we ran") that whole-string distance allowed.
  if (targetWords.length !== transcriptWords.length) return "unclear";
  return targetWords.every((word, index) => tokenMatches(word, transcriptWords[index]))
    ? "matched"
    : "unclear";
}
