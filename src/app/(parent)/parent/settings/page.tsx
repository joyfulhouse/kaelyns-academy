import type { Metadata } from "next";
import Link from "next/link";
import { CaretRightIcon } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/ui/PageHeader";
import { getAccountEmail, getPrimaryLearnerSettings, listLearnerCards } from "@/app/(parent)/data";
import { AccountDataControls } from "@/components/parent/AccountDataControls";
import { SettingsForm } from "./SettingsForm";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  // The §8 AI kill-switch / daily goal / read-aloud are PER CHILD (each learner has
  // its own settings page). So this account page must NOT present one toggle as if
  // it governed every child — a multi-child parent could turn "AI" off here and
  // believe it applied to all kids while only the first changed. Load the learners
  // and branch on count. accountEmail seeds the delete-account typed confirmation.
  const [learners, accountEmail] = await Promise.all([listLearnerCards(), getAccountEmail()]);

  // One child → keep the convenient inline form, clearly named. 2+ children → link
  // to each child's own settings page (no single toggle that looks account-wide).
  const single = learners.length === 1 ? learners[0].learner : null;
  const primary = single ? await getPrimaryLearnerSettings() : null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Parent home"
        title="Settings"
        description="Safety, time, and the AI tutor are yours to control — for each child. Calm by default."
      />

      {single && primary ? (
        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold text-ink">
            {single.displayName}&rsquo;s learning &amp; AI
          </h2>
          <p className="mt-1 text-sm text-ink-soft">These apply to {single.displayName} only.</p>
          <div className="mt-3">
            <SettingsForm learnerId={primary.primaryLearnerId} initialSettings={primary.settings} />
          </div>
        </section>
      ) : learners.length > 1 ? (
        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold text-ink">Each child&rsquo;s settings</h2>
          <p className="mt-1 max-w-prose text-sm text-ink-soft">
            Safety, the daily goal, and the AI tutor are set per child — open a learner to change
            theirs.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {learners.map(({ learner }) => (
              <li key={learner.id}>
                <Link
                  href={`/parent/learners/${learner.id}/settings`}
                  className="flex items-center justify-between rounded-lg border border-line bg-paper-raised px-4 py-3 transition-colors duration-200 ease-out-quart hover:border-line-strong"
                >
                  <span className="font-medium text-ink">{learner.displayName}</span>
                  <CaretRightIcon weight="bold" className="size-4 text-ink-faint" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Account-level export + delete (re-auth gated) — spec §8 COPPA controls. */}
      <AccountDataControls accountEmail={accountEmail} />
    </div>
  );
}
