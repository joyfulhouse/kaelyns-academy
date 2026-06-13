import type { Metadata } from "next";
import Link from "next/link";
import {
  CaretRightIcon,
  PlusIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { SampleBadge } from "@/components/parent/SampleBadge";
import {
  SAMPLE_LEARNER,
  SAMPLE_SKILL_STATE,
  outcomeCounts,
} from "@/components/parent/sample-data";
import { outcomeWeight } from "@/components/parent/skill-display";
import { getProgram, programStats } from "@/content";

export const metadata: Metadata = { title: "Learners" };

// One sample learner today; the list layout is built to hold more.
const LEARNERS = [SAMPLE_LEARNER];

export default function LearnersPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-display text-sm font-semibold text-ink-faint">Parent home</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Learners</h1>
          <p className="mt-2 max-w-prose text-ink-soft">
            Each learner keeps only a display name and birth month. Open one to see skills by
            subject and recent activity.
          </p>
        </div>
        <Button
          variant="soft"
          size="md"
          disabled
          title="Adding more learners arrives with account management"
        >
          <PlusIcon weight="bold" className="size-4" />
          Add learner
        </Button>
      </header>

      <ul className="mt-8 flex flex-col gap-3">
        {LEARNERS.map((learner) => {
          const program = getProgram(learner.programSlug);
          const stats = program ? programStats(program) : { units: 0, lessons: 0, activities: 0 };
          const counts = outcomeCounts(SAMPLE_SKILL_STATE);
          const tracked = counts.not_yet + counts.emerging + counts.solid;
          const skillProgress =
            tracked > 0
              ? Object.values(SAMPLE_SKILL_STATE).reduce(
                  (sum, outcome) => sum + (outcome ? outcomeWeight(outcome) : 0),
                  0,
                ) / tracked
              : 0;

          return (
            <li key={learner.id}>
              <Link
                href={`/parent/learners/${learner.id}`}
                className="group flex items-center gap-4 rounded-xl border border-line p-5 transition-colors hover:border-line-strong hover:bg-paper-sunk/40"
              >
                <span
                  aria-hidden
                  className="grid size-12 shrink-0 place-items-center rounded-pill border-2 border-ink/15 bg-accent/15 font-display text-xl font-semibold text-ink"
                >
                  {learner.name.charAt(0)}
                </span>

                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-lg font-semibold tracking-tight">
                    {learner.name}
                  </h2>
                  <p className="text-sm text-ink-soft">
                    {program ? `${program.title} · Week ${learner.currentUnitOrder} of ${stats.units}` : "Not enrolled"}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Pill tone="success">{counts.solid} solid</Pill>
                    <Pill tone="ready">{counts.emerging} emerging</Pill>
                    <SampleBadge />
                  </div>
                </div>

                <ProgressRing
                  value={skillProgress}
                  size={56}
                  stroke={7}
                  label="Sample skill progress"
                  className="hidden sm:inline-grid"
                >
                  <span className="font-display text-sm font-semibold text-ink">
                    {Math.round(skillProgress * 100)}
                  </span>
                </ProgressRing>

                <CaretRightIcon
                  weight="bold"
                  className="size-5 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            </li>
          );
        })}
      </ul>

      {LEARNERS.length === 0 && (
        <div className="mt-8 grid place-items-center rounded-xl border border-dashed border-line-strong p-12 text-center">
          <UsersThreeIcon weight="regular" className="size-10 text-ink-faint" />
          <p className="mt-3 font-display text-lg font-semibold">No learners yet</p>
          <p className="mt-1 max-w-sm text-ink-soft">
            Add your child to enroll them in a program and start following their progress.
          </p>
        </div>
      )}
    </div>
  );
}
