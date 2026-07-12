"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { SparkleIcon } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";
import { Mascot } from "@/components/art/Mascot";
import { AppShellKid } from "./AppShellKid";
import type { UseLearnerState } from "./useLearnerState";

export function AccountLearnerPicker({
  state,
  onSelected,
}: {
  state: UseLearnerState;
  onSelected?: () => void;
}) {
  const reduce = useReducedMotion();

  return (
    <AppShellKid backHref="/" readAloud="Who is learning today? Tap your picture.">
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <Mascot mood="wave" size={96} className={reduce ? undefined : "motion-safe:animate-float"} />
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Who is learning today?
        </h1>

        {state.learners.length > 0 ? (
          <>
            <ul className="mt-10 flex w-full flex-wrap items-stretch justify-center gap-6">
              {state.learners.map((learner, index) => (
                <motion.li
                  key={learner.id}
                  initial={reduce ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.36,
                    delay: index * 0.06,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      state.selectLearner(learner.id);
                      onSelected?.();
                    }}
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
                      {learner.avatar}
                    </span>
                    <span className="font-display text-xl font-semibold">
                      {learner.displayName}
                    </span>
                  </button>
                </motion.li>
              ))}
            </ul>
            <p className="mt-8 text-base text-ink-faint">Tap your picture to start.</p>
          </>
        ) : (
          <SetupProfile state={state} onSelected={onSelected} />
        )}
      </div>
    </AppShellKid>
  );
}

function SetupProfile({
  state,
  onSelected,
}: {
  state: UseLearnerState;
  onSelected?: () => void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <div className="mt-8 flex flex-col items-center gap-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void state
            .setupProfile()
            .then((created) => {
              if (created) onSelected?.();
            })
            .finally(() => setBusy(false));
        }}
        className={cn(
          "inline-flex min-h-24 items-center gap-2 rounded-pill px-6",
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
