"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { getTutorSession } from "@/app/(learner)/actions";
import {
  getInterestsAction,
  setPickedInterestsAction,
  type InterestsState,
} from "@/app/(learner)/rewards-actions";
import { getKeySnapshot, subscribeKey } from "./localStore";
import { resolveAccountLearnerId } from "./learners";

/**
 * The interests picker's own account-mode resolution + board state. Unlike
 * `useRewards`/`useQuests` (which take a `learnerId` resolved by a
 * program-scoped `useLearnerState`), the picker at `/learn/interests` has no
 * program in its URL — interests aren't per-world — so this hook resolves the
 * signed-in-household/account-learner mode itself, the same way
 * `useLearnerState`'s account path does (session on mount, remembered learner
 * choice from the same `ka:account-learner` key). Guest mode has no interests
 * economy (§4.3 is account-only): `mode` stays "guest" and no fetch runs.
 *
 * Same settled-derivation idiom as `useRewards`: every `setState` happens
 * inside a `.then` (an async boundary), never synchronously in an effect, so
 * `react-hooks/set-state-in-effect` is satisfied while a learner switch still
 * reads as "not yet settled" on the very next render.
 */

const ACCOUNT_LEARNER_KEY = "ka:account-learner";

type Mode = "loading" | "account" | "guest" | "error";

/** Coerce a stored value to a remembered learner id, or null. Pure. */
function parseRemembered(raw: string | null): string | null {
  return raw && raw.length > 0 ? raw : null;
}

export function useInterests() {
  const [sessionStatus, setSessionStatus] = useState<
    "loading" | "authenticated" | "unauthenticated" | "error"
  >("loading");
  const [learnerIds, setLearnerIds] = useState<string[]>([]);
  const [state, setState] = useState<InterestsState | null>(null);
  const [settledFor, setSettledFor] = useState<string | null>(null);

  useEffect(() => {
    void getTutorSession().then((session) => {
      setSessionStatus(session.status);
      setLearnerIds(session.status === "authenticated" ? session.learners.map((l) => l.id) : []);
    });
  }, []);

  const retrySession = useCallback(async () => {
    setSessionStatus("loading");
    const session = await getTutorSession();
    setSessionStatus(session.status);
    setLearnerIds(session.status === "authenticated" ? session.learners.map((l) => l.id) : []);
  }, []);

  const remembered = useSyncExternalStore(
    useCallback((listener: () => void) => subscribeKey(ACCOUNT_LEARNER_KEY, listener), []),
    () => getKeySnapshot(ACCOUNT_LEARNER_KEY, parseRemembered),
    () => null,
  );

  let mode: Mode;
  if (sessionStatus === "loading") {
    mode = "loading";
  } else if (sessionStatus === "error") {
    mode = "error";
  } else if (sessionStatus === "authenticated" && learnerIds.length > 0) {
    mode = "account";
  } else {
    mode = "guest";
  }

  let learnerId: string | null = null;
  if (mode === "account") {
    // Same fail-closed rule as the learner surfaces: never silently pick the
    // first profile in a multi-learner household (interests would be read and
    // saved against the wrong child).
    learnerId = resolveAccountLearnerId(remembered, learnerIds);
  }

  const refresh = useCallback(() => {
    if (!learnerId) return;
    void getInterestsAction(learnerId).then((s) => {
      setState(s);
      setSettledFor(learnerId);
    });
  }, [learnerId]);

  useEffect(refresh, [refresh]);

  const save = useCallback(
    async (interestIds: string[]): Promise<boolean> => {
      if (!learnerId) return false;
      const result = await setPickedInterestsAction(learnerId, interestIds);
      if (result.ok) refresh();
      return result.ok;
    },
    [learnerId, refresh],
  );

  const current = settledFor === learnerId;
  return {
    mode,
    state: current ? state : null,
    settled: current ? settledFor !== null : false,
    // Fail-closed leftover: signed in, learners exist, but none is safely
    // resolvable (multi-learner household, no valid remembered id). The surface
    // must offer a way to pick — never an endless loading state.
    selectionRequired: mode === "account" && learnerId === null,
    save,
    retrySession,
  };
}
