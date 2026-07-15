"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { MapTrifoldIcon } from "@phosphor-icons/react/dist/ssr";
import type { Activity, World } from "@/content";
import { getProgram, getUnit } from "@/content";
import "@/activities"; // side-effect: registers every available activity-type plugin
import { getActivityType } from "@/activities";
import type { PlayableShelfItem } from "@/lib/tutor/store";
import { Mascot } from "@/components/art/Mascot";
import { Button } from "@/components/ui/Button";
import { KidLoadingShell } from "@/components/boundaries/KidLoadingShell";
import { AppShellKid } from "./AppShellKid";
import { useActiveLearner } from "./learners";
import { useLearnerState } from "./useLearnerState";
import { stopSpeaking } from "./speak";
import { ReadAloudDefaultProvider } from "@/activities/_shared/useSpeakOnce";
import { shouldAutoRead } from "@/lib/content/config";
import { accountLearnerSelectionRequired } from "./learnerAccess";
import { AccountLearnerPicker } from "./AccountLearnerPicker";
import { AccountSessionError } from "./AccountSessionError";

/**
 * The play host for a generated SHELF item (Adventure 2.0 B3). A minimal mirror
 * of {@link ActivityHost}: it resolves the activity-type by kind, re-validates
 * the stored config through that type's schema, and renders the Player inside the
 * kid shell. Two phases only — `playing → reward` — with NO "more, made just for
 * me" affordance (a generated item never spawns further generation).
 *
 * On completion it records the attempt as GENERATED, carrying `shelfItemId` (the
 * generated id) so the client optimistically credits it AND relaying the stored
 * `gen` provenance exactly like ActivityHost's practice path (P6 / §8). The
 * server witness (recordAttemptAction) re-verifies ownership and grants the
 * one-time star earn — the client can't self-award.
 *
 * A null/foreign/unknown row or a config that fails its schema degrades to the
 * same calm "this one moved" state ActivityHost uses — never a scary 404/500.
 */
export function GeneratedPracticeHost({
  programSlug,
  row,
}: {
  programSlug: string;
  row: PlayableShelfItem | null;
}) {
  const router = useRouter();
  const { learner } = useActiveLearner();
  // One state seam (DB-backed in account mode); the shelf route requires a
  // session, so `record` always takes the account path here.
  const learnerState = useLearnerState(learner.id, programSlug);
  const { record, config, mode, ready, selectedLearnerId } = learnerState;
  const [phase, setPhase] = useState<Phase>({ kind: "playing" });

  // Resolve the plugin + re-validate the stored config at the render boundary
  // (defense-in-depth: the config was schema+kind-validated before persistence,
  // but a plugin could have changed since). A miss on either → the moved state.
  const activityType = row ? getActivityType(row.kind) : undefined;
  const parsed = activityType && row ? activityType.schema.safeParse(row.config) : undefined;

  // back = this shelf item's unit map (its stable authored key); the program map
  // is the safe floor when there is no row to key off.
  const backHref = row ? `/learn/${programSlug}/${row.unitKey}` : `/learn/${programSlug}`;
  // World theme for the shell chrome: the owning unit's world when it resolves
  // cheaply from the static tree, else the default (mirrors ActivityHost's
  // fallback). Purely cosmetic, so a miss is harmless.
  const program = getProgram(programSlug);
  const world: World =
    (row && program ? getUnit(program, row.unitKey)?.world : undefined) ?? "sunshine";

  // Record the completed shelf item as GENERATED. `shelfItemId` drives the
  // optimistic completed/stars credit keyed by the generated id; `gen` relays the
  // stored provenance (the server re-derives the authoritative shelf witness). An
  // Activity-shaped object is synthesized from the row (record reads only
  // id/kind; config is unused there) — cast because the runtime kind can't be
  // correlated to the union member at compile time.
  const persistCompletion = useCallback(
    async (response: unknown) => {
      if (!row) return;
      stopSpeaking();
      setPhase({ kind: "saving", response });
      const activity = {
        id: row.id,
        title: row.title,
        skillTags: row.skillTags,
        band: "ready",
        kind: row.kind,
        config: row.config,
      } as Activity;
      const result = await record(activity, response, { generatedActivityId: row.id });
      setPhase(
        result.ok
          ? { kind: "reward", stars: result.score.stars }
          : { kind: "save-failed", response },
      );
    },
    [row, record],
  );

  const handleComplete = useCallback(
    (response: unknown) => {
      void persistCompletion(response);
    },
    [persistCompletion],
  );

  const handleExit = useCallback(() => {
    stopSpeaking();
    router.push(backHref);
  }, [router, backHref]);

  if (mode === "error") {
    return <AccountSessionError backHref={backHref} retry={learnerState.retrySession} />;
  }

  if (accountLearnerSelectionRequired(mode, selectedLearnerId)) {
    return <AccountLearnerPicker state={learnerState} />;
  }

  // Declared AFTER every hook above so hook order stays stable: a missing row,
  // an unregistered kind, or a config that fails its schema → the calm moved
  // state, never a crash.
  if (!row || !activityType || !parsed || !parsed.success) {
    return <ShelfItemMoved programSlug={programSlug} backHref={backHref} />;
  }

  return (
    <div data-world={world}>
      <AppShellKid backHref={backHref} readAloud={row.title}>
        <ReadAloudDefaultProvider enabled={shouldAutoRead(mode, ready, config.readAloud)}>
          <AnimatePresence mode="wait">
          {phase.kind === "reward" ? (
            <ShelfReward key="reward" stars={phase.stars} backHref={backHref} />
          ) : phase.kind === "saving" ? (
            <KidLoadingShell
              key="saving"
              ariaLabel="Saving your work"
              message="Saving your work..."
              mood="think"
            >
              <div aria-hidden className="h-24" />
            </KidLoadingShell>
          ) : phase.kind === "save-failed" ? (
            <ShelfSaveFailed
              key="save-failed"
              onRetry={() => {
                void persistCompletion(phase.response);
              }}
              onExit={handleExit}
            />
          ) : (
            <PlayerFrame key="play">
              <activityType.Player
                config={parsed.data}
                onComplete={handleComplete}
                onExit={handleExit}
              />
            </PlayerFrame>
          )}
          </AnimatePresence>
        </ReadAloudDefaultProvider>
      </AppShellKid>
    </div>
  );
}

type Phase =
  | { kind: "playing" }
  | { kind: "saving"; response: unknown }
  | { kind: "save-failed"; response: unknown }
  | { kind: "reward"; stars: 0 | 1 | 2 | 3 };

function ShelfSaveFailed({ onRetry, onExit }: { onRetry: () => void; onExit: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center pt-10 text-center">
      <Mascot mood="think" size={120} />
      <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight">
        Your work is still here
      </h1>
      <p className="mt-3 text-lg text-ink-soft" role="status">
        Let&rsquo;s try saving it one more time.
      </p>
      <div className="mt-9 flex w-full flex-col gap-3">
        <Button type="button" onClick={onRetry} variant="primary" size="kid">
          Try again
        </Button>
        <Button type="button" onClick={onExit} variant="soft" size="kid">
          <MapTrifoldIcon weight="duotone" className="size-6" />
          Back to the map
        </Button>
      </div>
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
   Forgiving by construction (mirrors ActivityHost): every finish is a
   celebration, even 0 stars. No "next" and no "more" — a shelf item stands
   alone, so the only way on is back to the map. */

function ShelfReward({
  stars,
  backHref,
}: {
  stars: 0 | 1 | 2 | 3;
  backHref: string;
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

      <Mascot mood="cheer" size={132} className={reduce ? undefined : "motion-safe:animate-float"} />

      <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        {headline}
      </h1>

      <div className="mt-5 flex items-center justify-center gap-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            initial={reduce ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.42, delay: 0.15 + i * 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="inline-grid place-items-center"
          >
            <BigStar filled={i < earned} />
          </motion.span>
        ))}
      </div>

      <div className="mt-9 w-full">
        <Button href={backHref} variant="primary" size="kid" className="w-full">
          <MapTrifoldIcon weight="duotone" className="size-6" />
          Back to the map
        </Button>
      </div>
    </motion.div>
  );
}

function BigStar({ filled }: { filled: boolean }) {
  // The same storybook star silhouette ActivityHost's reward uses.
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

/* ── Shelf item moved (no row / unknown kind / bad config) ───────────────────
   Mirrors ActivityHost's "moved" posture: a warm nudge back, never a crash or a
   scary 404. `backHref` is this item's unit map when known; the program map is
   the safe floor otherwise. */

function ShelfItemMoved({ programSlug, backHref }: { programSlug: string; backHref: string }) {
  const reduce = useReducedMotion();
  return (
    <AppShellKid backHref={backHref} readAloud="This practice moved. Back to the map.">
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
          {/* With no row, backHref already IS the program map — render one
              button, not two identical destinations with different labels. */}
          <Button href={backHref} variant="primary" size="kid">
            <MapTrifoldIcon weight="duotone" className="size-6" />
            {backHref === `/learn/${programSlug}` ? "Back to the map" : "Back to the world"}
          </Button>
          {backHref !== `/learn/${programSlug}` && (
            <Button href={`/learn/${programSlug}`} variant="soft" size="kid">
              <MapTrifoldIcon weight="duotone" className="size-6" />
              Back to the map
            </Button>
          )}
        </div>
      </motion.div>
    </AppShellKid>
  );
}
