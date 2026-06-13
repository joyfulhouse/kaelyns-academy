"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowRightIcon,
  CompassIcon,
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
import { AppShellKid } from "./AppShellKid";
import { useActiveLearner, LEARNERS } from "./learners";
import { useProgress, computeUnitProgress, computeProgramRatio } from "./useProgress";
import { useSkillState } from "./useSkillState";
import { ACTIVITY_META, PROGRAM_SLUG } from "./activityMeta";

/**
 * The studio home: pick-a-learner, then Program 01 as a world map. Units are
 * big tappable world tiles laid along a path, each themed by `data-world`, with
 * a progress ring + lock/stars state, plus overall progress.
 */
export function StudioHome({ program }: { program: Program }) {
  const { learner, setLearnerId, ready } = useActiveLearner();
  const [picked, setPicked] = useState(false);

  // Wait for the persisted learner before showing the map, so we don't flash
  // the wrong avatar; the picker itself needs no persisted state.
  if (ready && picked) {
    return (
      <WorldMap
        program={program}
        learnerId={learner.id}
        onSwitchLearner={() => setPicked(false)}
      />
    );
  }

  return (
    <LearnerPicker
      onPick={(id) => {
        setLearnerId(id);
        setPicked(true);
      }}
    />
  );
}

/* ── Pick a learner ─────────────────────────────────────────────────────── */

function LearnerPicker({ onPick }: { onPick: (id: string) => void }) {
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
            <motion.li
              key={l.id}
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.36, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
            >
              <button
                type="button"
                onClick={() => onPick(l.id)}
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
                  {l.avatar}
                </span>
                <span className="font-display text-xl font-semibold">{l.name}</span>
              </button>
            </motion.li>
          ))}
        </ul>

        <p className="mt-8 text-base text-ink-faint">Tap your picture to start.</p>
      </div>
    </AppShellKid>
  );
}

/* ── World map ──────────────────────────────────────────────────────────── */

function WorldMap({
  program,
  learnerId,
  onSwitchLearner,
}: {
  program: Program;
  learnerId: string;
  onSwitchLearner: () => void;
}) {
  const reduce = useReducedMotion();
  const { getStars, isComplete, ready } = useProgress(learnerId, PROGRAM_SLUG);
  const { skillState, ready: skillReady } = useSkillState(learnerId, PROGRAM_SLUG);

  // Build a stable, hydration-safe snapshot. Before storage is read, treat the
  // map as empty (matches SSR), then progress fills in.
  const progressMap: Record<string, 0 | 1 | 2 | 3> = {};
  const completed = new Set<string>();
  if (ready) {
    for (const unit of program.units) {
      for (const lesson of unit.lessons) {
        for (const activity of lesson.activities) {
          if (isComplete(activity.id)) completed.add(activity.id);
          const s = getStars(activity.id);
          if (s > 0) progressMap[activity.id] = s;
        }
      }
    }
  }

  const overall = computeProgramRatio(program, progressMap);

  // The tutor's per-strand state + ranked next-best. Both derive purely from the
  // engine, so they only become meaningful once storage is read (skillReady).
  const strands = useMemo(
    () => (skillReady ? strandProgress(program, skillState) : []),
    [program, skillState, skillReady],
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
      ready && skillReady
        ? nextBest(program, skillState, new Set(completedKey ? completedKey.split("|") : []))[0]
        : undefined,
    [program, skillState, ready, skillReady, completedKey],
  );

  return (
    <AppShellKid
      backHref="/"
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
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              {program.title}
            </h1>
            <button
              type="button"
              onClick={onSwitchLearner}
              className="mt-1 inline-flex min-h-11 items-center rounded-pill text-base font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"
            >
              Not you? Switch learner
            </button>
          </div>
        </div>
      </div>

      {/* Your next thing: the tutor's single best recommendation. */}
      {topPick && <NextThingCard pick={topPick} reduce={Boolean(reduce)} />}

      {/* The path of worlds */}
      <ol className="relative flex flex-col gap-5">
        {program.units.map((unit, i) => {
          const up = computeUnitProgress(unit, progressMap);
          const prevDone =
            i === 0 ? true : computeUnitProgress(program.units[i - 1], progressMap).completed > 0;
          // Forgiving gate: the first world is always open; each next world
          // opens once the child has started the one before. No penalties, just
          // a sense of journey.
          const locked = !prevDone;
          const alignRight = i % 2 === 1;
          const strand = strandByUnitId.get(unit.id);

          return (
            <li
              key={unit.id}
              data-world={unit.world}
              className={cn("flex", alignRight ? "justify-end" : "justify-start")}
            >
              <WorldTile
                index={i}
                order={unit.order}
                title={unit.title}
                emoji={unit.emoji}
                checkpoint={Boolean(unit.checkpoint)}
                href={`/learn/${unit.id}`}
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

function NextThingCard({ pick, reduce }: { pick: Recommendation; reduce: boolean }) {
  const meta = ACTIVITY_META[pick.activity.kind];
  const Icon = meta.icon;
  const href = `/learn/${pick.unit.id}/${pick.activity.id}`;

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
