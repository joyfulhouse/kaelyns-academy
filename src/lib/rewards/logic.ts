/** Pure star-economy rules (unit-tested; no DB). */

export function sumLedger(deltas: number[]): number {
  return deltas.reduce((n, d) => n + d, 0);
}

/**
 * v1 economy rule: ledger stars are earned ONLY on the FIRST completion of an
 * AUTHORED activity (grind-proof by construction; quests + checkpoints are the
 * repeatable earners). Returns the delta to credit (0 = write nothing).
 *
 * A generated SHELF item (Adventure 2.0 B3) is the one exception: it IS generated
 * yet is a durable, server-verified, one-time earner, so `shelfEligible` lifts the
 * generated short-circuit. It still earns exactly once — `alreadyCompleted` (the
 * caller's prior-attempt witness) gates the repeat. When `shelfEligible` is falsy
 * the result is byte-identical to the authored/in-session-practice rule.
 */
export function earnedStarsForAttempt(input: {
  generated: boolean;
  stars: number;
  alreadyCompleted: boolean;
  /** Server-derived shelf-ownership witness (B3): a generated item that earns
   *  once. Never client-supplied — the caller sets it only after verifying the
   *  activity is a real shelf row owned by the learner. */
  shelfEligible?: boolean;
}): number {
  if (input.alreadyCompleted) return 0;
  if (input.generated && input.shelfEligible !== true) return 0;
  return Math.max(0, Math.min(3, Math.trunc(input.stars)));
}
