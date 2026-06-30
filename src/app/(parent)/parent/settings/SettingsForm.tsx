"use client";

import { useState } from "react";
import {
  ListChecksIcon,
  RobotIcon,
  SpeakerHighIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { SampleBadge } from "@/components/parent/SampleBadge";
import { useAsyncAction } from "@/lib/hooks/useAsyncAction";
import { saveLearnerSettingsAction } from "@/app/(parent)/actions";
import type { LearnerSettings } from "@/lib/content/config";

/**
 * Parent settings form for ONE learner. Controls map directly to
 * `LearnerSettings` (dailyGoal, aiPractice, readAloud) and persist via
 * `saveLearnerSettingsAction(learnerId, …)`. It serves two surfaces: the
 * account-wide Settings page (passing the primary learner, or null when the
 * account has no child yet) and the per-learner Settings page
 * (`/parent/learners/[id]/settings`, always a real learner).
 *
 * The form is initialized from the learner's *persisted* settings (passed as
 * `initialSettings` by the server page), not hardcoded defaults — so a stored
 * `aiPractice:false` (the §8 AI kill-switch) renders OFF and stays OFF across
 * reloads instead of silently re-enabling on the next save. This stickiness now
 * holds per-learner, for every child, not just the primary.
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

export function SettingsForm({
  learnerId,
  initialSettings,
}: {
  /**
   * The learner these settings persist to. `null` only on the account-wide
   * Settings page when the account has no learner yet (Save is disabled + a
   * "add a child first" note shows). The per-learner Settings page always
   * passes a real id (it 404s for an unowned learner), so its Save is live.
   */
  learnerId: string | null;
  initialSettings: LearnerSettings | null;
}) {
  const [settings, setSettings] = useState<SettingsState>(() =>
    settingsToFormState(initialSettings),
  );
  const { run, pending, error, succeeded, reset } = useAsyncAction();

  function update<K extends keyof SettingsState>(key: K, value: SettingsState[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    reset();
  }

  function handleSave() {
    if (pending) return;

    // With no learner there is nothing to persist — Save is disabled in that
    // state, so we never reach here and never claim a save that didn't happen.
    if (!learnerId) return;

    const dailyGoal = parseInt(settings.dailyGoal, 10);

    run(
      () =>
        saveLearnerSettingsAction(learnerId, {
          dailyGoal: Number.isFinite(dailyGoal) ? dailyGoal : undefined,
          aiPractice: settings.aiFeatures,
          readAloud: settings.readAloudDefault,
        }),
      { fallbackMessage: "Could not save settings. Please try again." },
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {/* Learning & AI */}
      <section>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold tracking-tight">Learning &amp; AI</h2>
          {!learnerId && <SampleBadge />}
        </div>
        {!learnerId && (
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
                    disabled={pending}
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
              disabled={pending}
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
              disabled={pending}
              className="flex-1"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            size="md"
            onClick={handleSave}
            disabled={pending || !learnerId}
            title={learnerId ? undefined : "Add a child to save settings"}
          >
            {pending ? "Saving…" : "Save changes"}
          </Button>

          {succeeded && <StatusMessage tone="success">Settings saved.</StatusMessage>}

          {error !== null && <StatusMessage tone="error">{error}</StatusMessage>}
        </div>
      </section>
    </div>
  );
}
