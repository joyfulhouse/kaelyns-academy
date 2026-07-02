"use client";

import { useCallback, useEffect, useState } from "react";
import { activateQuestAction, getDailyQuestsAction } from "@/app/(learner)/rewards-actions";
import type { QuestView } from "@/lib/quests/store";

/**
 * Today's Adventures quest board state. Same shape as `useRewards` (see its
 * doc comment for the full rationale) — null for guests, fetch on mount, and
 * also on window focus so completing an activity updates the board when she
 * returns to the map.
 *
 * `quests` is DERIVED against `settledFor` (which `learnerId:programSlug`
 * pair the last resolved fetch belongs to — the same composite key
 * `useLearnerState`'s `loadedKey` uses) rather than reset via a synchronous
 * `setState` in the mount/dependency effect. That keeps every `setState`
 * call inside the fetch's `.then` (an async boundary), satisfying
 * `react-hooks/set-state-in-effect`, while guaranteeing a learner (or
 * program) switch never flashes the PREVIOUS learner's quests for even one
 * render — it reads as not-yet-settled (`quests: null`) until the new fetch
 * resolves. Callers don't need a separate "loading" branch for that: `null`
 * already means "fall back to the existing single-pick card" (guest fallback,
 * spec §4.1), so the not-yet-settled window degrades to the same safe UI a
 * true guest sees.
 */
export function useQuests(learnerId: string | null, programSlug: string) {
  const [quests, setQuests] = useState<QuestView[] | null>(null);
  const [settledFor, setSettledFor] = useState<string | null>(null);

  const key = learnerId ? `${learnerId}:${programSlug}` : null;

  const refresh = useCallback(() => {
    if (!learnerId) return;
    void getDailyQuestsAction(learnerId, programSlug).then((q) => {
      setQuests(q.length > 0 ? q : null);
      setSettledFor(`${learnerId}:${programSlug}`);
    });
  }, [learnerId, programSlug]);

  useEffect(() => {
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  const activate = useCallback(
    async (id: string) => {
      if (!learnerId) return;
      await activateQuestAction(learnerId, id);
      refresh();
    },
    [learnerId, refresh],
  );

  // "No learner → no quests" and "learner/program switch reads as
  // not-yet-settled" are both enforced here, every render — not just when
  // refresh runs.
  return {
    quests: settledFor === key ? quests : null,
    refresh,
    activate,
  };
}
