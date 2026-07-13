"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowRightIcon,
  ArrowCounterClockwiseIcon,
  ArrowsLeftRightIcon,
  CompassIcon,
  HeartIcon,
  LockSimpleIcon,
  SparkleIcon,
  StarIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { ActivityKind, Program, World } from "@/content";
import { nextBest, strandProgress } from "@/lib/tutor";
import { nextGeneratedPick } from "@/lib/tutor/shelf";
import {
  authoredQuestCandidates as buildAuthoredQuestCandidates,
  questActivityHref,
} from "@/lib/quests/logic";
import { cn } from "@/lib/cn";
import { Mascot } from "@/components/art/Mascot";
import { Sun } from "@/components/art/Decorations";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Stars } from "@/components/ui/Stars";
import { Button } from "@/components/ui/Button";
import { AppShellKid } from "./AppShellKid";
import { useActiveLearner, learnerPickerTransition, LEARNERS } from "./learners";
import { useLearnerState, type UseLearnerState } from "./useLearnerState";
import { accountLearnerSelectionRequired } from "./learnerAccess";
import { AccountLearnerPicker } from "./AccountLearnerPicker";
import { AccountSessionError } from "./AccountSessionError";
import { useRewards } from "./useRewards";
import { useQuests } from "./useQuests";
import { TodaysAdventures } from "./TodaysAdventures";
import { curateAdventureCandidates } from "./adventureCandidates";
import { computeUnitProgress, computeProgramRatio } from "./useProgress";
import { computeUnlockedIds, pathLabelsByUnitId, segmentUnits } from "./branching";
import { ACTIVITY_META } from "./activityMeta";

/**
 * The studio home: pick-a-learner, then the program as a world map. Units are
 * big tappable world tiles laid along a path, each themed by `data-world`, with
 * a progress ring + lock/stars state, plus overall progress.
 *
 * Backing is chosen at runtime by `useLearnerState`: a signed-in household plays
 * DB-backed (real learners, progress that survives across devices and feeds the
 * parent report); a signed-out visitor plays the localStorage guest surface with
 * the mock learners. The picker + map both read the one hook so the two surfaces
 * never diverge.
 */
export function StudioHome({ program }: { program: Program }) {
  // The guest active-learner seam still drives mock-learner selection; in account
  // mode the hook ignores this id and uses the selected real learner instead.
  const { learner: guestLearner, setLearnerId } = useActiveLearner();
  // The active program comes from the route (this component is rendered per
  // program slug), so all state is scoped to the world the kid is in. The slug
  // is the stable hook key; the learner's PINNED version (a different tree for
  // the SAME slug, C#5) arrives on `state.program` once account state loads.
  const state = useLearnerState(guestLearner.id, program.slug);
  const [pickerOpen, setPickerOpen] = useState(() => learnerPickerTransition(true, "mount"));

  // Render the learner's resolved (version-pinned) tree once it has loaded;
  // until then (guest mode, loading, or the brief account-load window) fall back
  // to the server-passed published prop so the map never blanks or flickers. The
  // pinned tree then swaps in seamlessly.
  const effectiveProgram = state.program ?? program;

  // While the session resolves we show a calm loading beat rather than flashing
  // the mock picker at a signed-in household.
  if (state.mode === "loading") {
    return <ResolvingSurface />;
  }
  if (state.mode === "error") {
    return <AccountSessionError backHref="/" retry={state.retrySession} />;
  }

  const pickerRequired = accountLearnerSelectionRequired(state.mode, state.selectedLearnerId);
  if (!pickerOpen && !pickerRequired) {
    // Account-mode curation gate (Fix-F A3): once a learner has picked, block a
    // program a grown-up hasn't added (removed/paused/not-assigned → available
    // false) with the calm "ask a grown-up" state instead of the map. Enforced
    // ONLY in account mode and ONLY once state has loaded (`ready`) — guest mode
    // is unaffected, and while loading we keep showing the map (built from the
    // published prop) so there's no flash-of-block before the signal arrives.
    if (state.mode === "account" && state.ready && !state.available) {
      return (
        <NotAssigned
          programSlug={program.slug}
          onSwitchLearner={() => setPickerOpen((open) => learnerPickerTransition(open, "switch"))}
        />
      );
    }
    return (
      <WorldMap
        program={effectiveProgram}
        state={state}
        onSwitchLearner={() => setPickerOpen((open) => learnerPickerTransition(open, "switch"))}
      />
    );
  }

  if (state.mode === "account") {
    return (
      <AccountLearnerPicker
        state={state}
        onSelected={() => setPickerOpen((open) => learnerPickerTransition(open, "pick"))}
      />
    );
  }

  return (
    <LearnerPicker
      onPickGuest={(id) => {
        setLearnerId(id);
        setPickerOpen((open) => learnerPickerTransition(open, "pick"));
      }}
    />
  );
}

/* ── Not assigned (account-mode curation, Fix-F A3) ──────────────────────────
   A signed-in child picked a program a grown-up hasn't added to their plan
   (removed, paused, or never assigned → available:false). Never a scary lock —
   a warm nudge to ask a grown-up, with a way back to their own worlds and to
   switch learner (in case the wrong profile was picked). Guest mode never sees
   this; curation is account-mode only. */

function NotAssigned({
  programSlug,
  onSwitchLearner,
}: {
  programSlug: string;
  onSwitchLearner: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <AppShellKid backHref="/learn" readAloud="Ask a grown-up to add this. Back to your worlds.">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto flex max-w-md flex-col items-center pt-10 text-center"
      >
        <Mascot mood="happy" size={120} />
        <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight">
          Ask a grown-up to add this!
        </h1>
        <p className="mt-3 text-lg text-ink-soft">
          This one isn&rsquo;t ready for you yet. Let&rsquo;s find something to play.
        </p>
        <div className="mt-9 flex w-full flex-col items-stretch gap-3">
          <Button href="/learn" variant="primary" size="kid">
            <CompassIcon weight="duotone" className="size-6" />
            Go to my worlds
          </Button>
          <button
            type="button"
            onClick={onSwitchLearner}
            className="inline-flex min-h-24 items-center justify-center rounded-pill px-4 text-base font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"
          >
            Not you? Switch learner
          </button>
        </div>
      </motion.div>
    </AppShellKid>
  );
}

/* ── Resolving (session in flight) ──────────────────────────────────────────
   A brief, chrome-free beat so we don't show the wrong picker before the
   signed-in/guest decision is known. */

function ResolvingSurface() {
  const reduce = useReducedMotion();
  return (
    <AppShellKid backHref="/" readAloud="Getting your studio ready.">
      <div className="mx-auto flex max-w-2xl flex-col items-center pt-10 text-center">
        <Mascot mood="happy" size={96} className={reduce ? undefined : "motion-safe:animate-float"} />
        <p className="mt-6 text-base text-ink-faint">Getting your studio ready...</p>
      </div>
    </AppShellKid>
  );
}

/* ── Pick a learner ─────────────────────────────────────────────────────── */

function LearnerPicker({
  onPickGuest,
}: {
  onPickGuest: (id: string) => void;
}) {
  const reduce = useReducedMotion();

  return (
    <AppShellKid backHref="/" readAloud="Who is learning today? Tap your picture.">
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <Mascot mood="wave" size={96} className={reduce ? undefined : "motion-safe:animate-float"} />
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Who is learning today?
        </h1>

        <ul className="mt-10 flex w-full flex-wrap items-stretch justify-center gap-6">
          {LEARNERS.map((l, i) => (
                <LearnerTile
                  key={l.id}
                  index={i}
                  name={l.name}
                  avatar={l.avatar}
                  reduce={Boolean(reduce)}
                  onClick={() => onPickGuest(l.id)}
                />
              ))}
        </ul>

        <p className="mt-8 text-base text-ink-faint">Tap your picture to start.</p>
      </div>
    </AppShellKid>
  );
}

function LearnerTile({
  index,
  name,
  avatar,
  reduce,
  onClick,
}: {
  index: number;
  name: string;
  avatar: string;
  reduce: boolean;
  onClick: () => void;
}) {
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-40 flex-col items-center gap-3 rounded-2xl p-5",
          "border-[3px] border-ink bg-paper-raised shadow-pop",
          "transition active:translate-y-1 active:shadow-none",
          "motion-safe:hover:-translate-y-0.5",
        )}
      >
        <span
          aria-hidden
          className="grid size-24 place-items-center rounded-full border-[3px] border-ink bg-accent/15 text-6xl"
        >
          {avatar}
        </span>
        <span className="font-display text-xl font-semibold">{name}</span>
      </button>
    </motion.li>
  );
}

/* ── World map ──────────────────────────────────────────────────────────── */

function WorldMap({
  program,
  state,
  onSwitchLearner,
}: {
  program: Program;
  state: UseLearnerState;
  onSwitchLearner: () => void;
}) {
  const reduce = useReducedMotion();
  const {
    skillState,
    completed,
    getStars,
    ready,
    config,
    mode,
    selectedLearnerId,
    generatedShelf,
    dueReviews,
  } = state;

  // Both the sticker shop (spec §3.7) and Today's Adventures (spec §4.1) are
  // account-mode only; guest mode never calls the rewards/quest actions, so the
  // star chip, its link, and the quest board simply don't render. Passing null
  // in guest mode is what gates each hook to its safe fallback.
  const accountLearnerId = mode === "account" ? selectedLearnerId : null;
  const { state: rewards } = useRewards(accountLearnerId);
  // Quest-less days (null/empty) keep the existing single-pick NextThingCard
  // below (no regression, spec §4.1's hard guest fallback requirement).
  const { quests, activate } = useQuests(accountLearnerId, program.slug);

  // Build a stable, hydration-safe snapshot. Before state is read, treat the
  // map as empty, then progress fills in once ready.
  const progressMap: Record<string, 0 | 1 | 2 | 3> = {};
  if (ready) {
    for (const id of completed) {
      const s = getStars(id);
      // Record completion (key presence) even at 0 stars so roll-ups count it.
      progressMap[id] = s;
    }
  }

  const overall = computeProgramRatio(program, progressMap);

  // The tutor's per-strand state + ranked next-best. Both derive purely from the
  // engine, so they only become meaningful once state is read (ready).
  const strands = useMemo(
    () => (ready ? strandProgress(program, skillState) : []),
    [program, skillState, ready],
  );
  const strandByUnitId = useMemo(
    () => new Map(strands.map((s) => [s.unit.id, s])),
    [strands],
  );
  // A stable key over the completed set so the next-best memo recomputes only
  // when the set actually changes (not on every render that rebuilds the Set).
  const completedKey = [...completed].sort().join("|");
  // activeUnitKeys curation applies to every playable surface: path tiles,
  // hero picks, generated fallbacks, and quest destinations.
  const activeUnitKeys = useMemo(
    () =>
      config.activeUnitKeys && config.activeUnitKeys.length > 0
        ? new Set(config.activeUnitKeys)
        : null,
    [config.activeUnitKeys],
  );
  const visibleUnits = activeUnitKeys
    ? program.units.filter((u) => activeUnitKeys.has(u.id))
    : program.units;

  const globalRecommendations = useMemo(
    () =>
      ready
        ? nextBest(program, skillState, new Set(completedKey ? completedKey.split("|") : []))
        : [],
    [program, skillState, ready, completedKey],
  );
  const {
    recommendations,
    generated: curatedGeneratedShelf,
    reviews: curatedDueReviews,
  } = useMemo(
    () =>
      curateAdventureCandidates(
        globalRecommendations,
        generatedShelf,
        activeUnitKeys,
        dueReviews,
      ),
    [activeUnitKeys, dueReviews, generatedShelf, globalRecommendations],
  );
  const topPick = recommendations[0];
  // A skill that regressed to non-solid can be recommended as the "needs work"
  // hero AND still be due for review — the same activity must not appear as both
  // the hero and a "something you know" Warm-up tile (contradictory framing).
  const dedupedDueReviews = useMemo(
    () => curatedDueReviews.filter((review) => review.activity.id !== topPick?.activity.id),
    [curatedDueReviews, topPick],
  );
  // Next-thing fallback (B3 §4.1): when the tutor has no authored recommendation
  // left (finished the map), offer the oldest not-yet-played generated shelf item
  // so there's always a warm next thing. `completed` already includes played
  // shelf ids (durable credit), so a done generated item is never re-offered.
  // Empty in guest mode (generatedShelf is always []), so guests see no card here.
  const questGeneratedPick = nextGeneratedPick(curatedGeneratedShelf, completed);
  const generatedPick = topPick ? undefined : questGeneratedPick;
  const authoredQuestCandidates = useMemo(
    () => buildAuthoredQuestCandidates(program, activeUnitKeys),
    [program, activeUnitKeys],
  );
  const rankedAuthoredQuestCandidates = useMemo(
    () =>
      recommendations.map((recommendation) => ({
        href: `/learn/${program.slug}/${recommendation.unit.id}/${recommendation.activity.id}`,
        unitId: recommendation.unit.id,
        skills: [...recommendation.activity.skillTags],
      })),
    [program.slug, recommendations],
  );
  const questCandidates = useMemo(() => {
    const rankedAuthoredHrefs = new Set(
      rankedAuthoredQuestCandidates.map((candidate) => candidate.href),
    );
    const completedIds = new Set(completedKey ? completedKey.split("|") : []);
    return [
      ...rankedAuthoredQuestCandidates,
      ...curatedGeneratedShelf
        .filter((item) => !completedIds.has(item.id))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((item) => ({
          href: `/learn/${program.slug}/generated/${item.id}`,
          unitId: item.unitKey,
          skills: [...item.skillTags],
        })),
      ...authoredQuestCandidates.filter(
        (candidate) => !rankedAuthoredHrefs.has(candidate.href),
      ),
    ];
  }, [authoredQuestCandidates, completedKey, curatedGeneratedShelf, program.slug, rankedAuthoredQuestCandidates]);

  // Fork-aware unlock (spec §4.4): a unit is "started" once it has any
  // completion, same "forgiving" posture as the old prevDone gate — but routed
  // through the pure branching model so fork groups open both paths together
  // and a fully linear program (no branchKey anywhere) unlocks identically to
  // before (guarded by branching.test.ts's "fully linear" case).
  const startedIds = new Set(
    visibleUnits.filter((u) => computeUnitProgress(u, progressMap).completed > 0).map((u) => u.id),
  );
  const unlockedIds = computeUnlockedIds(visibleUnits, startedIds);

  // Fork rendering v1 (spec §4.4): a single-column path, plus a "choose your
  // path" divider and a small "Path N" pill per branch. Segment once and derive
  // both the per-unit label map and the set of unit ids that start a fork group
  // (where the divider renders) from the same pure segmentUnits() call, so
  // labels and divider placement can never drift from the unlock logic above.
  // Labels are keyed by unit id (pathLabelsByUnitId), NOT by branchKey — two
  // fork groups reusing the same key literals (e.g. both "left"/"right") would
  // otherwise silently overwrite each other's numbering in a single flat map.
  // Plain (unmemoized): visibleUnits is O(units-per-program) — small — and
  // aliases the `program` prop in the no-curation branch, which the React
  // Compiler's escape analysis flags as unsafe to hand-memoize over.
  const segments = segmentUnits(visibleUnits);
  const branchLabels = pathLabelsByUnitId(visibleUnits);
  const forkGroupStartIds = new Set<string>();
  for (const seg of segments) {
    if (seg.kind !== "fork") continue;
    const groupHead = seg.branches[0]?.units[0];
    if (groupHead) forkGroupStartIds.add(groupHead.id);
  }

  // dailyGoal: count today's completed authored activities from the progressMap.
  const dailyGoal = config.dailyGoal && config.dailyGoal > 0 ? config.dailyGoal : null;
  const todayCompletedCount = ready ? completed.size : 0;

  return (
    <AppShellKid
      backHref="/learn"
      readAloud={`${program.title}. Pick a world to play. Tap a glowing tile.`}
    >
      {/* Overall progress banner */}
      <div className="relative mb-8 overflow-hidden rounded-2xl border-[3px] border-ink bg-honey/30 px-5 py-5">
        <Sun
          aria-hidden
          className="pointer-events-none absolute -right-4 -top-6 h-24 w-24 opacity-70 motion-safe:animate-[spin_60s_linear_infinite]"
        />
        <div className="relative flex items-center gap-4">
          <ProgressRing value={overall} size={72} stroke={9}>
            <span className="font-display text-lg font-semibold text-ink">
              {Math.round(overall * 100)}
              <span className="text-sm">%</span>
            </span>
          </ProgressRing>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              {program.title}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
              <button
                type="button"
                onClick={onSwitchLearner}
                className="inline-flex min-h-24 items-center rounded-pill px-3 text-base font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"
              >
                Not you? Switch learner
              </button>
              <Link
                href="/learn"
                className="inline-flex min-h-24 items-center gap-1.5 rounded-pill px-3 text-base font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"
              >
                <ArrowsLeftRightIcon weight="bold" className="size-5" />
                Switch worlds
              </Link>
              {rewards && (
                <Link
                  href={`/learn/${program.slug}/stickers`}
                  className="inline-flex min-h-24 items-center gap-1.5 rounded-pill border-2 border-ink bg-paper px-5 font-display text-base font-semibold"
                  aria-label={`${rewards.balance} stars. Open your sticker book.`}
                >
                  <StarIcon weight="fill" className="size-5 text-honey" aria-hidden />
                  {rewards.balance}
                </Link>
              )}
              {/* Interests picker (Task 9 / spec §4.3): account-mode only, same
                  gating seam as the sticker chip above (no interests economy
                  in guest mode). Not program-scoped — one board for the whole
                  learner — so it always links to the same path. */}
              {mode === "account" && (
                <Link
                  href="/learn/interests"
                  className="inline-flex size-24 items-center justify-center rounded-pill border-2 border-ink bg-paper"
                  aria-label="Pick your favorite things"
                >
                  <HeartIcon weight="fill" className="size-5 text-coral" aria-hidden />
                </Link>
              )}
            </div>
            {/* Daily goal pill: a light indicator, no enforcement. Quest-aware
                (spec §4.1): once today's adventures exist, the pill counts
                those instead of the raw activity count — same board, same
                target, no separate number to reconcile. */}
            {dailyGoal !== null && (
              <div className="mt-2">
                <span className="inline-flex items-center rounded-pill border-2 border-ink/20 bg-paper px-3 py-1 font-display text-sm font-semibold text-ink-soft">
                  {quests
                    ? `${quests.filter((q) => q.status === "done").length} / ${quests.length} adventures done`
                    : `${todayCompletedCount} / ${dailyGoal} done`}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* One dominant next action, regardless of whether the daily quest board
          is present. The map and quest choices remain secondary below it. */}
      {topPick ? (
        <NextThingCard
          kind={topPick.activity.kind}
          title={topPick.activity.title}
          href={`/learn/${program.slug}/${topPick.unit.id}/${topPick.activity.id}`}
          reason={topPick.reason}
          world={topPick.unit.world}
          isPractice={topPick.isPractice}
          reduce={Boolean(reduce)}
        />
      ) : generatedPick ? (
        <NextThingCard
          kind={generatedPick.kind}
          title={generatedPick.title}
          href={`/learn/${program.slug}/generated/${generatedPick.id}`}
          reason="Fresh practice, made for you"
          isPractice
          reduce={Boolean(reduce)}
        />
      ) : null}

      {dedupedDueReviews.length > 0 && (
        <WarmUpRow programSlug={program.slug} reviews={dedupedDueReviews} />
      )}

      {quests && (
        <TodaysAdventures
          quests={quests}
          onActivate={activate}
          hrefForQuest={(quest) => questActivityHref(quest.kind, quest.target, questCandidates)}
          reduce={Boolean(reduce)}
        />
      )}

      {/* The path of worlds (curated by activeUnitKeys when set). Fork groups
          (spec §4.4) stay single-column in v1: a divider announces the choice
          and both branches render as playable tiles side by side in the list
          (never locked against each other — rule 4). */}
      <ol className="relative flex flex-col gap-5">
        {visibleUnits.map((unit, i) => {
          const up = computeUnitProgress(unit, progressMap);
          const locked = !unlockedIds.has(unit.id);
          const alignRight = i % 2 === 1;
          const strand = strandByUnitId.get(unit.id);
          const branch = branchLabels.get(unit.id);

          return (
            <Fragment key={unit.id}>
              {forkGroupStartIds.has(unit.id) && (
                <li className="flex justify-center py-1">
                  <span className="inline-flex items-center gap-1.5 rounded-pill border-2 border-ink/20 bg-honey/25 px-4 py-1.5 font-display text-sm font-semibold text-ink-soft">
                    <SparkleIcon weight="fill" className="size-4 text-honey" aria-hidden />
                    Choose your path!
                  </span>
                </li>
              )}
              <li
                data-world={unit.world}
                className={cn("flex", alignRight ? "justify-end" : "justify-start")}
              >
                <WorldTile
                  index={i}
                  order={unit.order}
                  title={unit.title}
                  emoji={unit.emoji}
                  checkpoint={Boolean(unit.checkpoint)}
                  branch={branch}
                  href={`/learn/${program.slug}/${unit.id}`}
                  locked={locked}
                  ratio={strand ? strand.ratio : up.ratio}
                  level={strand ? strand.currentLessonIndex : null}
                  totalLevels={unit.lessons.length}
                  stars={up.stars}
                  maxStars={up.maxStars}
                  done={up.done}
                  reduce={Boolean(reduce)}
                />
              </li>
            </Fragment>
          );
        })}
      </ol>

      <div className="mt-10 flex flex-col items-center gap-2 text-center">
        <Mascot mood="happy" size={64} />
        <p className="text-base text-ink-faint">More worlds open as you play.</p>
      </div>
    </AppShellKid>
  );
}

/* ── Warm up ───────────────────────────────────────────────────────────────
   Due authored reviews stay visually subordinate to the single hero: a small,
   forgiving row that links back through the ordinary authored activity route. */

// Keep the row small (One Big GO): show only the few most-overdue reviews so a
// large review backlog never becomes a second choice-board under the hero.
const MAX_WARM_UP_TILES = 3;

function WarmUpRow({
  programSlug,
  reviews,
}: {
  programSlug: string;
  reviews: UseLearnerState["dueReviews"];
}) {
  const shown = reviews.slice(0, MAX_WARM_UP_TILES);
  return (
    <section
      aria-label="Warm up"
      className="mb-8 rounded-2xl border-2 border-ink/20 bg-honey/15 px-4 py-4"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-full bg-honey/45 text-ink"
        >
          <ArrowCounterClockwiseIcon weight="bold" className="size-5" />
        </span>
        <div>
          <h2 className="font-display text-lg font-semibold">Warm up</h2>
          <p className="text-sm text-ink-soft">Let&apos;s warm up with something you know!</p>
        </div>
      </div>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {shown.map((review) => {
          const meta = ACTIVITY_META[review.activity.kind];
          const Icon = meta.icon;
          return (
            <li key={review.activity.id}>
              <a
                href={`/learn/${programSlug}/${review.unit.id}/${review.activity.id}`}
                data-world={review.unit.world}
                aria-label={`Warm up: ${review.activity.title}. ${meta.label}.`}
                className="flex min-h-20 items-center gap-3 rounded-xl border-2 border-ink/20 bg-paper-raised px-3 py-3 transition active:translate-y-0.5 motion-safe:hover:-translate-y-0.5"
              >
                <span
                  aria-hidden
                  className="grid size-10 shrink-0 place-items-center rounded-lg bg-honey/25"
                >
                  <Icon weight="duotone" className="size-6 text-ink" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-display text-base font-semibold">
                    {review.activity.title}
                  </span>
                  <span className="block text-sm text-ink-soft">{meta.label}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ── Your next thing ───────────────────────────────────────────────────────
   The tutor's single best pick. Deep-links to the activity, leads with its
   kind icon, and reads aloud as a warm invitation. */

function NextThingCard({
  kind,
  title,
  href,
  reason,
  world,
  isPractice,
  reduce,
}: {
  kind: ActivityKind;
  title: string;
  href: string;
  reason: string;
  /** Themes the card by world; omitted for a generated pick (no authored unit). */
  world?: World;
  isPractice: boolean;
  reduce: boolean;
}) {
  const meta = ACTIVITY_META[kind];
  const Icon = meta.icon;

  return (
    <motion.a
      href={href}
      data-world={world}
      aria-label={`Continue today's adventure: ${title}. ${meta.label}. ${reason}.`}
      initial={reduce ? false : { opacity: 0, y: 12, scale: 1 }}
      animate={
        reduce
          ? { opacity: 1, y: 0 }
          : { opacity: 1, y: 0, scale: [1, 1.012, 1] }
      }
      transition={
        reduce
          ? { duration: 0.01 }
          : {
              opacity: { duration: 0.34, ease: [0.16, 1, 0.3, 1] },
              y: { duration: 0.34, ease: [0.16, 1, 0.3, 1] },
              scale: { duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: 0.5 },
            }
      }
      className={cn(
        "group relative mb-8 flex min-h-28 w-full items-center gap-3 overflow-hidden rounded-2xl px-4 py-4 sm:gap-4 sm:px-5 sm:py-5",
        "border-[3px] border-ink bg-coral-deep text-on-accent shadow-pop transition",
        "active:translate-y-1 active:shadow-none motion-safe:hover:-translate-y-0.5",
      )}
    >
      <span
        aria-hidden
        className="grid size-16 shrink-0 place-items-center rounded-xl border-[3px] border-ink bg-paper-raised sm:size-24 sm:rounded-2xl"
      >
        <Icon weight="duotone" className="size-8 text-ink sm:size-11" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="inline-flex items-center gap-1.5 font-display text-base font-semibold text-on-accent/85">
          <SparkleIcon weight="fill" className="size-4" />
          Continue today&apos;s adventure
        </div>
        <div className="mt-0.5 break-words font-display text-2xl font-semibold tracking-tight sm:truncate">
          {title}
        </div>
        <p className="mt-1 truncate text-base text-on-accent">
          {isPractice ? "A little more practice" : reason}
        </p>
      </div>

      <span
        aria-hidden
        className="hidden size-20 shrink-0 place-items-center rounded-full border-[3px] border-ink bg-honey text-ink shadow-pop sm:grid"
      >
        <CompassIcon weight="bold" className="size-7" />
      </span>
    </motion.a>
  );
}

function WorldTile({
  index,
  order,
  title,
  emoji,
  checkpoint,
  branch,
  href,
  locked,
  ratio,
  level,
  totalLevels,
  stars,
  maxStars,
  done,
  reduce,
}: {
  index: number;
  order: number;
  title: string;
  emoji: string;
  checkpoint: boolean;
  /** Fork-branch label ("Path 1"/"Path 2", spec §4.4), or undefined off the
   *  branching map / on solo units. */
  branch?: string;
  href: string;
  locked: boolean;
  ratio: number;
  /** Her current rung in this strand (1-based), or null before skill state loads. */
  level: number | null;
  totalLevels: number;
  stars: number;
  maxStars: number;
  done: boolean;
  reduce: boolean;
}) {
  // Strands advance independently: a strong strand can be Level 4 while another
  // is Level 1. Show the rung so that asynchrony is visible, not hidden.
  const showLevel = !locked && level !== null && totalLevels > 0;

  const Inner = (
    <>
      <div className="relative shrink-0">
        <ProgressRing value={locked ? 0 : ratio} size={84} stroke={9}>
          <span aria-hidden className={cn("text-4xl", locked && "opacity-40 grayscale")}>
            {emoji}
          </span>
        </ProgressRing>
        {done && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 grid size-8 place-items-center rounded-full border-2 border-ink bg-honey"
          >
            <StarIcon weight="fill" className="size-4 text-ink" />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 font-display text-sm font-semibold text-accent-deep">
          <span>
            World {order}
            {checkpoint ? " · check-in" : ""}
          </span>
          {branch && (
            <span className="rounded-pill border-2 border-ink/15 bg-paper/70 px-2 py-0.5 text-xs text-ink-soft">
              {branch}
            </span>
          )}
          {showLevel && (
            <span className="rounded-pill border-2 border-ink/15 bg-paper/70 px-2 py-0.5 text-xs text-ink-soft">
              Level {level} of {totalLevels}
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate font-display text-xl font-semibold tracking-tight">
          {title}
        </div>
        <div className="mt-1.5 min-h-7">
          {locked ? (
            <span className="inline-flex items-center gap-1.5 text-base text-ink-faint">
              <LockSimpleIcon weight="fill" className="size-5" />
              Play the world before to open
            </span>
          ) : maxStars > 0 ? (
            <Stars value={Math.min(3, Math.round((stars / maxStars) * 3))} size="sm" />
          ) : null}
        </div>
      </div>

      {!locked && <ArrowRightIcon weight="bold" className="size-7 shrink-0 text-ink/70" />}
    </>
  );

  const sharedClass = cn(
    "flex w-full max-w-md items-center gap-4 rounded-2xl border-[3px] border-ink px-4 py-4",
    "min-h-24 shadow-pop transition",
    locked
      ? "cursor-not-allowed bg-paper-sunk opacity-80"
      : "bg-accent/12 active:translate-y-1 active:shadow-none motion-safe:hover:-translate-y-0.5",
  );

  const motionProps = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 14 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, amount: 0.4 },
        transition: { duration: 0.34, delay: Math.min(index, 6) * 0.04, ease: [0.16, 1, 0.3, 1] as const },
      };

  if (locked) {
    return (
      <motion.div
        {...motionProps}
        className={sharedClass}
        aria-disabled="true"
        aria-label={`World ${order}, ${title}, locked. Play the world before to open it.`}
      >
        {Inner}
      </motion.div>
    );
  }

  return (
    <motion.a {...motionProps} href={href} className={sharedClass} aria-label={`World ${order}, ${title}`}>
      {Inner}
    </motion.a>
  );
}
