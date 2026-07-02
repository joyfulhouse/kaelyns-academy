"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowRightIcon,
  ArrowsLeftRightIcon,
  CompassIcon,
  HeartIcon,
  LockSimpleIcon,
  SparkleIcon,
  StarIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { Program } from "@/content";
import { nextBest, strandProgress, type Recommendation } from "@/lib/tutor";
import { cn } from "@/lib/cn";
import { Mascot } from "@/components/art/Mascot";
import { Sun } from "@/components/art/Decorations";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Stars } from "@/components/ui/Stars";
import { Button } from "@/components/ui/Button";
import { AppShellKid } from "./AppShellKid";
import { useActiveLearner, LEARNERS } from "./learners";
import { useLearnerState, type SurfaceLearner, type UseLearnerState } from "./useLearnerState";
import { useRewards } from "./useRewards";
import { useQuests } from "./useQuests";
import { TodaysAdventures } from "./TodaysAdventures";
import { computeUnitProgress, computeProgramRatio } from "./useProgress";
import { computeUnlockedIds, segmentUnits } from "./branching";
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
  const [picked, setPicked] = useState(false);

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

  if (picked) {
    // Account-mode curation gate (Fix-F A3): once a learner has picked, block a
    // program a grown-up hasn't added (removed/paused/not-assigned → available
    // false) with the calm "ask a grown-up" state instead of the map. Enforced
    // ONLY in account mode and ONLY once state has loaded (`ready`) — guest mode
    // is unaffected, and while loading we keep showing the map (built from the
    // published prop) so there's no flash-of-block before the signal arrives.
    if (state.mode === "account" && state.ready && !state.available) {
      return <NotAssigned programSlug={program.slug} onSwitchLearner={() => setPicked(false)} />;
    }
    return (
      <WorldMap
        program={effectiveProgram}
        state={state}
        onSwitchLearner={() => setPicked(false)}
      />
    );
  }

  return (
    <LearnerPicker
      state={state}
      onPickGuest={(id) => {
        setLearnerId(id);
        setPicked(true);
      }}
      onPickAccount={(id) => {
        state.selectLearner(id);
        setPicked(true);
      }}
      onSetupProfile={async () => {
        const ok = await state.setupProfile();
        if (ok) setPicked(true);
        return ok;
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
            className="inline-flex min-h-11 items-center justify-center rounded-pill text-base font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"
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
  state,
  onPickGuest,
  onPickAccount,
  onSetupProfile,
}: {
  state: UseLearnerState;
  onPickGuest: (id: string) => void;
  onPickAccount: (id: string) => void;
  onSetupProfile: () => Promise<boolean>;
}) {
  const reduce = useReducedMotion();

  // Account mode: real learners (with avatars). Guest mode: the mock learners.
  // Signed in but no profile yet: a gentle "set up a profile" tile.
  const accountTiles: SurfaceLearner[] = state.mode === "account" ? state.learners : [];
  const showSetup = state.mode === "guest" && state.signedIn;

  return (
    <AppShellKid backHref="/" readAloud="Who is learning today? Tap your picture.">
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <Mascot mood="wave" size={96} className={reduce ? undefined : "motion-safe:animate-float"} />
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Who is learning today?
        </h1>

        <ul className="mt-10 flex w-full flex-wrap items-stretch justify-center gap-6">
          {accountTiles.length > 0
            ? accountTiles.map((l, i) => (
                <LearnerTile
                  key={l.id}
                  index={i}
                  name={l.displayName}
                  avatar={l.avatar}
                  reduce={Boolean(reduce)}
                  onClick={() => onPickAccount(l.id)}
                />
              ))
            : LEARNERS.map((l, i) => (
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

        {showSetup ? (
          <SetupProfile onSetupProfile={onSetupProfile} />
        ) : (
          <p className="mt-8 text-base text-ink-faint">Tap your picture to start.</p>
        )}
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

/* A signed-in household with no child profile yet: one warm tap to create a
   default learner and start playing (DB-backed). Falls back silently to guest
   if it can't be created. */
function SetupProfile({ onSetupProfile }: { onSetupProfile: () => Promise<boolean> }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-8 flex flex-col items-center gap-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void onSetupProfile().finally(() => setBusy(false));
        }}
        className={cn(
          "inline-flex min-h-16 items-center gap-2 rounded-pill px-6",
          "border-[3px] border-ink bg-accent/15 font-display text-xl font-semibold text-ink shadow-pop",
          "transition active:translate-y-1 active:shadow-none motion-safe:hover:-translate-y-0.5",
          busy && "opacity-70",
        )}
      >
        <SparkleIcon weight="fill" className="size-6" />
        {busy ? "Setting up..." : "Set up my studio"}
      </button>
      <p className="text-base text-ink-faint">We will save your progress.</p>
    </div>
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
  const { skillState, completed, getStars, ready, config, mode, selectedLearnerId } = state;

  // The sticker shop is account-mode only (spec §3.7); guest mode never calls
  // the rewards actions, so the chip and its link simply don't render.
  const { state: rewards } = useRewards(mode === "account" ? selectedLearnerId : null);
  // Today's Adventures (spec §4.1) is the account-mode-only daily quest
  // board; guest mode and quest-less days (null/empty) keep the existing
  // single-pick NextThingCard below (no regression, spec §4.1's hard guest
  // fallback requirement).
  const { quests, activate } = useQuests(
    mode === "account" ? selectedLearnerId : null,
    program.slug,
  );

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
  const topPick = useMemo(
    () =>
      ready
        ? nextBest(program, skillState, new Set(completedKey ? completedKey.split("|") : []))[0]
        : undefined,
    [program, skillState, ready, completedKey],
  );

  // activeUnitKeys curation: when set (non-empty), only those unit ids are shown.
  const activeUnitKeys =
    config.activeUnitKeys && config.activeUnitKeys.length > 0
      ? new Set(config.activeUnitKeys)
      : null;
  const visibleUnits = activeUnitKeys
    ? program.units.filter((u) => activeUnitKeys.has(u.id))
    : program.units;

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
  // both the branch→label map and the set of unit ids that start a fork group
  // (where the divider renders) from the same pure segmentUnits() call, so
  // labels and divider placement can never drift from the unlock logic above.
  // Plain (unmemoized): visibleUnits is O(units-per-program) — small — and
  // aliases the `program` prop in the no-curation branch, which the React
  // Compiler's escape analysis flags as unsafe to hand-memoize over.
  const segments = segmentUnits(visibleUnits);
  const branchLabels = new Map<string, string>();
  const forkGroupStartIds = new Set<string>();
  for (const seg of segments) {
    if (seg.kind !== "fork") continue;
    const groupHead = seg.branches[0]?.units[0];
    if (groupHead) forkGroupStartIds.add(groupHead.id);
    seg.branches.forEach((branch, bi) => {
      branchLabels.set(branch.key, `Path ${bi + 1}`);
    });
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
                className="inline-flex min-h-11 items-center rounded-pill text-base font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"
              >
                Not you? Switch learner
              </button>
              <Link
                href="/learn"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-pill text-base font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"
              >
                <ArrowsLeftRightIcon weight="bold" className="size-5" />
                Switch worlds
              </Link>
              {rewards && (
                <Link
                  href={`/learn/${program.slug}/stickers`}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-pill border-2 border-ink bg-paper px-3 font-display text-base font-semibold"
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
                  className="inline-flex size-11 items-center justify-center rounded-pill border-2 border-ink bg-paper"
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

      {/* Today's Adventures (account mode, once quests exist) replaces the
          single-pick card with the daily quest board; guests and quest-less
          days keep the tutor's single best recommendation (guest fallback,
          spec §4.1 — a hard requirement, no regression). */}
      {quests ? (
        <TodaysAdventures
          quests={quests}
          onActivate={(id) => {
            void activate(id);
          }}
          reduce={Boolean(reduce)}
        />
      ) : (
        topPick && <NextThingCard pick={topPick} programSlug={program.slug} reduce={Boolean(reduce)} />
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
          const branch = unit.branchKey ? branchLabels.get(unit.branchKey) : undefined;

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

/* ── Your next thing ───────────────────────────────────────────────────────
   The tutor's single best pick. Deep-links to the activity, leads with its
   kind icon, and reads aloud as a warm invitation. */

function NextThingCard({
  pick,
  programSlug,
  reduce,
}: {
  pick: Recommendation;
  programSlug: string;
  reduce: boolean;
}) {
  const meta = ACTIVITY_META[pick.activity.kind];
  const Icon = meta.icon;
  const href = `/learn/${programSlug}/${pick.unit.id}/${pick.activity.id}`;

  const motionProps = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.34, ease: [0.16, 1, 0.3, 1] as const },
      };

  return (
    <motion.a
      {...motionProps}
      href={href}
      data-world={pick.unit.world}
      aria-label={`Your next thing: ${pick.activity.title}. ${meta.label}. ${pick.reason}.`}
      className={cn(
        "group relative mb-8 flex w-full items-center gap-4 overflow-hidden rounded-2xl px-5 py-5",
        "border-[3px] border-ink bg-accent/15 shadow-pop transition",
        "active:translate-y-1 active:shadow-none motion-safe:hover:-translate-y-0.5",
      )}
    >
      <span
        aria-hidden
        className="grid size-20 shrink-0 place-items-center rounded-2xl border-[3px] border-ink bg-paper-raised"
      >
        <Icon weight="duotone" className="size-11 text-ink" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="inline-flex items-center gap-1.5 font-display text-sm font-semibold text-accent-deep">
          <SparkleIcon weight="fill" className="size-4" />
          {pick.isPractice ? "A little more practice" : "Your next thing"}
        </div>
        <div className="mt-0.5 truncate font-display text-2xl font-semibold tracking-tight">
          {pick.activity.title}
        </div>
        <p className="mt-1 truncate text-base text-ink-soft">{pick.reason}</p>
      </div>

      <span
        aria-hidden
        className="grid size-12 shrink-0 place-items-center rounded-full border-[3px] border-ink bg-honey text-ink shadow-pop"
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
