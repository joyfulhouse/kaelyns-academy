"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRightIcon,
  HammerIcon,
  MapTrifoldIcon,
  SparkleIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { Activity, ActivityScore, Unit, World } from "@/content";
import { findActivity, getSkill, getUnit } from "@/content";
import { ensureLessonPractice } from "@/app/(learner)/actions";
import { isGenerableKind } from "@/lib/ai/generable";
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

/** How many AI-generated items may be played back to back, so the loop stays
 *  bounded no matter how much a child taps "more". */
const MAX_GENERATED = 3;

/** Request timeout for generation: a child should never wait long. */
const PRACTICE_TIMEOUT_MS = 12_000;

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

/** Provenance echoed by /api/practice for a generated item (P6 / §8). Relayed
 *  onto the recorded attempt so the parent's "what the AI made" trail + export
 *  show which model/route/when produced it. Carried on the active practice phase. */
interface GenProvenance {
  model: string;
  route: string;
  at: string;
}

/** Pull a well-formed `gen` provenance object off the /api/practice response, or
 *  null when absent/malformed. The server validates the attempt write, so this is
 *  just a defensive shape-check on the client relay (never throws on bad data). */
function parseGen(data: unknown): GenProvenance | null {
  if (!data || typeof data !== "object") return null;
  const gen = (data as { gen?: unknown }).gen;
  if (!gen || typeof gen !== "object") return null;
  const { model, route, at } = gen as Record<string, unknown>;
  if (typeof model !== "string" || typeof route !== "string" || typeof at !== "string") {
    return null;
  }
  return { model, route, at };
}

type Phase =
  | { kind: "play" }
  | { kind: "reward"; stars: 0 | 1 | 2 | 3 }
  | { kind: "generating" }
  | { kind: "practice"; config: unknown; gen: GenProvenance | null }
  | { kind: "practice-failed" };

/**
 * The activity host. Imports `@/activities` for side-effect registration, then
 * looks up the activity-type by kind. A registered kind renders its Player; an
 * unregistered kind degrades gracefully to a friendly "coming soon" placeholder
 * (so the learner surface builds and runs before the plugins land).
 *
 * On completion it records progress AND skill evidence (the single source of
 * mastery truth), then shows a forgiving reward screen. From the reward screen
 * the child can ask for "more, made just for me": the host calls the bounded,
 * schema-validated /api/practice endpoint and renders the generated config
 * through the same Player. Generation is capped and fails gently.
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
  const [generatedCount, setGeneratedCount] = useState(0);

  // Version pinning (Fix-E Layer 2): resolve the activity + its owning unit from
  // the learner's PINNED tree, falling back to the server's published activity
  // only while that tree is loading (or in guest mode). findActivity/getUnit key
  // on the stable authored keys, so the same key resolves in either tree.
  const pinnedFound = program ? findActivity(program, activityKey) : undefined;
  const effectiveActivity: Activity | null = pinnedFound?.activity ?? ssrActivity;
  // The owning unit drives the world theme + the next/back links. Prefer the
  // pinned activity's own unit; else the pinned tree's unit for the route key
  // (a pinned activity whose route unitKey still resolves); else the server's
  // published unit (guest mode / pre-hydration, so the in-unit "Next" link and
  // world theme work without a pinned tree).
  const pinnedUnit: Unit | null =
    pinnedFound?.unit ?? (program ? getUnit(program, unitKey) : undefined) ?? null;
  const effectiveUnit: Unit | null = pinnedUnit ?? ssrUnit;

  // back = the world map for this (pinned) unit, by its stable key from params.
  const backHref = `/learn/${programSlug}/${unitKey}`;
  // next = the following activity WITHIN the resolved unit (so a child finishes a
  // theme before the map decides what's next). Null at the unit's end, or when no
  // unit resolved. Walks the same stable keys the links/record use.
  const nextHref = effectiveUnit ? nextActivityHref(programSlug, effectiveUnit, activityKey) : null;
  // World theme: the resolved unit's world, else the server-passed fallback.
  const effectiveWorld: World = effectiveUnit?.world ?? world;

  const activityType = effectiveActivity ? getActivityType(effectiveActivity.kind) : undefined;

  // The authored activity records both star progress and skill evidence. Guarded
  // on the resolved activity so the callbacks stay declared unconditionally
  // (rules-of-hooks) while the "moved" state below short-circuits the render.
  const handleComplete = useCallback(
    (response: unknown, score: ActivityScore) => {
      if (!effectiveActivity) return;
      stopSpeaking();
      record(effectiveActivity, response, score);
      setPhase({ kind: "reward", stars: score.stars });
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
    },
    [effectiveActivity, effectiveUnit, record, signedIn, selectedLearnerId, programSlug],
  );

  // A generated practice item records skill evidence too (it exercises the same
  // skills), but not star progress: it isn't an authored, trackable activity. The
  // `gen` provenance (from /api/practice) is relayed so the attempt records which
  // model/route/when made it (P6 / §8); null when generation returned none.
  const handlePracticeComplete = useCallback(
    (response: unknown, score: ActivityScore, gen: GenProvenance | null) => {
      if (!effectiveActivity) return;
      stopSpeaking();
      record(effectiveActivity, response, score, {
        generated: true,
        ...(gen ? { gen } : undefined),
      });
      setPhase({ kind: "reward", stars: score.stars });
    },
    [effectiveActivity, record],
  );

  const handleExit = useCallback(() => {
    stopSpeaking();
    router.push(backHref);
  }, [router, backHref]);

  // Ask the bounded generator for one more item at this activity's level. Two
  // flows, matching /api/practice: a SIGNED-IN account sends only IDENTIFIERS and
  // the server §8-gates + derives every generation input from the authored
  // activity (the model can't be steered off-curriculum from here); a GUEST
  // (public "explore") has no enrollment, so it sends the bounded params
  // directly. Output stays schema-validated server-side either way.
  const handleMore = useCallback(async () => {
    if (!effectiveActivity) return;
    stopSpeaking();
    setPhase({ kind: "generating" });

    let body: Record<string, unknown>;
    if (signedIn) {
      // §8 path: identifiers only — `activityId` binds generation to a real
      // activity in the learner's resolved program (the stable authored key).
      body = {
        learnerId: selectedLearnerId,
        programSlug,
        activityId: effectiveActivity.id,
        n: 1,
      };
    } else {
      // Explore path: the guest surface supplies the (bounded) generation params.
      const primarySkill = effectiveActivity.skillTags[0];
      const focus =
        (primarySkill ? getSkill(primarySkill)?.label : undefined) ?? effectiveActivity.title;
      body = {
        kind: effectiveActivity.kind,
        band: config.band ?? effectiveActivity.band,
        focus,
        n: 1,
        skillHints: effectiveActivity.skillTags.slice(0, 8),
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PRACTICE_TIMEOUT_MS);
    try {
      const res = await fetch("/api/practice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        setPhase({ kind: "practice-failed" });
        return;
      }
      const data: unknown = await res.json();
      const items =
        data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items)
          ? (data as { items: unknown[] }).items
          : [];
      const first = items[0];
      if (first === undefined) {
        setPhase({ kind: "practice-failed" });
        return;
      }
      setGeneratedCount((n) => n + 1);
      // Carry the server's provenance (model/route/at) onto the practice phase so
      // the recorded attempt can log what made it (P6 / §8). null if absent/malformed.
      setPhase({ kind: "practice", config: first, gen: parseGen(data) });
    } catch {
      // Timeout/abort/network: never a scary error, just "another time".
      setPhase({ kind: "practice-failed" });
    } finally {
      clearTimeout(timer);
    }
  }, [effectiveActivity, signedIn, selectedLearnerId, programSlug, config.band]);

  if (mode === "error") {
    return <AccountSessionError backHref={backHref} retry={learnerState.retrySession} />;
  }

  if (accountLearnerSelectionRequired(mode, selectedLearnerId)) {
    return <AccountLearnerPicker state={learnerState} />;
  }

  // Account-mode curation gate (Fix-F A3), checked AFTER every hook above so hook
  // order stays stable. Enforced ONLY in account mode and ONLY once state has
  // loaded (`ready`) — guest mode is unaffected and the loading beat isn't a
  // flash-of-block. Blocked when the program isn't playable (available:false) OR
  // this route's unit key is curated out of a non-empty activeUnitKeys (closes
  // the direct-URL hole for the activity route, mirroring UnitView + the map).
  const curatedOut =
    config.activeUnitKeys !== undefined &&
    config.activeUnitKeys.length > 0 &&
    !config.activeUnitKeys.includes(unitKey);
  if (mode === "account" && ready && (!available || curatedOut)) {
    return <NotAssigned programSlug={programSlug} />;
  }

  // The key resolved in neither the pinned nor the published tree → the activity
  // moved out of the learner's version (or a bogus URL). Calm "moved" state, not
  // a crash. Declared AFTER every hook above so hook order stays stable.
  if (!effectiveActivity) {
    return <ActivityMoved backHref={backHref} programSlug={programSlug} />;
  }
  const activity = effectiveActivity;

  // Auto-offer more when this activity's primary skill is still emerging, and
  // only while we're under the generation cap and the kind is renderable.
  // AI practice spends on the LiteLLM gateway via /api/practice, which now
  // requires an account — so only offer "more, made just for me" to a signed-in
  // household. Guests play authored content only (no false, always-failing tap).
  // Additionally, if the parent has set aiPractice === false for this child's
  // program, hide the button (defense-in-depth: the server also returns 403).
  const aiPracticeEnabled = config.aiPractice !== false;
  // Only offer "more" for a kind the generator will actually produce — an
  // authored-only kind (isGenerableKind === false) would 502 every time, so the
  // button must never render for it (matches /api/practice's own refusal).
  const canGenerate =
    Boolean(activityType) &&
    generatedCount < MAX_GENERATED &&
    signedIn &&
    aiPracticeEnabled &&
    isGenerableKind(activity.kind);
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
              canGenerate={canGenerate}
              onMore={handleMore}
            />
          ) : phase.kind === "generating" ? (
            <GeneratingScreen key="generating" />
          ) : phase.kind === "practice-failed" ? (
            <PracticeFailed
              key="practice-failed"
              backHref={backHref}
              nextHref={nextHref}
            />
          ) : phase.kind === "practice" && activityType ? (
            <PlayerFrame key={`practice-${generatedCount}`}>
              <activityType.Player
                config={phase.config}
                learnerContext={
                  signedIn && selectedLearnerId
                    ? { learnerId: selectedLearnerId, programSlug, oralReading: config.oralReading === true }
                    : undefined
                }
                // Relay this generated item's provenance to the recorder (P6 / §8).
                onComplete={(response, score) =>
                  handlePracticeComplete(response, score, phase.gen)
                }
                onExit={handleExit}
              />
            </PlayerFrame>
          ) : activityType ? (
            <PlayerFrame key="play">
              <activityType.Player
                config={activity.config}
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
  canGenerate,
  onMore,
}: {
  stars: 0 | 1 | 2 | 3;
  backHref: string;
  nextHref: string | null;
  /** True while more AI practice may be offered (under the cap, kind renderable). */
  canGenerate: boolean;
  onMore: () => void;
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
        {canGenerate && (
          <Button type="button" onClick={onMore} variant="ghost" size="md">
            <SparkleIcon weight="fill" className="size-5" />
            More, made just for me
          </Button>
        )}
      </div>
    </motion.div>
  );
}

/* ── Generating (AI practice in flight) ─────────────────────────────────────
   A calm "making something for you" beat. No spinner that reads as loading
   chrome; the floating mascot + gentle pulse keeps it playful. */

function GeneratingScreen() {
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
        Making something just for you.
      </p>
      <motion.div
        animate={reduce ? undefined : { scale: [1, 1.06, 1] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        className="grid size-24 place-items-center rounded-2xl border-[3px] border-ink bg-honey shadow-pop"
      >
        <SparkleIcon weight="fill" className="size-12 text-ink" />
      </motion.div>
      <Mascot mood="think" size={108} className={reduce ? "mt-6" : "mt-6 motion-safe:animate-float"} />
      <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight">
        Making something just for you...
      </h1>
      <p className="mt-3 text-lg text-ink-soft">One moment!</p>
    </motion.div>
  );
}

/* ── Practice unavailable (graceful fallback) ───────────────────────────────
   Never a scary error: a warm "another time" with the normal next/back. */

function PracticeFailed({
  backHref,
  nextHref,
}: {
  backHref: string;
  nextHref: string | null;
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
        Let us do that another time.
      </p>
      <Mascot mood="happy" size={120} />
      <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight">
        Let&rsquo;s do that another time!
      </h1>
      <p className="mt-3 text-lg text-ink-soft">You did great. Keep going when you&rsquo;re ready.</p>

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
