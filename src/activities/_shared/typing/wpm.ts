/** Standard words-per-minute: a "word" is 5 characters. Pure and clockless —
 *  the caller passes elapsed ms — so the race Player can show a live rate and
 *  the slice-3 parent panel can chart it from recorded responses. */
export function wpm(chars: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return Math.round(chars / 5 / (elapsedMs / 60_000));
}
