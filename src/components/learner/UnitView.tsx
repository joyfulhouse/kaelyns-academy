"use client";

import { motion, useReducedMotion } from "motion/react";
import { CaretRightIcon, FlagIcon } from "@phosphor-icons/react/dist/ssr";
import type { Activity, Unit } from "@/content";
import { cn } from "@/lib/cn";
import { Mascot } from "@/components/art/Mascot";
import { Pill } from "@/components/ui/Pill";
import { Stars } from "@/components/ui/Stars";
import { AppShellKid } from "./AppShellKid";
import { useActiveLearner } from "./learners";
import { useLearnerState } from "./useLearnerState";
import { ACTIVITY_META } from "./activityMeta";

/**
 * A unit (the week's world): theme, big idea, phonics/math focus + project,
 * then its lessons' activities as big friendly buttons. Each activity leads
 * with its kind icon and shows earned stars. Themed by `data-world`.
 */
export function UnitView({ unit }: { unit: Unit }) {
  const reduce = useReducedMotion();
  const { learner } = useActiveLearner();
  // Stars come from the active surface: DB in account mode, localStorage guest
  // otherwise. The mock learner id only matters in guest mode.
  const { getStars, ready } = useLearnerState(learner.id);

  const readAloud = `${unit.title}. ${unit.bigIdea} Pick something to do.`;

  // Flatten activities across lessons; the child sees one friendly list, the
  // lesson grouping is an authoring detail.
  const activities: Activity[] = unit.lessons.flatMap((l) => l.activities);

  return (
    <div data-world={unit.world}>
      <AppShellKid backHref="/learn" readAloud={readAloud}>
        {/* World header */}
        <header className="relative mb-7 overflow-hidden rounded-2xl border-[3px] border-ink bg-accent/12 px-5 py-6">
          <div className="flex items-start gap-4">
            <span
              aria-hidden
              className="grid size-20 shrink-0 place-items-center rounded-2xl border-[3px] border-ink bg-paper text-5xl shadow-pop"
            >
              {unit.emoji}
            </span>
            <div className="min-w-0">
              <div className="font-display text-sm font-semibold text-accent-deep">
                World {unit.order}
                {unit.checkpoint ? " · check-in" : ""}
              </div>
              <h1 className="mt-0.5 font-display text-3xl font-semibold tracking-tight">
                {unit.title}
              </h1>
              <p className="mt-2 max-w-prose text-lg text-ink-soft">{unit.bigIdea}</p>
            </div>
          </div>

          <dl className="mt-5 flex flex-wrap gap-2">
            <FocusPill label="Letters" value={unit.phonicsFocus} />
            <FocusPill label="Numbers" value={unit.mathFocus} />
          </dl>

          <div className="mt-4 flex items-start gap-2 rounded-xl bg-paper/70 px-4 py-3">
            <FlagIcon weight="fill" className="mt-0.5 size-5 shrink-0 text-accent-deep" />
            <p className="text-base text-ink-soft">
              <span className="font-semibold text-ink">This week we make:</span> {unit.project}
            </p>
          </div>
        </header>

        {/* Activities */}
        <h2 className="mb-3 px-1 font-display text-xl font-semibold tracking-tight">
          Let&rsquo;s play
        </h2>
        <ul className="flex flex-col gap-4">
          {activities.map((activity, i) => {
            const meta = ACTIVITY_META[activity.kind];
            const Icon = meta.icon;
            const stars = ready ? getStars(activity.id) : 0;
            const motionProps = reduce
              ? {}
              : {
                  initial: { opacity: 0, y: 12 },
                  animate: { opacity: 1, y: 0 },
                  transition: {
                    duration: 0.32,
                    delay: Math.min(i, 8) * 0.05,
                    ease: [0.16, 1, 0.3, 1] as const,
                  },
                };
            return (
              <motion.li key={activity.id} {...motionProps}>
                <a
                  href={`/learn/${unit.id}/${activity.id}`}
                  aria-label={`${activity.title}. ${meta.label}.${stars > 0 ? ` ${stars} of 3 stars.` : ""}`}
                  className={cn(
                    "flex min-h-24 w-full items-center gap-4 rounded-2xl px-4 py-4",
                    "border-[3px] border-ink bg-paper-raised shadow-pop transition",
                    "active:translate-y-1 active:shadow-none motion-safe:hover:-translate-y-0.5",
                  )}
                >
                  <span
                    aria-hidden
                    className="grid size-16 shrink-0 place-items-center rounded-xl border-[3px] border-ink bg-accent/15"
                  >
                    <Icon weight="duotone" className="size-9 text-ink" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-xl font-semibold tracking-tight">
                      {activity.title}
                    </span>
                    {activity.blurb && (
                      <span className="mt-0.5 block truncate text-base text-ink-soft">
                        {activity.blurb}
                      </span>
                    )}
                    <span className="mt-1.5 block">
                      <Stars value={stars} size="sm" />
                    </span>
                  </span>
                  <CaretRightIcon weight="bold" className="size-7 shrink-0 text-ink/60" />
                </a>
              </motion.li>
            );
          })}
        </ul>

        <div className="mt-10 flex flex-col items-center gap-2 text-center">
          <Mascot mood="happy" size={56} />
          <p className="text-base text-ink-faint">Tap anything. You can always try again.</p>
        </div>
      </AppShellKid>
    </div>
  );
}

function FocusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <Pill tone="accent">
        <span className="font-semibold">{label}:</span> {value}
      </Pill>
    </div>
  );
}
