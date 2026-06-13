"use client";

import { useState } from "react";
import {
  ClockIcon,
  DownloadSimpleIcon,
  RobotIcon,
  SpeakerHighIcon,
  TrashIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { SampleBadge } from "@/components/parent/SampleBadge";

const TIME_LIMIT_OPTIONS = [
  { value: "0", label: "No limit" },
  { value: "15", label: "15 minutes" },
  { value: "20", label: "20 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "45", label: "45 minutes" },
  { value: "60", label: "1 hour" },
];

interface SafetySettings {
  dailyTimeLimit: string;
  aiFeatures: boolean;
  readAloudDefault: boolean;
}

// Sensible defaults until a settings table backs this (see TODO on save).
const DEFAULTS: SafetySettings = {
  dailyTimeLimit: "30",
  aiFeatures: true,
  readAloudDefault: true,
};

export function SettingsForm() {
  const [settings, setSettings] = useState<SafetySettings>(DEFAULTS);
  const [saved, setSaved] = useState(false);

  function update<K extends keyof SafetySettings>(key: K, value: SafetySettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function handleSave() {
    // TODO(P6): persist via a server action writing to a per-account settings
    // table, scoped through withAccount() in @/lib/tenancy. Local-only for now.
    setSaved(true);
  }

  return (
    <div className="flex flex-col gap-10">
      {/* Safety & time */}
      <section>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold tracking-tight">Safety &amp; time</h2>
          <SampleBadge />
        </div>
        <p className="mt-1 max-w-prose text-sm text-ink-soft">
          These controls are not saved yet. The screens are real; wiring them to your account
          arrives with account settings.
        </p>

        <div className="mt-5 flex flex-col divide-y divide-line rounded-xl border border-line">
          <div className="flex items-start gap-3 p-5">
            <ClockIcon weight="regular" className="mt-0.5 size-5 shrink-0 text-accent-deep" />
            <div className="min-w-0 flex-1">
              <Field
                id="time-limit"
                label="Daily time limit"
                hint="A gentle cap on learning time per day. The studio winds down, it never slams shut."
              >
                {(field) => (
                  <Select
                    {...field}
                    options={TIME_LIMIT_OPTIONS}
                    value={settings.dailyTimeLimit}
                    onChange={(e) => update("dailyTimeLimit", e.target.value)}
                    className="mt-1 max-w-xs"
                  />
                )}
              </Field>
            </div>
          </div>

          <div className="flex items-start gap-3 p-5">
            <RobotIcon weight="regular" className="mt-0.5 size-5 shrink-0 text-accent-deep" />
            <Switch
              checked={settings.aiFeatures}
              onChange={(v) => update("aiFeatures", v)}
              label="AI tutoring features"
              description="The bounded tutor adapts difficulty and generates fresh practice. Children never free-chat with it, and you can turn it off entirely."
              className="flex-1"
            />
          </div>

          <div className="flex items-start gap-3 p-5">
            <SpeakerHighIcon weight="regular" className="mt-0.5 size-5 shrink-0 text-accent-deep" />
            <Switch
              checked={settings.readAloudDefault}
              onChange={(v) => update("readAloudDefault", v)}
              label="Read-aloud by default"
              description="Prompts and instructions are spoken aloud automatically. Recommended for pre- and early readers."
              className="flex-1"
            />
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <Button variant="primary" size="md" onClick={handleSave}>
            Save changes
          </Button>
          {saved && (
            <span role="status" className="text-sm font-medium text-success">
              Saved on this device. Account-wide saving is coming soon.
            </span>
          )}
        </div>
      </section>

      {/* Your data */}
      <section>
        <h2 className="font-display text-xl font-semibold tracking-tight">Your data</h2>
        <p className="mt-1 max-w-prose text-sm text-ink-soft">
          We keep only a display name and birth month for each learner, plus your account email.
          No ads, no third-party tracking. Your child&rsquo;s data is yours.
        </p>

        <div className="mt-5 flex flex-col gap-4 rounded-xl border border-line p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <DownloadSimpleIcon weight="regular" className="mt-0.5 size-5 shrink-0 text-ink-soft" />
            <div>
              <h3 className="font-display text-base font-semibold">Export your data</h3>
              <p className="mt-0.5 max-w-md text-sm text-ink-soft">
                Download everything we hold for your account and learners as a single file.
              </p>
            </div>
          </div>
          {/* TODO(P6): wire to a server action that assembles a per-account export
              (account + learners + attempts), scoped via withAccount(). */}
          <Button variant="soft" size="md" disabled title="Data export arrives with account settings">
            Request export
          </Button>
        </div>

        <div className="mt-4 flex flex-col gap-4 rounded-xl border border-danger/30 bg-danger/5 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <TrashIcon weight="regular" className="mt-0.5 size-5 shrink-0 text-danger" />
            <div>
              <h3 className="font-display text-base font-semibold text-ink">Delete your data</h3>
              <p className="mt-0.5 max-w-md text-sm text-ink-soft">
                Permanently remove your account and every learner&rsquo;s records. This cannot be
                undone.
              </p>
            </div>
          </div>
          {/* TODO(P6): wire to a confirmed server action that deletes the account
              and cascades to learners/attempts, scoped via withAccount(). */}
          <Button
            variant="soft"
            size="md"
            disabled
            title="Account deletion arrives with account settings"
            className="border-danger/30 text-danger"
          >
            Delete account
          </Button>
        </div>
      </section>
    </div>
  );
}
