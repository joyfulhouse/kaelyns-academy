"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Activity, ActivityScore, Program } from "@/content";
import { getProgram, getUnit } from "@/content";
import { applyEvidence, type SkillState } from "@/lib/tutor";
import { findUnitIdOfActivity } from "@/lib/quests/logic";
import type { EnrollmentConfig } from "@/lib/content/config";
import {
  ensureHouseholdLearner,
  getLearnerStateAction,
  getTutorSession,
  recordAttemptAction,
  type TutorLearner,
} from "@/app/(learner)/actions";
import { getKeySnapshot, subscribeKey, writeKey } from "./localStore";
import { useSkillState } from "./useSkillState";
import { useProgress } from "./useProgress";

/**
 * The learner surface's mode-picking state hook: the seam between the signed-in,
 * DB-backed experience and the signed-out, localStorage guest experience.
 *
 *  - **account mode** (a household is signed in and has >= 1 learner): mastery
 *    state + completed activities come from the account-scoped DB via server
 *    actions; `record` persists each attempt. The selected learner is a
 *    localStorage-remembered choice among the account's real learners.
 *  - **guest mode** (not signed in): delegates entirely to the existing
 *    localStorage hooks (`useSkillState` + `useProgress`) — unchanged behavior.
 *
 * React rules: every hook below is called unconditionally (the guest hooks run
 * even in account mode; we just don't read them there). The session + DB reads
 * use plain effects that set state from the *result* of an awaited action,
 * guarded by a mounted ref — they don't read an external store in an effect, so
 * they satisfy `react-hooks/set-state-in-effect`. Optimistic merges keep the
 * kid UI snappy; a refetch then reconciles with the server's derived outcome.
 */

type LearnerMode = "loading" | "account" | "guest";

/** A learner as the surface renders it (covers both real DB + mock guests). */
export interface SurfaceLearner {
  id: string;
  displayName: string;
  avatar: string;
}

export interface UseLearnerState {
  /** Current mastery state (engine `SkillState`) for the active learner. */
  skillState: SkillState;
  /** Authored activity ids the active learner has completed. */
  completed: Set<string>;
  /** Best stars earned for an authored activity (0 if never completed). */
  getStars: (activityId: string) => 0 | 1 | 2 | 3;
  /** True once the active learner's state has been read (SSR/async-safe gate). */
  ready: boolean;
  /** Which surface we resolved to (drives picker + record path). */
  mode: LearnerMode;
  /**
   * True when a household is signed in, even if it has no learner yet. Lets the
   * picker offer "set up a profile" (via {@link UseLearnerState.setupProfile})
   * before falling back to guest play.
   */
  signedIn: boolean;
  /** The account's real learners (empty in guest mode). */
  learners: SurfaceLearner[];
  /** The active learner id (account mode) or null until resolved. */
  selectedLearnerId: string | null;
  /** Choose a different account learner (remembered across pages). */
  selectLearner: (id: string) => void;
  /**
   * Create a default learner for a signed-in household with no profile yet, then
   * switch into account mode. No-op (resolves false) when not signed in or on
   * failure, so the caller can fall back to guest play.
   */
  setupProfile: () => Promise<boolean>;
  /**
   * Record one completed activity: DB in account mode, localStorage in guest.
   * Pass `{ generated: true }` for AI practice items — they fold skill evidence
   * but are not tracked as authored star progress / completion. For a generated
   * item, pass `gen` (the provenance echoed by /api/practice) so the attempt
   * records which model/route/when produced it (P6 / §8). Ignored in guest mode.
   *
   * A generated SHELF item (Adventure 2.0 B3) passes `{ generated: true, gen,
   * shelfItemId }`: `shelfItemId` is the generated id, and its presence ALSO
   * drives the optimistic completed/best-stars update keyed by that id (a shelf
   * item is a durable, one-time earner — unlike in-session "More" practice).
   */
  record: (
    activity: Activity,
    response: unknown,
    score: ActivityScore,
    opts?: {
      generated?: boolean;
      gen?: { model: string; route: string; at: string };
      shelfItemId?: string;
    },
  ) => void;
  /**
   * The parent-set per-child, per-program enrollment config. Empty object in
   * guest mode or when no config has been set. Clients read this to apply
   * activeUnitKeys curation, AI-practice gating, band defaults, and dailyGoal.
   */
  config: EnrollmentConfig;
  /**
   * The active learner's RESOLVED (version-pinned) program tree (C#5), as scoped
   * by {@link getLearnerStateAction}. Non-null only in account mode once the
   * matching state has loaded; null in guest/loading mode and until the pinned
   * tree resolves — the caller falls back to the server-passed published prop in
   * that window so the map never blanks/flickers.
   */
  program: Program | null;
  /**
   * Account-mode curation signal (Fix-F A3): whether the active learner may play
   * this program — true ONLY when they have an ACTIVE enrollment for the slug
   * (from {@link getLearnerStateAction}). When false in account mode, the surface
   * renders the calm "ask a grown-up to add this" state instead of the map.
   *
   * Guest mode is ALWAYS `true` (guests have no enrollments and play every
   * published program). During the loading beat it is `true` too, so the surface
   * shows the loading state — NOT a flash of the block — until account state
   * loads (paired with the `loadedForActive` guard).
   */
  available: boolean;
}

/** Remembered account-learner choice (distinct from the guest active-learner key). */
const ACCOUNT_LEARNER_KEY = "ka:account-learner";

const EMPTY_STATE: SkillState = Object.freeze({}) as SkillState;
const EMPTY_COMPLETED: ReadonlySet<string> = new Set();

function clampStars(value: number): 0 | 1 | 2 | 3 {
  if (!Number.isFinite(value)) return 0;
  const r = Math.round(value);
  if (r <= 0) return 0;
  if (r >= 3) return 3;
  return r as 1 | 2;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The remembered account-learner id from storage (pure; snapshot-cache safe). */
function readRememberedAccountLearner(raw: string | null): string | null {
  return raw && raw.length > 0 ? raw : null;
}

export function useLearnerState(guestLearnerId: string, programSlug: string): UseLearnerState {
  // ── Guest path (always mounted; only read when mode === "guest") ──────────
  // Both guest hooks are program-scoped by their localStorage key, so passing the
  // active program's slug is all guest mode needs to keep worlds separate.
  const guestSkill = useSkillState(guestLearnerId, programSlug);
  const guestProgress = useProgress(guestLearnerId, programSlug);
  // These callbacks are stable (each guest hook memoizes them), so depending on
  // them keeps `record`'s identity stable across renders.
  const { record: guestRecord } = guestSkill;
  const { complete: guestComplete } = guestProgress;

  // ── Session resolution ────────────────────────────────────────────────────
  // `signedIn` is null until the session resolves (the "loading" beat); the
  // learners list is what determines account vs guest mode (spec: account needs
  // at least one learner). Both are set from the awaited action result.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [learners, setLearners] = useState<SurfaceLearner[]>([]);

  // The remembered account-learner choice (external store, no setState-in-effect).
  const rememberedAccountLearner = useSyncExternalStore(
    useCallback((listener: () => void) => subscribeKey(ACCOUNT_LEARNER_KEY, listener), []),
    () => getKeySnapshot(ACCOUNT_LEARNER_KEY, readRememberedAccountLearner),
    () => null,
  );

  // ── Account DB state (set from awaited action results, never an effect-store) ─
  const [accountSkill, setAccountSkill] = useState<SkillState>(EMPTY_STATE);
  const [accountCompleted, setAccountCompleted] = useState<Set<string>>(new Set());
  const [accountStars, setAccountStars] = useState<Record<string, 0 | 1 | 2 | 3>>({});
  const [accountConfig, setAccountConfig] = useState<EnrollmentConfig>({});
  // The resolved (version-pinned) program tree for the loaded (learner, program).
  // Set from the same action result as the state above, so the rendered map and
  // the scoped progress are guaranteed the same version (C#5).
  const [accountProgram, setAccountProgram] = useState<Program | null>(null);
  // Whether the loaded (learner, program) is playable (active enrollment) — the
  // server's curation signal (Fix-F A3). Set from the same action result.
  const [accountAvailable, setAccountAvailable] = useState(false);
  // Which (learner, program) the loaded DB state belongs to (null = nothing
  // loaded yet). `ready` is derived from this matching the active learner +
  // program, so switching either shows a brief loading beat (not stale data)
  // without a synchronous setState to "reset" readiness.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Resolve the session: load it on mount and expose a refresh for setupProfile.
  const refreshSession = useCallback(async () => {
    const session = await getTutorSession();
    if (!mountedRef.current) return session;
    setSignedIn(session.signedIn);
    setLearners(
      session.learners.map((l: TutorLearner) => ({
        id: l.id,
        displayName: l.displayName,
        avatar: l.avatar,
      })),
    );
    return session;
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  // Mode + active learner are DERIVED (not stored), so there is no synchronous
  // setState-in-effect: account when signed in with >= 1 learner; otherwise the
  // localStorage guest surface (covers signed-out AND signed-in-with-no-profile,
  // which the picker then offers to set up).
  const mode: LearnerMode =
    signedIn === null ? "loading" : signedIn && learners.length > 0 ? "account" : "guest";
  const selectedLearnerId =
    mode === "account"
      ? learners.some((l) => l.id === rememberedAccountLearner)
        ? rememberedAccountLearner
        : learners[0].id
      : mode === "guest"
        ? guestLearnerId
        : null;

  // Load (and reload) the selected account learner's DB state for this program.
  // The first statement is an await, so every setState below runs post-await
  // (async), satisfying react-hooks/set-state-in-effect.
  const reloadToken = useRef(0);
  const loadAccountState = useCallback(
    async (learnerId: string, slug: string) => {
      const token = ++reloadToken.current;
      const { skillState, completedActivityIds, starsByActivity, config, program, available } =
        await getLearnerStateAction(learnerId, slug);
      // Stale-response guard: ignore all but the latest in-flight load.
      if (!mountedRef.current || token !== reloadToken.current) return;
      setAccountSkill(skillState);
      setAccountCompleted(new Set(completedActivityIds));
      // Server best-stars become the source of truth on load; this also clears
      // any optimistic stars from a prior learner/program so glyphs match.
      setAccountStars(starsByActivity as Record<string, 0 | 1 | 2 | 3>);
      setAccountConfig(config);
      // The resolved (pinned) tree for this load. Null on unauth/failure/unknown
      // slug → the caller keeps showing the server-passed published prop.
      setAccountProgram(program);
      // The curation signal for this load (Fix-F A3): false → not playable, the
      // surface shows the calm "ask a grown-up" state in account mode.
      setAccountAvailable(available);
      setLoadedKey(`${learnerId}:${slug}`);
    },
    [],
  );

  // Fetch DB state whenever the active account learner OR program changes (an
  // awaited action sets state from its result — not an external-store read in an
  // effect). NO lazy auto-enroll-on-open (Fix-F A1): opening a program must not
  // self-activate it. A learner only plays programs with a pre-existing active
  // enrollment (the pilot default + parent assignments); getLearnerStateAction
  // returns available:false for anything else, and the surface renders the calm
  // "ask a grown-up" state instead.
  const accountLearnerToLoad = mode === "account" ? selectedLearnerId : null;
  useEffect(() => {
    if (!accountLearnerToLoad) return;
    void loadAccountState(accountLearnerToLoad, programSlug);
  }, [accountLearnerToLoad, programSlug, loadAccountState]);

  const selectLearner = useCallback((id: string) => {
    writeKey(ACCOUNT_LEARNER_KEY, id);
  }, []);

  const setupProfile = useCallback<UseLearnerState["setupProfile"]>(async () => {
    const learner = await ensureHouseholdLearner();
    if (!learner) return false;
    writeKey(ACCOUNT_LEARNER_KEY, learner.id);
    await refreshSession();
    return true;
  }, [refreshSession]);

  // ── Unified record ────────────────────────────────────────────────────────
  const record = useCallback<UseLearnerState["record"]>(
    (activity, response, score, opts) => {
      const generated = opts?.generated ?? false;
      if (mode === "account" && selectedLearnerId) {
        const day = today();
        // Optimistic merge so the reward + map update immediately… EXCEPT the
        // skill_state merge for a checkpoint-unit activity: the server
        // deliberately does NOT write skill_state for a checkpoint attempt (it
        // folds into checkpoint_result instead, gated behind a parent applying
        // the placement), so merging it here would flash a fabricated
        // solid/emerging skill until the reconcile fetch below corrects it back
        // down — a visible violation of "nothing changes until a parent applies."
        // Resolved from the loaded program tree with the SAME resolver the
        // server action uses (findUnitIdOfActivity + getUnit); when the tree
        // hasn't resolved yet, fall back to merging — the reconcile still
        // corrects it either way.
        const unitId = accountProgram ? findUnitIdOfActivity(accountProgram, activity.id) : null;
        const unit = accountProgram && unitId ? getUnit(accountProgram, unitId) : undefined;
        const isCheckpointActivity = unit?.checkpoint != null;
        if (!isCheckpointActivity) {
          setAccountSkill((prev) => applyEvidence(prev, score.skillEvidence, day));
        }
        // Authored completion OR a generated SHELF item (B3, signalled by
        // opts.shelfItemId) optimistically flips completed + best-stars, keyed by
        // activity.id (which IS the generated id for a shelf item). In-session
        // "More" practice (generated, no shelfItemId) folds evidence only — it is
        // not a durable, trackable completion. The C1 checkpoint-skip guard above
        // is untouched: a shelf item is never in a checkpoint unit.
        if (!generated || opts?.shelfItemId) {
          setAccountCompleted((prev) =>
            prev.has(activity.id) ? prev : new Set(prev).add(activity.id),
          );
          setAccountStars((prev) => {
            const best = prev[activity.id] ?? 0;
            const next = clampStars(score.stars);
            return next > best ? { ...prev, [activity.id]: next } : prev;
          });
        }
        // …then persist and refetch to reconcile the server's derived outcome.
        void (async () => {
          await recordAttemptAction({
            learnerId: selectedLearnerId,
            programSlug,
            activityId: activity.id,
            kind: activity.kind,
            generated,
            response,
            score: {
              correct: score.correct,
              total: score.total,
              stars: score.stars,
              skillEvidence: score.skillEvidence,
            },
            // Relay generation provenance (P6 / §8). Only present for generated
            // items; the action ignores it for authored ones.
            ...(generated && opts?.gen ? { gen: opts.gen } : undefined),
          });
          if (mountedRef.current) await loadAccountState(selectedLearnerId, programSlug);
        })();
        return;
      }
      // Guest mode: localStorage only. Generated practice records evidence but
      // not star progress (it isn't an authored, trackable activity).
      guestRecord(score.skillEvidence);
      if (!generated) guestComplete(activity.id, score.stars);
    },
    [mode, selectedLearnerId, programSlug, accountProgram, loadAccountState, guestRecord, guestComplete],
  );

  // ── Project the active view based on mode ─────────────────────────────────
  if (mode === "account") {
    // The loaded state is for the active (learner, program) only when the keys
    // match — same gate as `ready`. While they don't (initial load or a switch),
    // expose program: null so the caller keeps the published prop on screen
    // rather than the prior world's pinned tree (no flicker, no stale map).
    const loadedForActive = loadedKey === `${selectedLearnerId}:${programSlug}`;
    return {
      skillState: accountSkill,
      completed: accountCompleted,
      getStars: (id) => accountStars[id] ?? 0,
      // Ready only once the loaded state belongs to the active learner AND
      // program (so a learner OR world switch shows a brief loading beat, not
      // the prior kid's/world's data).
      ready: loadedForActive,
      mode,
      signedIn: true,
      learners,
      selectedLearnerId,
      selectLearner,
      setupProfile,
      record,
      config: accountConfig,
      program: loadedForActive ? accountProgram : null,
      // Curation (Fix-F A3): only enforce once the loaded state belongs to the
      // active (learner, program). While loading (!loadedForActive) report
      // `true` so the surface shows the loading beat, not a flash of the block
      // (paired with `ready` above); once loaded, the server's signal governs.
      available: loadedForActive ? accountAvailable : true,
    };
  }

  if (mode === "guest") {
    const completed = new Set<string>();
    if (guestProgress.ready) {
      // useProgress tracks completion via key presence; surface it as a set.
      for (const id of completedFromProgress(guestProgress, programSlug)) completed.add(id);
    }
    return {
      skillState: guestSkill.skillState,
      completed,
      getStars: guestProgress.getStars,
      ready: guestSkill.ready && guestProgress.ready,
      mode,
      signedIn: signedIn === true,
      learners: [],
      selectedLearnerId: guestLearnerId,
      selectLearner,
      setupProfile,
      record,
      config: {},
      // Guest mode renders entirely from the server-passed published prop.
      program: null,
      // Guests have no enrollments and play every published program — curation
      // is account-mode only, so guest mode is always available.
      available: true,
    };
  }

  // loading
  return {
    skillState: EMPTY_STATE,
    completed: EMPTY_COMPLETED as Set<string>,
    getStars: () => 0,
    ready: false,
    mode,
    signedIn: false,
    learners: [],
    selectedLearnerId: null,
    selectLearner,
    setupProfile,
    record,
    config: {},
    program: null,
    // During the loading beat, report available so the surface shows the loading
    // state — not a flash of the "ask a grown-up" block — until mode resolves.
    available: true,
  };
}

/**
 * `useProgress` exposes completion via `isComplete(id)` rather than a set, so to
 * build the completed set the caller must probe per activity. Guest completion
 * is read against the active program's activities (resolved from the registry by
 * its slug), so the set only ever holds ids from the world the kid is in.
 */
function completedFromProgress(
  progress: ReturnType<typeof useProgress>,
  programSlug: string,
): string[] {
  const out: string[] = [];
  const program = getProgram(programSlug);
  if (!program) return out;
  for (const unit of program.units) {
    for (const lesson of unit.lessons) {
      for (const activity of lesson.activities) {
        if (progress.isComplete(activity.id)) out.push(activity.id);
      }
    }
  }
  return out;
}
