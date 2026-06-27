import type { Metadata } from "next";
import { getPrimaryLearnerSettings } from "@/app/(parent)/data";
import { SettingsForm } from "./SettingsForm";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  // Resolve the primary (first) learner AND their persisted settings so the form
  // can initialize its toggles from what's actually stored (not hardcoded
  // defaults) — a parent who turned the §8 AI switch OFF must see it stay OFF
  // across reloads. This page is the account-wide entry point; each learner also
  // has their own settings page (/parent/learners/[id]/settings) reached from
  // their detail page, which is where multi-child families manage each child.
  const { primaryLearnerId, settings } = await getPrimaryLearnerSettings();

  return (
    <div className="mx-auto max-w-3xl">
      <header>
        <p className="font-display text-sm font-semibold text-ink-faint">Parent home</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 max-w-prose text-ink-soft">
          Safety, time, and the AI tutor are yours to control. Calm by default.
        </p>
      </header>

      <div className="mt-8">
        <SettingsForm learnerId={primaryLearnerId} initialSettings={settings} />
      </div>
    </div>
  );
}
