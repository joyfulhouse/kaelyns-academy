import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRightIcon,
  CakeIcon,
  CalendarBlankIcon,
  CaretRightIcon,
  SparkleIcon,
  StarIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Pill } from "@/components/ui/Pill";
import { Surface } from "@/components/ui/Surface";
import { Stars } from "@/components/ui/Stars";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { SampleBadge } from "@/components/parent/SampleBadge";
import { outcomeDisplay } from "@/components/parent/skill-display";
import {
  SAMPLE_LEARNER,
  SAMPLE_NOTICE,
  SAMPLE_RECENT,
  SAMPLE_SKILL_STATE,
  SAMPLE_UNITS_DONE,
  SAMPLE_WEEK_ACTIVITIES,
  SAMPLE_WEEK_MINUTES,
  outcomeCounts,
} from "@/components/parent/sample-data";
import { getProgram, getSkill, programStats } from "@/content";

export const metadata: Metadata = { title: "Home" };

export default function ParentHomePage() {
  const program = getProgram(SAMPLE_LEARNER.programSlug);
  const stats = program ? programStats(program) : { units: 0, lessons: 0, activities: 0 };
  const currentUnit = program?.units.find((u) => u.order === SAMPLE_LEARNER.currentUnitOrder);
  const counts = outcomeCounts(SAMPLE_SKILL_STATE);
  const tracked = counts.not_yet + counts.emerging + counts.solid;
  const unitProgress = stats.units > 0 ? SAMPLE_UNITS_DONE / stats.units : 0;

  // Skills the current week touches (from the real program), with sample state.
  const weekSkillTags = currentUnit
    ? [...new Set(currentUnit.lessons.flatMap((l) => l.activities.flatMap((a) => a.skillTags)))]
    : [];

  return (
    <div className="mx-auto max-w-5xl">
      {/* Greeting */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-display text-sm font-semibold text-ink-faint">Parent home</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
            How {SAMPLE_LEARNER.name} is doing
          </h1>
        </div>
        <span className="inline-flex items-center gap-2 text-sm text-ink-soft">
          <SampleBadge />
          {SAMPLE_NOTICE}
        </span>
      </header>

      {/* Learner profile + this-week focus: two unlike columns, not a card grid */}
      <section className="mt-8 grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        {/* Profile */}
        <Surface tone="raised" className="flex flex-col gap-5 p-6">
          <div className="flex items-center gap-4">
            <span
              aria-hidden
              className="grid size-14 place-items-center rounded-pill border-2 border-ink/15 bg-accent/15 font-display text-2xl font-semibold text-ink"
            >
              {SAMPLE_LEARNER.name.charAt(0)}
            </span>
            <div>
              <h2 className="font-display text-xl font-semibold tracking-tight">
                {SAMPLE_LEARNER.name}
              </h2>
              <p className="text-sm text-ink-soft">{program?.ageBand ?? "Learner"}</p>
            </div>
          </div>

          <dl className="flex flex-col gap-2.5 text-sm">
            <div className="flex items-center gap-2 text-ink-soft">
              <CakeIcon weight="regular" className="size-4 text-ink-faint" />
              <dt className="sr-only">Birthday</dt>
              <dd>Born in {SAMPLE_LEARNER.birthMonth}</dd>
            </div>
            <div className="flex items-center gap-2 text-ink-soft">
              <CalendarBlankIcon weight="regular" className="size-4 text-ink-faint" />
              <dt className="sr-only">Enrolled</dt>
              <dd>Enrolled {SAMPLE_LEARNER.enrolledOn}</dd>
            </div>
          </dl>

          {program && (
            <div className="rounded-lg border border-line bg-paper-sunk/60 p-4">
              <p className="font-display text-sm font-semibold">{program.title}</p>
              <p className="text-sm text-ink-soft">{program.subtitle}</p>
              <Pill tone="accent" className="mt-3">
                Week {SAMPLE_LEARNER.currentUnitOrder} of {stats.units}
              </Pill>
            </div>
          )}

          <Link
            href={`/parent/learners/${SAMPLE_LEARNER.id}`}
            className="inline-flex items-center gap-1 text-sm font-medium text-accent-deep underline-offset-2 hover:underline"
          >
            See {SAMPLE_LEARNER.name}&rsquo;s full progress
            <ArrowRightIcon weight="bold" className="size-4" />
          </Link>
        </Surface>

        {/* This week (from the real current unit) */}
        {currentUnit ? (
          <article
            data-world={currentUnit.world}
            className="flex flex-col rounded-xl border border-line bg-accent/8 p-6"
          >
            <div className="flex items-center justify-between">
              <Pill tone="accent" icon={<SparkleIcon weight="fill" className="text-accent-deep" />}>
                This week
              </Pill>
              <span className="text-3xl" aria-hidden>
                {currentUnit.emoji}
              </span>
            </div>
            <h2 className="mt-4 font-display text-2xl font-semibold tracking-tight">
              {currentUnit.title}
            </h2>
            <p className="mt-2 text-ink-soft">{currentUnit.bigIdea}</p>

            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-line bg-paper/70 p-3.5">
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  Reading focus
                </dt>
                <dd className="mt-1 text-sm font-medium text-ink">{currentUnit.phonicsFocus}</dd>
              </div>
              <div className="rounded-lg border border-line bg-paper/70 p-3.5">
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  Math focus
                </dt>
                <dd className="mt-1 text-sm font-medium text-ink">{currentUnit.mathFocus}</dd>
              </div>
            </dl>

            {weekSkillTags.length > 0 && (
              <div className="mt-5">
                <p className="text-sm text-ink-soft">Skills in play this week:</p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {weekSkillTags.map((tag) => {
                    const skill = getSkill(tag);
                    const outcome = SAMPLE_SKILL_STATE[tag];
                    const display = outcome ? outcomeDisplay(outcome) : undefined;
                    return (
                      <li key={tag}>
                        <Pill tone={display?.tone ?? "neutral"} icon={display?.icon}>
                          {skill?.label ?? tag}
                        </Pill>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </article>
        ) : (
          <div className="grid place-items-center rounded-xl border border-dashed border-line-strong p-10 text-center">
            <p className="text-ink-soft">No active week yet. Enrollment starts the first unit.</p>
          </div>
        )}
      </section>

      {/* Progress summary + recent activity */}
      <section className="mt-10 grid gap-5 lg:grid-cols-[1fr_1.3fr]">
        {/* Progress summary */}
        <div className="flex flex-col gap-4 rounded-xl border border-line p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold tracking-tight">This week so far</h2>
            <SampleBadge />
          </div>

          <div className="flex items-center gap-5">
            <ProgressRing value={unitProgress} size={92} stroke={10} label={`${SAMPLE_UNITS_DONE} of ${stats.units} units complete`}>
              <span className="text-center">
                <span className="block font-display text-xl font-semibold leading-none text-ink">
                  {SAMPLE_UNITS_DONE}
                </span>
                <span className="block text-xs text-ink-faint">of {stats.units}</span>
              </span>
            </ProgressRing>
            <div className="min-w-0">
              <p className="text-sm text-ink-soft">Units complete</p>
              <p className="mt-2 text-sm text-ink-soft">
                <span className="font-display text-lg font-semibold text-ink">
                  {SAMPLE_WEEK_ACTIVITIES}
                </span>{" "}
                activities
              </p>
              <p className="text-sm text-ink-soft">
                <span className="font-display text-lg font-semibold text-ink">
                  {SAMPLE_WEEK_MINUTES}
                </span>{" "}
                minutes of learning
              </p>
            </div>
          </div>

          {/* Skill emergence (labeled sample) */}
          <div className="mt-1 border-t border-line pt-4">
            <p className="text-sm text-ink-soft">
              Across {tracked} tracked skills:
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill tone="success" icon={outcomeDisplay("solid").icon}>
                {counts.solid} solid
              </Pill>
              <Pill tone="ready" icon={outcomeDisplay("emerging").icon}>
                {counts.emerging} emerging
              </Pill>
              <Pill tone="neutral" icon={outcomeDisplay("not_yet").icon}>
                {counts.not_yet} not yet
              </Pill>
            </div>
          </div>
        </div>

        {/* Recent activity */}
        <div className="flex flex-col rounded-xl border border-line p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold tracking-tight">Recent activity</h2>
            <SampleBadge />
          </div>

          <ul className="mt-4 divide-y divide-line">
            {SAMPLE_RECENT.map((record) => (
              <li key={record.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span
                  aria-hidden
                  className="grid size-10 shrink-0 place-items-center rounded-md border border-line bg-paper-sunk/70 text-ink-soft"
                >
                  <StarIcon weight={record.stars >= 3 ? "fill" : "regular"} className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{record.title}</p>
                  <p className="text-sm text-ink-faint">
                    {record.kindLabel} · {record.correct} of {record.total} · {record.when}
                  </p>
                </div>
                <Stars value={record.stars} size="sm" />
              </li>
            ))}
          </ul>

          <Link
            href={`/parent/learners/${SAMPLE_LEARNER.id}`}
            className="mt-4 inline-flex items-center gap-1 self-start text-sm font-medium text-accent-deep underline-offset-2 hover:underline"
          >
            View all activity
            <CaretRightIcon weight="bold" className="size-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
