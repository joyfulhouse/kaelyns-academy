/** Pure star-economy rules (unit-tested; no DB). */

export function sumLedger(deltas: number[]): number {
  return deltas.reduce((n, d) => n + d, 0);
}

/**
 * v1 economy rule: ledger stars are earned ONLY on the FIRST completion of an
 * AUTHORED activity (grind-proof by construction; quests + checkpoints are the
 * repeatable earners). Returns the delta to credit (0 = write nothing).
 */
export function earnedStarsForAttempt(input: {
  generated: boolean;
  stars: number;
  alreadyCompleted: boolean;
}): number {
  if (input.generated || input.alreadyCompleted) return 0;
  return Math.max(0, Math.min(3, Math.trunc(input.stars)));
}
