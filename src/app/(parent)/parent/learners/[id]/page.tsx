import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeftIcon,
  CakeIcon,
  CalendarBlankIcon,
  StarIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Pill } from "@/components/ui/Pill";
import { Stars } from "@/components/ui/Stars";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { SampleBadge } from "@/components/parent/SampleBadge";
import { outcomeDisplay, outcomeWeight } from "@/components/parent/skill-display";
import {
  SAMPLE_LEARNER,
  SAMPLE_NOTICE,
  SAMPLE_RECENT,
  SAMPLE_SKILL_STATE,
} from "@/components/parent/sample-data";
import { SKILLS, getProgram, programStats } from "@/content";
import type { Skill, SkillDomain } from "@/content";

export const metadata: Metadata = { title: `${SAMPLE_LEARNER.name} · Learner` };

const DOMAIN_ORDER: { key: SkillDomain; label: string }[] = [
  { key: "reading", label: "Reading & Comprehension" },
  { key: "word", label: "Word Study" },
  { key: "vocab", label: "Vocabulary" },
  { key: "writing", label: "Writing" },
  { key: "math", label: "Math" },
  { key: "habits", label: "Habits" },
];

function skillsByDomain(domain: SkillDomain): Skill[] {
  return SKILLS.filter((s) => s.domain === domain);
}

export default async function LearnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Only the seeded sample learner exists until learner records are persisted.
  if (id !== SAMPLE_LEARNER.id) notFound();

  const learner = SAMPLE_LEARNER;
  const program = getProgram(learner.programSlug);
  const stats = program ? programStats(program) : { units: 0, lessons: 0, activities: 0 };

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/parent/learners"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"
      >
        <ArrowLeftIcon weight="bold" className="size-4" />
        All learners
      </Link>

      {/* Header */}
      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span
            aria-hidden
            className="grid size-16 place-items-center rounded-pill border-2 border-ink/15 bg-accent/15 font-display text-3xl font-semibold text-ink"
          >
            {learner.name.charAt(0)}
          </span>
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">{learner.name}</h1>
            <dl className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-soft">
              <div className="flex items-center gap-1.5">
                <CakeIcon weight="regular" className="size-4 text-ink-faint" />
                <dt className="sr-only">Birthday</dt>
                <dd>Born in {learner.birthMonth}</dd>
              </div>
              <div className="flex items-center gap-1.5">
                <CalendarBlankIcon weight="regular" className="size-4 text-ink-faint" />
                <dt className="sr-only">Enrolled</dt>
                <dd>Enrolled {learner.enrolledOn}</dd>
              </div>
            </dl>
          </div>
        </div>

        {program && (
          <div className="rounded-lg border border-line bg-paper-sunk/60 px-4 py-3">
            <p className="font-display text-sm font-semibold">{program.title}</p>
            <p className="text-sm text-ink-soft">{program.subtitle}</p>
            <Pill tone="accent" className="mt-2">
              Week {learner.currentUnitOrder} of {stats.units}
            </Pill>
          </div>
        )}
      </header>

      {/* Skills by domain */}
      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold tracking-tight">Skills by subject</h2>
          <span className="inline-flex items-center gap-2 text-sm text-ink-soft">
            <SampleBadge />
            {SAMPLE_NOTICE}
          </span>
        </div>

        <div className="mt-5 flex flex-col gap-4">
          {DOMAIN_ORDER.map(({ key, label }) => {
            const skills = skillsByDomain(key);
            if (skills.length === 0) return null;

            const tracked = skills.filter((s) => SAMPLE_SKILL_STATE[s.slug]);
            const domainProgress =
              tracked.length > 0
                ? tracked.reduce((sum, s) => sum + outcomeWeight(SAMPLE_SKILL_STATE[s.slug]!), 0) /
                  tracked.length
                : 0;

            return (
              <article key={key} className="rounded-xl border border-line p-5">
                <div className="flex items-center gap-4">
                  <ProgressRing
                    value={domainProgress}
                    size={52}
                    stroke={7}
                    label={`${label}: sample progress`}
                  >
                    <span className="font-display text-xs font-semibold text-ink">
                      {Math.round(domainProgress * 100)}
                    </span>
                  </ProgressRing>
                  <div>
                    <h3 className="font-display text-lg font-semibold tracking-tight">{label}</h3>
                    <p className="text-sm text-ink-faint">
                      {tracked.length} of {skills.length} skills with sample data
                    </p>
                  </div>
                </div>

                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {skills.map((skill) => {
                    const outcome = SAMPLE_SKILL_STATE[skill.slug];
                    const display = outcome ? outcomeDisplay(outcome) : undefined;
                    return (
                      <li
                        key={skill.slug}
                        className="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper-sunk/40 px-3.5 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink">{skill.label}</p>
                          <p className="truncate text-xs text-ink-faint">{skill.readyIndicator}</p>
                        </div>
                        {display ? (
                          <Pill tone={display.tone} icon={display.icon} className="shrink-0">
                            {display.label}
                          </Pill>
                        ) : (
                          <Pill tone="neutral" className="shrink-0">
                            Not started
                          </Pill>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </article>
            );
          })}
        </div>
      </section>

      {/* Recent attempts */}
      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold tracking-tight">Recent attempts</h2>
          <SampleBadge />
        </div>

        <ul className="mt-4 overflow-hidden rounded-xl border border-line">
          {SAMPLE_RECENT.map((record, i) => (
            <li
              key={record.id}
              className={`flex items-center gap-3 px-5 py-3.5 ${i > 0 ? "border-t border-line" : ""}`}
            >
              <span
                aria-hidden
                className="grid size-9 shrink-0 place-items-center rounded-md border border-line bg-paper-sunk/70 text-ink-soft"
              >
                <StarIcon weight={record.stars >= 3 ? "fill" : "regular"} className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{record.title}</p>
                <p className="text-sm text-ink-faint">
                  {record.kindLabel} · {record.correct} of {record.total} correct · {record.when}
                </p>
              </div>
              <Stars value={record.stars} size="sm" />
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-ink-faint">
          Attempts and skill evidence will populate here once {learner.name} starts activities.
        </p>
      </section>
    </div>
  );
}
