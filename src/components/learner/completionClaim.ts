export interface CompletionClaim {
  requestKey: string;
  completionId: string;
}

/**
 * Claim the first completion emitted by one mounted player identity. React
 * state does not update until after the current event turn, so a ref-backed
 * claim closes the gap where two rapid callbacks could mint distinct retry
 * tokens and persist the same visible completion twice.
 */
export function claimPlayerCompletion(
  current: CompletionClaim | null,
  requestKey: string | null,
): CompletionClaim | null {
  if (!requestKey || current?.requestKey === requestKey) return null;
  return { requestKey, completionId: globalThis.crypto.randomUUID() };
}
