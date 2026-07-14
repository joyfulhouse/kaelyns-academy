import type { Metadata } from "next";
import Link from "next/link";
import { CaretRightIcon, UsersThreeIcon } from "@phosphor-icons/react/dist/ssr";
import { Pill } from "@/components/ui/Pill";
import { Surface } from "@/components/ui/Surface";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { AddChildForm } from "@/components/parent/AddChildForm";
import { HandoffButton } from "@/components/parent/HandoffButton";
import { outcomeDisplay } from "@/components/parent/skill-display";
import { avatarInitial, listLearnerCards, type LearnerCard } from "@/app/(parent)/data";
import { programStats } from "@/content";
import { parentUnlockChallenge } from "@/app/(parent)/parent-unlock-challenge";

export const metadata: Metadata = { title: "Learners" };

export default async function LearnersPage() {
  const unlockChallenge = await parentUnlockChallenge();
  if (unlockChallenge) return unlockChallenge;

  const learners = await listLearnerCards();

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Parent home"
        title="Learners"
        description="Each learner keeps only a display name and birth month. Open one to see skills by subject and recent activity."
      />

      {learners.length > 0 ? (
        <ul className="mt-8 flex flex-col gap-3">
          {learners.map((card) => (
            <li key={card.learner.id}>
              <LearnerListItem card={card} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          className="mt-8 p-12"
          icon={<UsersThreeIcon weight="regular" className="size-10 text-ink-faint" />}
          title="No learners yet"
          description="Add your child below to enroll them and start following their progress."
        />
      )}

      {/* Add a child */}
      <Surface as="section" tone="raised" aria-labelledby="add-child-heading" className="mt-8 p-6">
        <h2 id="add-child-heading" className="font-display text-xl font-semibold tracking-tight">
          Add a child
        </h2>
        <p className="mt-1 max-w-prose text-sm text-ink-soft">
          We enroll them in Kaelyn&rsquo;s Adaptive Curriculum, which meets each strand at their
          real level. You can open their profile any time to follow along.
        </p>
        <div className="mt-5">
          <AddChildForm />
        </div>
      </Surface>
    </div>
  );
}

function LearnerListItem({ card }: { card: LearnerCard }) {
  const { learner, program, summary } = card;
  const stats = program ? programStats(program) : { units: 0, lessons: 0, activities: 0 };
  const started = summary.active > 0;

  return (
    <div className="rounded-xl border border-line p-5 transition-colors hover:border-line-strong hover:bg-paper-sunk/40">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Link
          href={`/parent/learners/${learner.id}`}
          className="group flex min-w-0 flex-1 items-center gap-4 rounded-lg"
        >
          <span
            aria-hidden
            className="grid size-12 shrink-0 place-items-center rounded-pill border-2 border-ink/15 bg-accent/15 font-display text-xl font-semibold text-ink"
          >
            {avatarInitial(learner.displayName)}
          </span>

          <div className="min-w-0 flex-1">
            <h3 className="font-display text-lg font-semibold tracking-tight">{learner.displayName}</h3>
            <p className="text-sm text-ink-soft">
              {program ? `${program.title} · ${stats.units} strands` : "Not enrolled"}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {started ? (
                <>
                  <Pill tone="success" icon={outcomeDisplay("solid").icon}>
                    {summary.counts.solid} solid
                  </Pill>
                  <Pill tone="ready" icon={outcomeDisplay("emerging").icon}>
                    {summary.counts.emerging} emerging
                  </Pill>
                </>
              ) : (
                <Pill tone="neutral">No activities yet</Pill>
              )}
            </div>
          </div>

          <CaretRightIcon
            weight="bold"
            className="size-5 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5"
          />
        </Link>
        <HandoffButton learnerId={learner.id} learnerName={learner.displayName} />
      </div>
    </div>
  );
}
