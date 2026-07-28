/** Words per minute at the standard five-character word. */
const CHARS_PER_WORD = 5;
/** No child types this fast; a higher number means a bogus client clock. */
const MAX_PLAUSIBLE_WPM = 200;

/**
 * Clockless by construction — the caller passes the elapsed span, so this is
 * unit-testable and cannot drift with the machine clock. Client-measured and
 * therefore INDICATIVE ONLY: display it, chart it, never let it reach `score()`.
 */
export function wpm(chars: number, elapsedMs: number): number {
  if (elapsedMs <= 0 || chars <= 0) return 0;
  const rate = chars / CHARS_PER_WORD / (elapsedMs / 60_000);
  return Math.min(MAX_PLAUSIBLE_WPM, Math.round(rate));
}
