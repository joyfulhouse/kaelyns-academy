import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";
import { getLearnerSettingsForParent } from "@/app/(parent)/data";
import { SettingsForm } from "@/app/(parent)/parent/settings/SettingsForm";

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
  const data = await getLearnerSettingsForParent(id);
  // 404 when the learner does not exist or is not this account's (tenancy).
  if (!data) notFound();

  const { learner, settings } = data;

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={`/parent/learners/${id}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"
      >
        <ArrowLeftIcon weight="bold" className="size-4" />
        Back to {learner.displayName}
      </Link>

      <header className="mt-4">
        <p className="font-display text-sm font-semibold text-ink-faint">Learner settings</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
          {learner.displayName}&rsquo;s settings
        </h1>
        <p className="mt-2 max-w-prose text-ink-soft">
          Safety, time, and the AI tutor for {learner.displayName}. These apply to this child only.
        </p>
      </header>

      <div className="mt-8">
        <SettingsForm learnerId={learner.id} initialSettings={settings} />
      </div>
    </div>
  );
}
