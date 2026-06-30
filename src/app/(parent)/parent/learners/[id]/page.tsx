import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CakeIcon,
  GearSixIcon,
  SparkleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Pill } from "@/components/ui/Pill";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { BackLink } from "@/components/ui/BackLink";
import { AvatarBadge } from "@/components/ui/AvatarBadge";
import { outcomeDisplay, outcomeWeight } from "@/components/parent/skill-display";
import { ActivityRowItem } from "@/components/parent/ActivityRowItem";
import {
  getLearnerDetail,
  getLearnerCurriculum,
  type ActivityRow,
  type SkillStatus,
} from "@/app/(parent)/data";
import { CurriculumPanel } from "@/components/parent/CurriculumPanel";
import { LearnerDataControls } from "@/components/parent/LearnerDataControls";
import { programStats } from "@/content";
import type { SkillDomain } from "@/content";
import { cn } from "@/lib/cn";

// Deliberately a static, non-identifying title. The child's display name is
// child PII (spec §8) and is shown only inside the authenticated page body —
// never in `document.title`, which leaks into browser history, OS window/tab
// previews, and client telemetry (e.g. Sentry breadcrumbs capture document
// titles). Auth-gating + robots-disallow stop indexing/access, not those
// metadata surfaces, so the name stays out of the title entirely.
export const metadata: Metadata = { title: "Learner" };

/**
 * Domains in the order the learner-detail page renders them, each with a
 * friendly label. The four World-Languages strands each get their own section
 * (one parent-report row per language) so language progress is shown and
 * labelled, not dropped or lumped in with the core curriculum.
 */
const DOMAIN_ORDER: { key: SkillDomain; label: string }[] = [
  { key: "reading", label: "Reading & Comprehension" },
  { key: "word", label: "Word Study" },
  { key: "vocab", label: "Vocabulary" },
  { key: "writing", label: "Writing" },
  { key: "math", label: "Math" },
  { key: "habits", label: "Habits" },
  // World Languages
  { key: "zhuyin", label: "Zhuyin (Bopomofo)" },
  { key: "spanish", label: "Spanish" },
  { key: "japanese", label: "Japanese" },
  { key: "korean", label: "Korean" },
];

export default async function LearnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Fetch detail and curriculum in parallel — both are account-scoped.
  const [detail, curriculum] = await Promise.all([
    getLearnerDetail(id),
    getLearnerCurriculum(id),
  ]);
  // 404 when the learner does not exist or is not this account's (tenancy).
  if (!detail) notFound();

  const { learner, program, skills, recent, hasActivity } = detail;
  const stats = program ? programStats(program) : { units: 0, lessons: 0, activities: 0 };
  const name = learner.displayName;

  return (
    <div className="mx-auto max-w-5xl">
      <BackLink href="/parent/learners" label="All learners" />

      {/* Header */}
      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <AvatarBadge name={name} size="lg" />
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">{name}</h1>
            {learner.birthMonth && (
              <dl className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-soft">
                <div className="flex items-center gap-1.5">
                  <CakeIcon weight="regular" className="size-4 text-ink-faint" />
                  <dt className="sr-only">Birthday</dt>
                  <dd>Born in {learner.birthMonth}</dd>
                </div>
              </dl>
            )}
          </div>
        </div>

        {program && (
          <div className="rounded-lg border border-line bg-paper-sunk/60 px-4 py-3">
            <p className="font-display text-sm font-semibold">{program.title}</p>
            <p className="text-sm text-ink-soft">{program.subtitle}</p>
            <Pill tone="accent" className="mt-2">
              {stats.units} strands
            </Pill>
          </div>
        )}
      </header>

      {/* Quiet per-learner management links (settings + the "what the AI made"
          provenance trail). Each is its own focused page; clustered here so a
          multi-child family reaches the right child's controls from their card. */}
      <nav aria-label={`Manage ${name}`} className="mt-5 flex flex-wrap gap-2">
        <Link
          href={`/parent/learners/${id}/settings`}
          className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3.5 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
        >
          <GearSixIcon weight="regular" className="size-4" />
          Settings
        </Link>
        <Link
          href={`/parent/learners/${id}/activity`}
          className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3.5 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
        >
          <SparkleIcon weight="regular" className="size-4" />
          What the AI made
        </Link>
      </nav>

      {!hasActivity ? (
        <EmptyState name={name} />
      ) : (
        <>
          <SkillsByDomain skills={skills} />
          <RecentAttempts name={name} recent={recent} />
        </>
      )}

      <CurriculumPanel learnerId={id} curriculum={curriculum} />

      <LearnerDataControls learnerId={id} learnerName={learner.displayName} />
    </div>
  );
}

/** Honest empty state: nothing measured yet, so we invite rather than fabricate. */
function EmptyState({ name }: { name: string }) {
  return (
    <section className="mt-10 grid place-items-center rounded-xl border border-dashed border-line-strong p-12 text-center">
      <span
        aria-hidden
        className="grid size-12 place-items-center rounded-md border border-line bg-accent/12 text-accent-deep"
      >
        <SparkleIcon weight="regular" className="size-6" />
      </span>
      <p className="mt-4 font-display text-lg font-semibold">No activities yet</p>
      <p className="mt-1 max-w-md text-ink-soft">
        When {name} starts, her progress shows here: skills by subject, recent activity, and an
        honest read on how things are going.
      </p>
    </section>
  );
}

function SkillsByDomain({ skills }: { skills: SkillStatus[] }) {
  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold tracking-tight">Skills by subject</h2>
        <p className="text-sm text-ink-soft">Only what she has worked on appears as solid or emerging.</p>
      </div>

      <div className="mt-5 flex flex-col gap-4">
        {DOMAIN_ORDER.map(({ key, label }) => {
          const domainSkills = skills.filter((s) => s.domain === key);
          if (domainSkills.length === 0) return null;

          const tracked = domainSkills.filter((s) => s.outcome);
          const domainProgress =
            tracked.length > 0
              ? tracked.reduce((sum, s) => sum + outcomeWeight(s.outcome!), 0) / tracked.length
              : 0;

          return (
            <article key={key} className="rounded-xl border border-line p-5">
              <div className="flex items-center gap-4">
                <ProgressRing
                  value={domainProgress}
                  size={52}
                  stroke={7}
                  label={`${label}: progress`}
                >
                  <span className="font-display text-xs font-semibold text-ink">
                    {Math.round(domainProgress * 100)}
                  </span>
                </ProgressRing>
                <div>
                  <h3 className="font-display text-lg font-semibold tracking-tight">{label}</h3>
                  <p className="text-sm text-ink-faint">
                    {tracked.length} of {domainSkills.length} skills started
                  </p>
                </div>
              </div>

              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {domainSkills.map((skill) => {
                  const display = skill.outcome ? outcomeDisplay(skill.outcome) : undefined;
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
  );
}

function RecentAttempts({ name, recent }: { name: string; recent: ActivityRow[] }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-semibold tracking-tight">Recent attempts</h2>

      <ul className="mt-4 overflow-hidden rounded-xl border border-line">
        {recent.map((record, i) => (
          <ActivityRowItem
            key={`${record.activityId}-${i}`}
            row={record}
            size="sm"
            className={cn("px-5 py-3.5", i > 0 && "border-t border-line")}
          />
        ))}
      </ul>
      <p className="mt-3 text-sm text-ink-faint">
        Showing {name}&rsquo;s most recent activity, newest first.
      </p>
    </section>
  );
}
