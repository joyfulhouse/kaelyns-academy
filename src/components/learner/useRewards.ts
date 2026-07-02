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
 *
 * `getRewardsStateAction` swallows transient failures into a signedIn:false
 * shape, which this hook maps to `state:null` — indistinguishable from "still
 * loading" unless callers also check `settled`. `settled` flips true once the
 * in-flight fetch resolves (success or swallowed failure), so a caller can
 * tell "loading" (`!settled`) apart from "fetch failed, offer retry"
 * (`settled && !state`), instead of dead-ending on a spinner forever.
 *
 * The exposed `state`/`settled` are DERIVED against `settledFor` (which
 * learnerId the last resolved fetch belongs to), rather than reset via a
 * synchronous `setState` in the mount/dependency effect — same idiom as
 * useLearnerState's `loadedKey`. That keeps every setState call inside the
 * fetch's `.then` (an async boundary), satisfying
 * `react-hooks/set-state-in-effect`, while still enforcing "no learner → no
 * state" the instant `learnerId` goes null and resetting `settled` the
 * instant `learnerId` changes to a different learner — both take effect on
 * the very next render, no extra effect tick needed.
 */
export function useRewards(learnerId: string | null) {
  const [state, setState] = useState<RewardsState | null>(null);
  const [settledFor, setSettledFor] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!learnerId) return;
    void getRewardsStateAction(learnerId).then((s) => {
      setState(s.signedIn ? s : null);
      setSettledFor(learnerId);
    });
  }, [learnerId]);

  useEffect(() => {
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  const purchase = useCallback(
    async (stickerId: string): Promise<PurchaseResult> => {
      if (!learnerId) return { ok: false, reason: "error" };
      const result = await purchaseStickerAction(learnerId, stickerId);
      if (result.ok) refresh();
      return result;
    },
    [learnerId, refresh],
  );

  // "No learner → no state" and "learner switch reads as not-yet-settled"
  // are both enforced here, every render — not just when refresh runs.
  const current = settledFor === learnerId;
  return {
    state: current ? state : null,
    settled: current ? settledFor !== null : false,
    refresh,
    purchase,
  };
}
