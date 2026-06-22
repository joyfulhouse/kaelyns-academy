"use client";

import { useState, useTransition } from "react";
import {
  CheckCircleIcon,
  DownloadSimpleIcon,
  ListChecksIcon,
  RobotIcon,
  SpeakerHighIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { SampleBadge } from "@/components/parent/SampleBadge";
import { saveLearnerSettingsAction } from "@/app/(parent)/actions";
import type { LearnerSettings } from "@/lib/content/config";

/**
 * Parent settings form. Controls map directly to `LearnerSettings`
 * (dailyGoal, aiPractice, readAloud) and persist via `saveLearnerSettingsAction`
 * when a `primaryLearnerId` is available. Settings are scoped to the primary
 * (first) learner for now; per-learner settings UI lands in a later phase.
 *
 * The form is initialized from the learner's *persisted* settings (passed as
 * `initialSettings` by the server page), not hardcoded defaults — so a stored
 * `aiPractice:false` (the §8 AI kill-switch) renders OFF and stays OFF across
 * reloads instead of silently re-enabling on the next save.
 */

const DAILY_GOAL_OPTIONS = [
  { value: "0", label: "No goal" },
  { value: "3", label: "3 activities" },
  { value: "5", label: "5 activities" },
  { value: "10", label: "10 activities" },
  { value: "15", label: "15 activities" },
  { value: "20", label: "20 activities" },
];

interface SettingsState {
  dailyGoal: string;
  aiFeatures: boolean;
  readAloudDefault: boolean;
}

const DEFAULTS: SettingsState = {
  dailyGoal: "5",
  aiFeatures: true,
  readAloudDefault: true,
};

/**
 * PURE. Map a learner's persisted `LearnerSettings` onto the form's field names,
 * falling back to `DEFAULTS` *per absent field*. This per-field fallback is what
 * makes a stored `aiPractice:false` sticky: a missing field takes the default,
 * but a present `false` is preserved (never coerced back to the AI-on default).
 * `null` settings (no learner / no stored row) yields the full defaults.
 */
export function settingsToFormState(settings: LearnerSettings | null): SettingsState {
  if (!settings) return DEFAULTS;
  return {
    dailyGoal: settings.dailyGoal !== undefined ? String(settings.dailyGoal) : DEFAULTS.dailyGoal,
    aiFeatures: settings.aiPractice ?? DEFAULTS.aiFeatures,
    readAloudDefault: settings.readAloud ?? DEFAULTS.readAloudDefault,
  };
}

type SaveState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "error"; message: string };

export function SettingsForm({
  primaryLearnerId,
  initialSettings,
}: {
  primaryLearnerId: string | null;
  initialSettings: LearnerSettings | null;
}) {
  const [settings, setSettings] = useState<SettingsState>(() =>
    settingsToFormState(initialSettings),
  );
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof SettingsState>(key: K, value: SettingsState[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaveState({ status: "idle" });
  }

  function handleSave() {
    if (isPending) return;

    // With no learner there is nothing to persist — Save is disabled in that
    // state, so we never reach here and never claim a save that didn't happen.
    if (!primaryLearnerId) return;

    const dailyGoal = parseInt(settings.dailyGoal, 10);

    startTransition(async () => {
      try {
        const result = await saveLearnerSettingsAction(primaryLearnerId, {
          dailyGoal: Number.isFinite(dailyGoal) ? dailyGoal : undefined,
          aiPractice: settings.aiFeatures,
          readAloud: settings.readAloudDefault,
        });
        if (result.ok) {
          setSaveState({ status: "saved" });
        } else {
          setSaveState({ status: "error", message: result.message });
        }
      } catch {
        setSaveState({
          status: "error",
          message: "Could not save settings. Please try again.",
        });
      }
    });
  }

  return (
    <div className="flex flex-col gap-10">
      {/* Learning & AI */}
      <section>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold tracking-tight">Learning &amp; AI</h2>
          {!primaryLearnerId && <SampleBadge />}
        </div>
        {!primaryLearnerId && (
          <p className="mt-1 max-w-prose text-sm text-ink-soft">
            These controls are not saved yet. Add a child first to persist settings to their profile.
          </p>
        )}

        <div className="mt-5 flex flex-col divide-y divide-line rounded-xl border border-line">
          <div className="flex items-start gap-3 p-5">
            <ListChecksIcon weight="regular" className="mt-0.5 size-5 shrink-0 text-accent-deep" />
            <div className="min-w-0 flex-1">
              <Field
                id="daily-goal"
                label="Daily activity goal"
                hint="How many activities your child aims to complete each day. 0 means no goal."
              >
                {(field) => (
                  <Select
                    {...field}
                    options={DAILY_GOAL_OPTIONS}
                    value={settings.dailyGoal}
                    onChange={(e) => update("dailyGoal", e.target.value)}
                    disabled={isPending}
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
              disabled={isPending}
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
              disabled={isPending}
              className="flex-1"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            size="md"
            onClick={handleSave}
            disabled={isPending || !primaryLearnerId}
            title={primaryLearnerId ? undefined : "Add a child to save settings"}
          >
            {isPending ? "Saving…" : "Save changes"}
          </Button>

          {saveState.status === "saved" && (
            <span
              role="status"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-success"
            >
              <CheckCircleIcon weight="fill" className="size-4" />
              Settings saved.
            </span>
          )}

          {saveState.status === "error" && (
            <span
              role="alert"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-danger"
            >
              <WarningCircleIcon weight="regular" className="size-4" />
              {saveState.message}
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
