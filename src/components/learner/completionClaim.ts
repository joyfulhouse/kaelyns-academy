export interface CompletionClaim {
  requestKey: string;
  completionId: string;
}

interface CompletionPhaseIdentity {
  kind: string;
  requestKey?: string;
  completionId?: string;
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

/** Apply an async save result only while that exact completion is still the
 * active saving phase. A response from an older learner/activity identity must
 * not replace a newer identity's saving, retry, or reward UI. */
export function settlePlayerCompletion<Phase extends CompletionPhaseIdentity>(
  current: Phase,
  expected: Pick<CompletionClaim, "requestKey" | "completionId">,
  settled: Phase,
): Phase {
  return current.kind === "saving" &&
    current.requestKey === expected.requestKey &&
    current.completionId === expected.completionId
    ? settled
    : current;
}
