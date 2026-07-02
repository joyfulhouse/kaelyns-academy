"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getRewardsStateAction,
  purchaseStickerAction,
  type RewardsState,
} from "@/app/(learner)/rewards-actions";
import type { PurchaseResult } from "@/lib/rewards/stickers";

/**
 * Account-mode rewards state. Guest mode (null learnerId or signedIn:false)
 * yields state:null and the UI hides the economy entirely (spec §3.7).
 */
export function useRewards(learnerId: string | null) {
  const [state, setState] = useState<RewardsState | null>(null);

  const refresh = useCallback(() => {
    if (!learnerId) return;
    void getRewardsStateAction(learnerId).then((s) => setState(s.signedIn ? s : null));
  }, [learnerId]);

  useEffect(refresh, [refresh]);

  const purchase = useCallback(
    async (stickerId: string): Promise<PurchaseResult> => {
      if (!learnerId) return { ok: false, reason: "error" };
      const result = await purchaseStickerAction(learnerId, stickerId);
      if (result.ok) refresh();
      return result;
    },
    [learnerId, refresh],
  );

  return { state, refresh, purchase };
}
