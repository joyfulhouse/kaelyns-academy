import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { BackLink } from "@/components/ui/BackLink";
import { getLearnerInterestsForParent, getLearnerSettingsForParent } from "@/app/(parent)/data";
import { SettingsForm } from "@/app/(parent)/parent/settings/SettingsForm";
import { InterestsCard } from "@/components/parent/InterestsCard";

// Deliberately a static, non-identifying title (matches the learner-detail page).
// The child's display name is child PII (spec §8) and is shown only inside the
// authenticated page body — never in `document.title`, which leaks into browser
// history, OS window/tab previews, and client telemetry (Sentry breadcrumbs).
export const metadata: Metadata = { title: "Learner settings" };

/**
 * Per-learner settings page (P6). Closes the multi-child gap: a parent can see
 * and change EACH child's §8 AI kill-switch, daily goal, and read-aloud default
 * — not just the primary learner's (the account Settings page). Reuses the
 * generalized {@link SettingsForm} + the existing `saveLearnerSettingsAction`;
 * the only new piece is a read scoped to the requested learner. 404s (via the
 * inherited learner-group not-found) when the learner isn't this account's.
 */
export default async function LearnerSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, interests] = await Promise.all([
    getLearnerSettingsForParent(id),
    getLearnerInterestsForParent(id),
  ]);
  // 404 when the learner does not exist or is not this account's (tenancy).
  if (!data) notFound();

  const { learner, settings } = data;

  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href={`/parent/learners/${id}`} label={`Back to ${learner.displayName}`} />

      <PageHeader
        className="mt-4"
        eyebrow="Learner settings"
        title={`${learner.displayName}’s settings`}
        description={`Safety, time, and the AI tutor for ${learner.displayName}. These apply to this child only.`}
      />

      <div className="mt-8 flex flex-col gap-10">
        <SettingsForm learnerId={learner.id} initialSettings={settings} />
        {interests && (
          <InterestsCard
            learnerId={learner.id}
            allInterests={interests.allInterests}
            offeredIds={interests.offeredIds}
          />
        )}
      </div>
    </div>
  );
}
