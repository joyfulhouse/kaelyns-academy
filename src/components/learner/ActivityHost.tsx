"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRightIcon,
  HammerIcon,
  MapTrifoldIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { Activity, Unit, World } from "@/content";
import { ensureLessonPractice } from "@/app/(learner)/actions";
import "@/activities"; // side-effect: registers every available activity-type plugin
import { getActivityType } from "@/activities";
import { cn } from "@/lib/cn";
import { Mascot } from "@/components/art/Mascot";
import { Sparkle } from "@/components/art/Decorations";
import { Button } from "@/components/ui/Button";
import { AppShellKid } from "./AppShellKid";
import { useActiveLearner } from "./learners";
import { useLearnerState } from "./useLearnerState";
import { NotAssigned } from "./UnitView";
import { ACTIVITY_META } from "./activityMeta";
import { stopSpeaking } from "./speak";
import { ReadAloudDefaultProvider } from "@/activities/_shared/useSpeakOnce";
import { shouldAutoRead } from "@/lib/content/config";
import { accountLearnerSelectionRequired } from "./learnerAccess";
import { AccountLearnerPicker } from "./AccountLearnerPicker";
import { AccountSessionError } from "./AccountSessionError";
import { KidLoadingShell } from "@/components/boundaries/KidLoadingShell";
import {
  playerIdentityKey,
  resolvePlayableActivity,
  safeParsePlayerConfig,
} from "./activityResolution";

/**
 * The next activity within the SAME (resolved) unit — kept inside the world so a
 * child advances through one theme before the map decides the next. Returns null
 * at the unit's end, where the reward screen offers only "back to the map".
 * Computed from the learner's RESOLVED (pinned) unit and the stable authored
 * keys, so the link points within the learner's own version (Fix-E Layer 2).
 */
function nextActivityHref(programSlug: string, unit: Unit, activityKey: string): string | null {
  const ids = unit.lessons.flatMap((l) => l.activities.map((a) => a.id));
  const idx = ids.indexOf(activityKey);
  if (idx < 0 || idx + 1 >= ids.length) return null;
  return `/learn/${programSlug}/${unit.id}/${ids[idx + 1]}`;
}

type Phase =
  | { kind: "play" }
  | { kind: "saving" }
  | { kind: "save-failed"; response: unknown }
  | { kind: "reward"; stars: 0 | 1 | 2 | 3 }
;

/**
 * The activity host. Imports `@/activities` for side-effect registration, then
 * looks up the activity-type by kind. A registered kind renders its Player; an
 * unregistered kind degrades gracefully to a friendly "coming soon" placeholder
 * (so the learner surface builds and runs before the plugins land).
 *
 * On completion it waits for the server-authoritative record result, then shows
 * one forgiving reward screen. A failed write keeps the bounded response in
 * memory and offers a calm retry; the browser never supplies the score.
 */
export function ActivityHost({
  programSlug,
  unitKey,
  activityKey,
  ssrActivity,
  ssrUnit,
  world,
}: {
  programSlug: string;
  unitKey: string;
  activityKey: string;
  ssrActivity: Activity | null;
  ssrUnit: Unit | null;
  world: World;
}) {
  const router = useRouter();
  const { learner } = useActiveLearner();
  // One state seam for both surfaces: DB-backed when a household is signed in,
  // localStorage guest otherwise. The guest learner id only matters in guest
  // mode; in account mode the hook resolves the selected account learner. State
  // is scoped to the active program by its slug, and `program` is the learner's
  // RESOLVED (version-pinned) tree (null in guest/loading).
  const learnerState = useLearnerState(learner.id, programSlug);
  const { record, signedIn, config, selectedLearnerId, program, mode, available, ready } =
    learnerState;
  const [phase, setPhase] = useState<Phase>({ kind: "play" });

  // Fail closed until the surface mode + selected account learner's pinned tree
  // are ready. Account mode never falls back to the published SSR activity, and
  // the activity must belong to the exact route unit (a duplicate id elsewhere
  // in the program cannot satisfy this route). Guests use the exact SSR unit.
  const resolution = resolvePlayableActivity({
    mode,
    ready,
    available,
    program,
    activeUnitKeys: config.activeUnitKeys,
    unitKey,
    activityKey,
    ssrUnit,
    ssrActivity,
  });
  const effectiveActivity: Activity | null =
    resolution.status === "ready" ? resolution.activity : null;
  const effectiveUnit: Unit | null = resolution.status === "ready" ? resolution.unit : null;

  // back = the world map for this (pinned) unit, by its stable key from params.
  const backHref = `/learn/${programSlug}/${unitKey}`;
  // next = the following activity WITHIN the resolved unit (so a child finishes a
  // theme before the map decides what's next). Null at the unit's end, or when no
  // unit resolved. Walks the same stable keys the links/record use.
  const nextHref = effectiveUnit ? nextActivityHref(programSlug, effectiveUnit, activityKey) : null;
  // World theme: the resolved unit's world, else the server-passed fallback.
  const effectiveWorld: World = effectiveUnit?.world ?? world;

  const activityType = effectiveActivity ? getActivityType(effectiveActivity.kind) : undefined;
  const authoredConfig =
    activityType && effectiveActivity
      ? safeParsePlayerConfig(activityType.schema, effectiveActivity.config)
      : null;

  // Keep the response in memory across a retry, but trust only the canonical
  // score returned after the server re-resolves this exact unit/activity.
  const persistCompletion = async (response: unknown) => {
    if (!effectiveActivity) return;
    stopSpeaking();
    setPhase({ kind: "saving" });
    const result = await record(effectiveActivity, response, { unitKey });
    if (!result.ok) {
      setPhase({ kind: "save-failed", response });
      return;
    }
    setPhase({ kind: "reward", stars: result.score.stars });
    // Eager shelf warm-up (B3 §4): once an authored activity is done, nudge the
    // server to fill this lesson's "fresh practice" shelf. Fire-and-forget and
    // idempotent — the server no-ops unless this completion finished the lesson,
    // so the kid never waits and repeat completions don't over-generate.
    // Belt-and-suspenders (final review Critical): never even ask on a
    // baseline/mid/final CHECK-IN unit — a check-in must not grow practice whose
    // evidence folds into skill_state (C1 placement integrity). The server guard
    // in ensureLessonPractice is authoritative; this just skips the round-trip.
    if (signedIn && selectedLearnerId && !effectiveUnit?.checkpoint) {
      void ensureLessonPractice({
        learnerId: selectedLearnerId,
        programSlug,
        activityId: effectiveActivity.id,
      }).catch(() => {});
    }
  };

  const handleComplete = (response: unknown) => {
    void persistCompletion(response);
  };

  const handleExit = () => {
    stopSpeaking();
    router.push(backHref);
  };

  if (mode === "error") {
    return <AccountSessionError backHref={backHref} retry={learnerState.retrySession} />;
  }

  if (accountLearnerSelectionRequired(mode, selectedLearnerId)) {
    return <AccountLearnerPicker state={learnerState} />;
  }

  if (resolution.status === "loading") {
    return <ActivityReadyLoading />;
  }

  if (resolution.status === "blocked") {
    return <NotAssigned programSlug={programSlug} />;
  }

  // Missing exact-unit content and malformed plugin config share one calm
  // recovery posture. safeParse above never lets malformed content reach Player.
  if (resolution.status === "moved" || authoredConfig?.status === "malformed") {
    return <ActivityMoved backHref={backHref} programSlug={programSlug} />;
  }
  const activity = resolution.activity;
  const unit = resolution.unit;
  const learnerIdentity = selectedLearnerId ?? learner.id;

  return (
    <div data-world={effectiveWorld}>
      <AppShellKid backHref={backHref} readAloud={activity.title}>
        <ReadAloudDefaultProvider enabled={shouldAutoRead(mode, ready, config.readAloud)}>
          <AnimatePresence mode="wait">
          {phase.kind === "reward" ? (
            <RewardScreen
              key="reward"
              stars={phase.stars}
              backHref={backHref}
              nextHref={nextHref}
            />
          ) : phase.kind === "saving" ? (
            <SavingScreen key="saving" />
          ) : phase.kind === "save-failed" ? (
            <SaveFailed
              key="save-failed"
              onRetry={() => {
                void persistCompletion(phase.response);
              }}
              onExit={handleExit}
            />
          ) : activityType ? (
            <PlayerFrame
              key={playerIdentityKey({
                learnerId: learnerIdentity,
                programSlug,
                unitKey: unit.id,
                activityKey: activity.id,
                kind: activity.kind,
                variant: "authored",
                sequence: 0,
                content: activity,
                config: authoredConfig?.status === "ready" ? authoredConfig.config : activity.config,
              })}
            >
              <activityType.Player
                config={authoredConfig?.status === "ready" ? authoredConfig.config : activity.config}
                learnerContext={
                  signedIn && selectedLearnerId
                    ? { learnerId: selectedLearnerId, programSlug, oralReading: config.oralReading === true }
                    : undefined
                }
                onComplete={handleComplete}
                onExit={handleExit}
              />
            </PlayerFrame>
          ) : (
            <ComingSoon key="soon" activity={activity} backHref={backHref} />
          )}
          </AnimatePresence>
        </ReadAloudDefaultProvider>
      </AppShellKid>
    </div>
  );
}

function ActivityReadyLoading() {
  return (
    <KidLoadingShell ariaLabel="Getting this ready" message="Getting this ready..." mood="think">
      <div
        aria-hidden
        className="mt-9 h-72 w-full rounded-2xl border-[3px] border-ink bg-accent/8 shadow-pop motion-safe:animate-pulse"
      />
    </KidLoadingShell>
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

      <div className="mt-6 flex w-full flex-col items-stretch gap-3">
        {nextHref && (
          <Button href={nextHref} variant="primary" size="kid" className="w-full">
            Keep going
            <ArrowRightIcon weight="bold" className="size-6" />
          </Button>
        )}
        <Button href={backHref} variant={nextHref ? "ghost" : "primary"} size="kid">
          <MapTrifoldIcon weight="duotone" className="size-6" />
          Map
        </Button>
      </div>
    </motion.div>
  );
}

function SavingScreen() {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto flex max-w-md flex-col items-center pt-12 text-center"
    >
      <p className="sr-only" role="status" aria-live="polite">
        Saving your work.
      </p>
      <Mascot mood="think" size={120} className={reduce ? undefined : "motion-safe:animate-float"} />
      <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight">
        Saving your work...
      </h1>
      <p className="mt-3 text-lg text-ink-soft">Almost there!</p>
    </motion.div>
  );
}

function SaveFailed({
  onRetry,
  onExit,
}: {
  onRetry: () => void;
  onExit: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto flex max-w-md flex-col items-center pt-10 text-center"
    >
      <p className="sr-only" role="status" aria-live="polite">
        Your work is still here. Try saving again.
      </p>
      <Mascot mood="think" size={120} />
      <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight">
        Your work is still here
      </h1>
      <p className="mt-3 text-lg text-ink-soft">Let&rsquo;s try saving it one more time.</p>

      <div className="mt-9 flex w-full flex-col items-stretch gap-3">
        <Button type="button" onClick={onRetry} variant="primary" size="kid">
          Try again
        </Button>
        <Button type="button" onClick={onExit} variant="soft" size="kid">
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

/* ── Activity moved (key in neither the pinned nor the published tree) ───────
   A pinned learner can land on an activity that isn't in their version (a bogus
   URL, or an activity removed across versions). Never a crash or scary 404 — a
   warm nudge back. `backHref` is this unit's map; if even the unit is gone the
   program map is the safe floor. */

function ActivityMoved({ backHref, programSlug }: { backHref: string; programSlug: string }) {
  const reduce = useReducedMotion();
  return (
    <AppShellKid backHref={backHref} readAloud="This activity moved. Back to the map.">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto flex max-w-md flex-col items-center pt-10 text-center"
      >
        <Mascot mood="think" size={120} />
        <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight">
          This one moved!
        </h1>
        <p className="mt-3 text-lg text-ink-soft">Let&rsquo;s head back to the map.</p>
        <div className="mt-9 flex w-full flex-col items-stretch gap-3">
          <Button href={backHref} variant="primary" size="kid">
            <MapTrifoldIcon weight="duotone" className="size-6" />
            Back to the world
          </Button>
          <Button href={`/learn/${programSlug}`} variant="soft" size="kid">
            <MapTrifoldIcon weight="duotone" className="size-6" />
            Back to the map
          </Button>
        </div>
      </motion.div>
    </AppShellKid>
  );
}
