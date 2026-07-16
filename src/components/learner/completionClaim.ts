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
 * Mint a server-valid (RFC 4122) completion id in EVERY browser context.
 * `crypto.randomUUID` exists only in secure contexts (https / localhost) — on a
 * plain-http origin (a LAN device, the CI e2e container) it is undefined and a
 * bare call would throw inside the completion click handler, silently stranding
 * the child before the reward screen. `getRandomValues` has no such restriction,
 * so fall back to a spec-correct v4 built from it.
 */
function mintCompletionId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID();
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
  return { requestKey, completionId: mintCompletionId() };
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
