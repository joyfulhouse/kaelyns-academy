"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Activity, Program } from "@/content";
import { getProgram } from "@/content";
import type { SkillState } from "@/lib/tutor";
import { parseAndScoreActivity } from "@/activities/server-verification";
import type { LearnerSurfaceConfig } from "@/lib/content/config";
// Type-only import (erased at build): the store is server-only, but its
// client-safe ShelfItem shape crosses the server→client boundary via
// getLearnerStateAction — same pattern as GeneratedPracticeHost (Task 4).
import type { DueReview, ShelfItem } from "@/lib/tutor/store";
import {
  ensureHouseholdLearner,
  getLearnerStateAction,
  getTutorSession,
  recordAttemptAction,
  type RecordResult,
  type TutorLearner,
  type TutorSession,
} from "@/app/(learner)/actions";
import { getKeySnapshot, subscribeKey, writeKey } from "./localStore";
import { resolveAccountLearnerId } from "./learners";
import { recordingDestination, resolveLearnerMode, type LearnerMode } from "./learnerAccess";
import { useSkillState } from "./useSkillState";
import { useProgress } from "./useProgress";

/**
 * The learner surface's mode-picking state hook: the seam between the signed-in,
 * DB-backed experience and the signed-out, localStorage guest experience.
 *
 *  - **account mode** (a household is signed in): learner onboarding stays on
 *    the saved surface; once a learner is selected, mastery state + completed
 *    activities come from the account-scoped DB and `record` persists attempts.
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

/** A learner as the surface renders it (covers both real DB + mock guests). */
interface SurfaceLearner {
  id: string;
  displayName: string;
  avatar: string;
}

export interface UseLearnerState {
  /** Current mastery state (engine `SkillState`) for the active learner. */
  skillState: SkillState;
  /** Authored activity ids the active learner has completed. */
  completed: Set<string>;
  /** Best stars earned for an activity — authored OR a played generated shelf
   *  item (0 if never completed). */
  getStars: (activityId: string) => 0 | 1 | 2 | 3;
  /** True once the active learner's state has been read (SSR/async-safe gate). */
  ready: boolean;
  /** Which surface we resolved to (drives picker + record path). */
  mode: LearnerMode;
  /**
   * True when a household is signed in, even if it has no learner yet. Lets the
   * picker offer "set up a profile" via {@link UseLearnerState.setupProfile}.
   */
  signedIn: boolean;
  /** The account's real learners (empty in guest mode). */
  learners: SurfaceLearner[];
  /** The active learner id (account mode) or null until resolved. */
  selectedLearnerId: string | null;
  /** Choose a different account learner (remembered across pages). */
  selectLearner: (id: string) => void;
  /** Retry session resolution after an auth, database, or service failure. */
  retrySession: () => Promise<void>;
  /**
   * Create a default learner for a signed-in household with no profile yet, then
   * switch into account mode. No-op (resolves false) when not signed in or on
   * failure; account mode remains fail-closed on the onboarding surface.
   */
  setupProfile: () => Promise<boolean>;
  /**
   * Record one completed activity. Account mode sends identifiers + response
   * facts and waits for the server's canonical score; guest mode parses/scores
   * through the same pure definition before touching localStorage.
   */
  record: (
    activity: Activity,
    response: unknown,
    source: { unitKey: string } | { generatedActivityId: string },
  ) => Promise<RecordResult>;
  /**
   * The parent-set per-child, per-program enrollment config. Empty object in
   * guest mode or when no config has been set. Clients read this to apply
   * activeUnitKeys curation, AI-practice gating, band defaults, and dailyGoal.
   */
  config: LearnerSurfaceConfig;
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
  /**
   * The active learner's durable AI-generated "fresh practice" shelf for this
   * program (Adventure 2.0 B3), oldest-first. Account mode only; always `[]` in
   * guest/loading mode (§8: guests never fetch or render a shelf).
   */
  generatedShelf: ShelfItem[];
  /** Due authored activities for the low-pressure Warm-up row. */
  dueReviews: DueReview[];
  /**
   * Re-read the account state (incl. the shelf) so the surface picks up freshly
   * generated items — called after a "More like this" generation resolves. No-op
   * outside account mode.
   */
  refreshShelf: () => Promise<void>;
}

/** Remembered account-learner choice (distinct from the guest active-learner key). */
const ACCOUNT_LEARNER_KEY = "ka:account-learner";

const EMPTY_STATE: SkillState = Object.freeze({}) as SkillState;
const EMPTY_COMPLETED: ReadonlySet<string> = new Set();
/** Stable empty shelf so guest/loading returns keep a referentially-stable []. */
const EMPTY_SHELF: ShelfItem[] = Object.freeze([]) as unknown as ShelfItem[];
const EMPTY_DUE_REVIEWS: DueReview[] = Object.freeze([]) as unknown as DueReview[];

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
  // Operational failures remain distinct from signed-out guest mode so account
  // progress can never silently fall back to localStorage.
  const [sessionStatus, setSessionStatus] = useState<TutorSession["status"] | "loading">(
    "loading",
  );
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
  const [accountConfig, setAccountConfig] = useState<LearnerSurfaceConfig>({});
  // The active learner's generated "fresh practice" shelf (B3), set from the same
  // action result. Empty until account state loads / in guest mode.
  const [accountShelf, setAccountShelf] = useState<ShelfItem[]>(EMPTY_SHELF);
  const [accountDueReviews, setAccountDueReviews] = useState<DueReview[]>(EMPTY_DUE_REVIEWS);
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
    setSessionStatus(session.status);
    setLearners(
      (session.status === "authenticated" ? session.learners : []).map((l: TutorLearner) => ({
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

  const retrySession = useCallback(async () => {
    setSessionStatus("loading");
    await refreshSession();
  }, [refreshSession]);

  // Mode + active learner are DERIVED (not stored), so there is no synchronous
  // setState-in-effect. Signed-in households always stay in account mode, even
  // before their first learner is created, so they can never enter local play.
  const mode = resolveLearnerMode(sessionStatus);
  const selectedLearnerId =
    mode === "account"
      ? resolveAccountLearnerId(
          rememberedAccountLearner,
          learners.map((learner) => learner.id),
        )
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
      const {
        skillState,
        completedActivityIds,
        starsByActivity,
        generatedShelf,
        dueReviews,
        config,
        program,
        available,
      } = await getLearnerStateAction(learnerId, slug);
      // Stale-response guard: ignore all but the latest in-flight load.
      if (!mountedRef.current || token !== reloadToken.current) return;
      setAccountSkill(skillState);
      setAccountCompleted(new Set(completedActivityIds));
      // Server best-stars become the source of truth on load; this also clears
      // any optimistic stars from a prior learner/program so glyphs match.
      setAccountStars(starsByActivity as Record<string, 0 | 1 | 2 | 3>);
      setAccountShelf(generatedShelf);
      setAccountDueReviews(dueReviews);
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

  // Re-read account state (incl. the shelf) after a "More like this" generation
  // resolves, so freshly generated items appear. No-op outside account mode
  // (guests never fetch a shelf, §8). Reuses the same reconcile as the initial
  // load, so it also refreshes completion/stars — harmless, and keeps one path.
  const refreshShelf = useCallback<UseLearnerState["refreshShelf"]>(async () => {
    if (mode === "account" && selectedLearnerId) {
      await loadAccountState(selectedLearnerId, programSlug);
    }
  }, [mode, selectedLearnerId, programSlug, loadAccountState]);

  // ── Unified record ────────────────────────────────────────────────────────
  const record = useCallback<UseLearnerState["record"]>(
    async (activity, response, source) => {
      const destination = recordingDestination(mode, selectedLearnerId);
      if (destination === "account" && selectedLearnerId) {
        const result = await recordAttemptAction(
          "generatedActivityId" in source
            ? {
                learnerId: selectedLearnerId,
                programSlug,
                generatedActivityId: source.generatedActivityId,
                response,
              }
            : {
                learnerId: selectedLearnerId,
                programSlug,
                unitKey: source.unitKey,
                activityId: activity.id,
                response,
              },
        );
        if (result.ok && mountedRef.current) {
          await loadAccountState(selectedLearnerId, programSlug);
        }
        return result;
      }
      if (destination === "blocked" || "generatedActivityId" in source) {
        return { ok: false, reason: "unavailable" };
      }

      const canonical = parseAndScoreActivity(
        activity.kind,
        activity.config,
        response,
        activity.skillTags,
      );
      if (!canonical.ok) return { ok: false, reason: "invalid" };

      guestRecord(canonical.score.skillEvidence);
      guestComplete(activity.id, canonical.score.stars);
      return { ok: true, score: canonical.score };
    },
    [mode, selectedLearnerId, programSlug, loadAccountState, guestRecord, guestComplete],
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
      retrySession,
      setupProfile,
      record,
      config: accountConfig,
      program: loadedForActive ? accountProgram : null,
      // Curation (Fix-F A3): only enforce once the loaded state belongs to the
      // active (learner, program). While loading (!loadedForActive) report
      // `true` so the surface shows the loading beat, not a flash of the block
      // (paired with `ready` above); once loaded, the server's signal governs.
      available: loadedForActive ? accountAvailable : true,
      // The shelf, gated to the active (learner, program) like the state above so
      // a learner/world switch never flashes the prior shelf.
      generatedShelf: loadedForActive ? accountShelf : EMPTY_SHELF,
      dueReviews: loadedForActive ? accountDueReviews : EMPTY_DUE_REVIEWS,
      refreshShelf,
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
      signedIn: false,
      learners: [],
      selectedLearnerId: guestLearnerId,
      selectLearner,
      retrySession,
      setupProfile,
      record,
      config: {},
      // Guest mode renders entirely from the server-passed published prop.
      program: null,
      // Guests have no enrollments and play every published program — curation
      // is account-mode only, so guest mode is always available.
      available: true,
      // Guests never fetch or render a shelf (§8: no child↔account data).
      generatedShelf: EMPTY_SHELF,
      dueReviews: EMPTY_DUE_REVIEWS,
      refreshShelf,
    };
  }

  // loading or retryable session error
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
    retrySession,
    setupProfile,
    record,
    config: {},
    program: null,
    // During the loading beat, report available so the surface shows the loading
    // state — not a flash of the "ask a grown-up" block — until mode resolves.
    available: true,
    generatedShelf: EMPTY_SHELF,
    dueReviews: EMPTY_DUE_REVIEWS,
    refreshShelf,
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
