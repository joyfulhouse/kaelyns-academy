import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRightIcon,
  CakeIcon,
  CaretRightIcon,
  SparkleIcon,
  StarIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Pill } from "@/components/ui/Pill";
import { Surface } from "@/components/ui/Surface";
import { Stars } from "@/components/ui/Stars";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProgressReportCard } from "@/components/parent/ProgressReportCard";
import { outcomeDisplay } from "@/components/parent/skill-display";
import {
  avatarInitial,
  getOverview,
  type ActivityRow,
  type OutcomeSummary,
  type OverviewData,
} from "@/app/(parent)/data";
import type { LearnerRow } from "@/lib/tutor/store";
import type { Program } from "@/content";

export const metadata: Metadata = { title: "Home" };

export default async function ParentHomePage() {
  const overview = await getOverview();

  if (!overview.primary) return <NoLearners />;

  const { learner, program, summary, recent, hasActivity } = overview.primary;

  return (
    <div className="mx-auto max-w-5xl">
      {/* Greeting */}
      <PageHeader
        eyebrow="Parent home"
        title={`How ${learner.displayName} is doing`}
        action={
          overview.learners.length > 1 && (
            <Link
              href="/parent/learners"
              className="inline-flex items-center gap-1 text-sm font-medium text-accent-deep underline-offset-2 hover:underline"
            >
              All {overview.learners.length} learners
              <ArrowRightIcon weight="bold" className="size-4" />
            </Link>
          )
        }
      />

      {/* Learner profile + program: two unlike columns, not a card grid */}
      <section className="mt-8 grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <ProfileCard learner={learner} program={program} />
        <ProgramPanel program={program} summary={summary} hasActivity={hasActivity} learnerName={learner.displayName} />
      </section>

      {/* AI weekly report, grounded in this learner's real data */}
      <section className="mt-10">
        <ProgressReportCard learnerId={learner.id} learnerName={learner.displayName} />
      </section>

      {/* Recent activity */}
      <section className="mt-10">
        <RecentActivity learnerId={learner.id} learnerName={learner.displayName} recent={recent} />
      </section>
    </div>
  );
}

/** No learners on the account yet: invite the parent to add their first child. */
function NoLearners() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Parent home" title="Welcome" />

      <Surface as="section" tone="raised" className="mt-8 grid place-items-center p-12 text-center">
        <span
          aria-hidden
          className="grid size-14 place-items-center rounded-md border border-line bg-accent/12 text-accent-deep"
        >
          <UsersThreeIcon weight="regular" className="size-7" />
        </span>
        <p className="mt-4 font-display text-xl font-semibold tracking-tight">Add your first child</p>
        <p className="mt-1 max-w-md text-ink-soft">
          Enroll a learner to start following their progress. We keep only a display name and birth
          month.
        </p>
        <Button href="/parent/learners" variant="accent" size="md" className="mt-5">
          Add a child
          <ArrowRightIcon weight="bold" className="size-4" />
        </Button>
      </Surface>
    </div>
  );
}

function ProfileCard({ learner, program }: { learner: LearnerRow; program: Program | undefined }) {
  return (
    <Surface tone="raised" className="flex flex-col gap-5 p-6">
      <div className="flex items-center gap-4">
        <span
          aria-hidden
          className="grid size-14 place-items-center rounded-pill border-2 border-ink/15 bg-accent/15 font-display text-2xl font-semibold text-ink"
        >
          {avatarInitial(learner.displayName)}
        </span>
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight">{learner.displayName}</h2>
          <p className="text-sm text-ink-soft">{program?.ageBand ?? "Learner"}</p>
        </div>
      </div>

      {learner.birthMonth && (
        <dl className="flex flex-col gap-2.5 text-sm">
          <div className="flex items-center gap-2 text-ink-soft">
            <CakeIcon weight="regular" className="size-4 text-ink-faint" />
            <dt className="sr-only">Birthday</dt>
            <dd>Born in {learner.birthMonth}</dd>
          </div>
        </dl>
      )}

      {program && (
        <div className="rounded-lg border border-line bg-paper-sunk/60 p-4">
          <p className="font-display text-sm font-semibold">{program.title}</p>
          <p className="text-sm text-ink-soft">{program.subtitle}</p>
        </div>
      )}

      <Link
        href={`/parent/learners/${learner.id}`}
        className="inline-flex items-center gap-1 text-sm font-medium text-accent-deep underline-offset-2 hover:underline"
      >
        See {learner.displayName}&rsquo;s full progress
        <ArrowRightIcon weight="bold" className="size-4" />
      </Link>
    </Surface>
  );
}

/**
 * The program panel: the program's purpose, plus an honest per-outcome summary
 * of real skill_state (the asynchronous spread), or an empty invite if nothing
 * has been done yet. No fabricated "week N" or minute counts.
 */
function ProgramPanel({
  program,
  summary,
  hasActivity,
  learnerName,
}: {
  program: Program | undefined;
  summary: OutcomeSummary;
  hasActivity: boolean;
  learnerName: string;
}) {
  return (
    <article className="flex flex-col rounded-xl border border-line bg-accent/8 p-6">
      <div className="flex items-center justify-between">
        <Pill tone="accent" icon={<SparkleIcon weight="fill" className="text-accent-deep" />}>
          {program ? program.title : "Learning"}
        </Pill>
      </div>

      {program && (
        <>
          <h2 className="mt-4 font-display text-2xl font-semibold tracking-tight">
            {program.subtitle}
          </h2>
          <p className="mt-2 text-ink-soft">{program.summary}</p>
        </>
      )}

      <div className="mt-5 border-t border-line/70 pt-5">
        {hasActivity ? (
          <>
            <p className="text-sm text-ink-soft">
              Across {summary.active} of {summary.total} tracked skills she has worked on:
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill tone="success" icon={outcomeDisplay("solid").icon}>
                {summary.counts.solid} solid
              </Pill>
              <Pill tone="ready" icon={outcomeDisplay("emerging").icon}>
                {summary.counts.emerging} emerging
              </Pill>
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-soft">
            No activities yet. When {learnerName} starts, her progress across each strand shows
            here.
          </p>
        )}
      </div>
    </article>
  );
}

function RecentActivity({
  learnerId,
  learnerName,
  recent,
}: {
  learnerId: string;
  learnerName: string;
  recent: ActivityRow[];
}) {
  return (
    <div className="flex flex-col rounded-xl border border-line p-6">
      <h2 className="font-display text-lg font-semibold tracking-tight">Recent activity</h2>

      {recent.length > 0 ? (
        <>
          <ul className="mt-4 divide-y divide-line">
            {recent.map((record, i) => (
              <li
                key={`${record.activityId}-${i}`}
                className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <span
                  aria-hidden
                  className="grid size-10 shrink-0 place-items-center rounded-md border border-line bg-paper-sunk/70 text-ink-soft"
                >
                  <StarIcon weight={record.stars >= 3 ? "fill" : "regular"} className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{record.title}</p>
                  <p className="text-sm text-ink-faint">
                    {record.kindLabel} · {record.when}
                  </p>
                </div>
                <Stars value={record.stars} size="sm" />
              </li>
            ))}
          </ul>

          <Link
            href={`/parent/learners/${learnerId}`}
            className="mt-4 inline-flex items-center gap-1 self-start text-sm font-medium text-accent-deep underline-offset-2 hover:underline"
          >
            View all activity
            <CaretRightIcon weight="bold" className="size-4" />
          </Link>
        </>
      ) : (
        <p className="mt-4 text-sm text-ink-soft">
          Nothing yet. {learnerName}&rsquo;s completed activities will appear here, newest first.
        </p>
      )}
    </div>
  );
}
