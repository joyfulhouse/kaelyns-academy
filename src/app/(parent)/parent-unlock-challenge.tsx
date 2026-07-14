import { PinChallenge } from "@/components/parent/PinChallenge";
import { parentPinRequiresChallenge } from "@/lib/parent-pin-gate";
import { requireAccount } from "@/lib/tenancy";

/**
 * Page-level PIN gate for Next.js soft navigations, where the shared parent
 * layout can remain mounted and therefore does not re-run its fast-path gate.
 */
export async function parentUnlockChallenge() {
  const { accountId } = await requireAccount();
  return (await parentPinRequiresChallenge(accountId)) ? <PinChallenge /> : null;
}
