import type { Metadata } from "next";
import { SettingsForm } from "./SettingsForm";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
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
        <SettingsForm />
      </div>
    </div>
  );
}
