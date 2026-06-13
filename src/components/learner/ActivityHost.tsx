"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRightIcon,
  HammerIcon,
  MapTrifoldIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { Activity, ActivityScore, World } from "@/content";
import "@/activities"; // side-effect: registers every available activity-type plugin
import { getActivityType } from "@/activities";
import { cn } from "@/lib/cn";
import { Mascot } from "@/components/art/Mascot";
import { Sparkle } from "@/components/art/Decorations";
import { Button } from "@/components/ui/Button";
import { AppShellKid } from "./AppShellKid";
import { useActiveLearner } from "./learners";
import { useProgress } from "./useProgress";
import { ACTIVITY_META, PROGRAM_SLUG } from "./activityMeta";
import { stopSpeaking } from "./speak";

type Phase = { kind: "play" } | { kind: "reward"; stars: 0 | 1 | 2 | 3 };

/**
 * The activity host. Imports `@/activities` for side-effect registration, then
 * looks up the activity-type by kind. A registered kind renders its Player; an
 * unregistered kind degrades gracefully to a friendly "coming soon" placeholder
 * (so the learner surface builds and runs before the plugins land). On
 * completion it records progress and shows a forgiving reward screen.
 */
export function ActivityHost({
  activity,
  world,
  backHref,
  nextHref,
}: {
  activity: Activity;
  world: World;
  backHref: string;
  nextHref: string | null;
}) {
  const router = useRouter();
  const { learner } = useActiveLearner();
  const { complete } = useProgress(learner.id, PROGRAM_SLUG);
  const [phase, setPhase] = useState<Phase>({ kind: "play" });

  const activityType = getActivityType(activity.kind);

  const handleComplete = useCallback(
    (_response: unknown, score: ActivityScore) => {
      stopSpeaking();
      complete(activity.id, score.stars);
      setPhase({ kind: "reward", stars: score.stars });
    },
    [activity.id, complete],
  );

  const handleExit = useCallback(() => {
    stopSpeaking();
    router.push(backHref);
  }, [router, backHref]);

  return (
    <div data-world={world}>
      <AppShellKid backHref={backHref} readAloud={activity.title}>
        <AnimatePresence mode="wait">
          {phase.kind === "reward" ? (
            <RewardScreen
              key="reward"
              stars={phase.stars}
              backHref={backHref}
              nextHref={nextHref}
            />
          ) : activityType ? (
            <PlayerFrame key="play">
              <activityType.Player
                config={activity.config}
                onComplete={handleComplete}
                onExit={handleExit}
              />
            </PlayerFrame>
          ) : (
            <ComingSoon key="soon" activity={activity} backHref={backHref} />
          )}
        </AnimatePresence>
      </AppShellKid>
    </div>
  );
}

/* ── Player frame (soft cross-fade + rise per DESIGN.md page transition) ──── */

function PlayerFrame({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* ── Reward screen ────────────────────────────────────────────────────────
   Forgiving by construction: every finish is a celebration. Even 0 stars is
   "great trying", never a fail. */

function RewardScreen({
  stars,
  backHref,
  nextHref,
}: {
  stars: 0 | 1 | 2 | 3;
  backHref: string;
  nextHref: string | null;
}) {
  const reduce = useReducedMotion();
  const earned = Math.max(0, Math.min(3, stars));
  const headline = earned >= 3 ? "Wow! Three stars!" : earned >= 1 ? "You did it!" : "Great trying!";
  const announce =
    earned > 0 ? `You earned ${earned} of 3 stars.` : "You finished. Great trying.";

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto flex max-w-md flex-col items-center pt-6 text-center"
    >
      <p className="sr-only" role="status" aria-live="assertive">
        {announce}
      </p>

      <div className="relative">
        <Mascot mood="cheer" size={132} className={reduce ? undefined : "motion-safe:animate-float"} />
        {!reduce && (
          <>
            <FloatSparkle className="-left-6 -top-2 size-7" delay={0.1} />
            <FloatSparkle className="-right-7 top-4 size-9" delay={0.22} />
            <FloatSparkle className="right-2 -top-6 size-5" delay={0.34} />
          </>
        )}
      </div>

      <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        {headline}
      </h1>

      {/* Big celebratory stars with the signature star-pop (scale .6→1 + fade). */}
      <div className="mt-5 flex items-center justify-center gap-3" aria-hidden>
        {[0, 1, 2].map((i) => {
          const filled = i < earned;
          return (
            <motion.span
              key={i}
              initial={reduce ? false : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                duration: 0.42,
                delay: 0.15 + i * 0.16,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="inline-grid place-items-center"
            >
              <BigStar filled={filled} />
            </motion.span>
          );
        })}
      </div>

      <div className="mt-9 flex w-full flex-col items-stretch gap-3">
        {nextHref && (
          <Button href={nextHref} variant="primary" size="kid">
            Next
            <ArrowRightIcon weight="bold" className="size-6" />
          </Button>
        )}
        <Button href={backHref} variant="soft" size="kid">
          <MapTrifoldIcon weight="duotone" className="size-6" />
          Back to the map
        </Button>
      </div>
    </motion.div>
  );
}

function BigStar({ filled }: { filled: boolean }) {
  // Reuse the storybook star silhouette at a celebratory size.
  const path =
    "M12 2.2l2.9 6.2 6.8.7c.6.1.9.9.4 1.3l-5.1 4.6 1.4 6.7c.1.6-.5 1.1-1.1.8L12 19.2 5.9 22.5c-.5.3-1.2-.2-1.1-.8l1.4-6.7-5.1-4.6c-.5-.4-.2-1.2.4-1.3l6.8-.7L12 2.2z";
  return (
    <svg width={56} height={56} viewBox="0 0 24 24" className={filled ? "text-ink" : "text-ink/25"}>
      <path
        d={path}
        fill={filled ? "var(--color-honey)" : "var(--color-paper-sunk)"}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FloatSparkle({ className, delay }: { className: string; delay: number }) {
  return (
    <motion.span
      aria-hidden
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: [0, 1, 0.9], opacity: [0, 1, 0.85] }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
      className={cn("pointer-events-none absolute", className)}
    >
      <Sparkle className="size-full text-honey" />
    </motion.span>
  );
}

/* ── Coming-soon placeholder (unregistered activity kind) ─────────────────── */

function ComingSoon({
  activity,
  backHref,
}: {
  activity: Activity;
  backHref: string;
}) {
  const reduce = useReducedMotion();
  const meta = ACTIVITY_META[activity.kind];

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto flex max-w-md flex-col items-center pt-8 text-center"
    >
      <div className="grid size-24 place-items-center rounded-2xl border-[3px] border-ink bg-accent/15 shadow-pop">
        <HammerIcon weight="duotone" className="size-12 text-ink" />
      </div>
      <Mascot mood="think" size={108} className="mt-6" />
      <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight">
        This one is coming soon!
      </h1>
      <p className="mt-3 text-lg text-ink-soft">
        <span className="font-semibold text-ink">{activity.title}</span> is still being built. Come
        back soon to {meta.label.toLowerCase()}.
      </p>
      <div className="mt-9 w-full">
        <Button href={backHref} variant="primary" size="kid" className="w-full">
          <MapTrifoldIcon weight="duotone" className="size-6" />
          Back to the map
        </Button>
      </div>
    </motion.div>
  );
}
