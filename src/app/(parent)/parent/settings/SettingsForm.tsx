"use client";

import { useState } from "react";
import {
  KeyIcon,
  ListChecksIcon,
  LockKeyIcon,
  MicrophoneIcon,
  RobotIcon,
  SpeakerHighIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { TextInput } from "@/components/ui/TextInput";
import { SampleBadge } from "@/components/parent/SampleBadge";
import { useAsyncAction } from "@/lib/hooks/useAsyncAction";
import { saveLearnerSettingsAction } from "@/app/(parent)/actions";
import {
  clearParentPinByPasswordAction,
  setParentPinAction,
} from "@/app/(parent)/pin-actions";
import type { LearnerSettings } from "@/lib/content/config";

/**
 * Parent settings form for ONE learner. Controls map directly to
 * `LearnerSettings` (dailyGoal, aiPractice, readAloud, oralReading) and persist via
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
  oralReading: boolean;
}

const DEFAULTS: SettingsState = {
  dailyGoal: "5",
  aiFeatures: true,
  readAloudDefault: true,
  oralReading: false,
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
    oralReading: settings.oralReading ?? DEFAULTS.oralReading,
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
          oralReading: settings.oralReading,
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

          <div className="flex items-start gap-3 p-5">
            <MicrophoneIcon weight="regular" className="mt-0.5 size-5 shrink-0 text-accent-deep" />
            <Switch
              checked={settings.oralReading}
              onChange={(value) => update("oralReading", value)}
              label="Microphone activities"
              description="Allows oral reading checks and talk-to-write. Audio and recognized words are never saved by the app."
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

const CLIENT_PIN_REGEX = /^\d{4,6}$/;

/** Account-level shared-device lock controls for `/parent/settings`. */
export function GrownUpLock({ initialHasPin }: { initialHasPin: boolean }) {
  const [hasPin, setHasPin] = useState(initialHasPin);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [password, setPassword] = useState("");
  const pinAction = useAsyncAction();
  const removeAction = useAsyncAction();

  function updatePin(value: string, setter: (next: string) => void) {
    if (/^\d*$/.test(value)) setter(value);
    pinAction.reset();
  }

  function handleSetPin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pinAction.pending) return;
    if (!CLIENT_PIN_REGEX.test(pin)) {
      pinAction.fail("Use 4 to 6 numbers.");
      return;
    }
    if (pin !== confirmPin) {
      pinAction.fail("Those PINs do not match.");
      return;
    }

    pinAction.run(() => setParentPinAction(pin, confirmPin), {
      onSuccess: () => {
        setHasPin(true);
        setPin("");
        setConfirmPin("");
      },
      fallbackMessage: "We could not save the PIN right now. Try again.",
    });
  }

  function handleRemovePin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (removeAction.pending) return;
    if (!password) {
      removeAction.fail("Enter your account password.");
      return;
    }

    removeAction.run(() => clearParentPinByPasswordAction(password), {
      onSuccess: () => {
        setHasPin(false);
        setPassword("");
        setPin("");
        setConfirmPin("");
      },
      fallbackMessage: "We could not remove the PIN right now. Try again.",
    });
  }

  return (
    <section id="pin" className="scroll-mt-24" aria-labelledby="grown-up-lock-heading">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-md border border-line bg-accent/12 text-accent-deep"
        >
          <LockKeyIcon weight="regular" className="size-5" />
        </span>
        <div>
          <h2 id="grown-up-lock-heading" className="font-display text-xl font-semibold tracking-tight">
            Grown-up lock
          </h2>
          <p className="mt-1 max-w-prose text-sm text-ink-soft">
            Add a 4–6 digit PIN before handing over a shared device. Once unlocked, the grown-up
            area stays open for 15 minutes in this browser.
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-line">
        <form onSubmit={handleSetPin} className="p-5">
          <h3 className="font-display text-base font-semibold">
            {hasPin ? "Change PIN" : "Set PIN"}
          </h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field id="grown-up-pin" label={hasPin ? "New PIN" : "PIN"}>
              {(field) => (
                <TextInput
                  {...field}
                  icon={<KeyIcon weight="regular" className="size-5" />}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="new-password"
                  maxLength={6}
                  value={pin}
                  onChange={(event) => updatePin(event.target.value, setPin)}
                  disabled={pinAction.pending}
                />
              )}
            </Field>
            <Field id="grown-up-pin-confirm" label="Confirm PIN">
              {(field) => (
                <TextInput
                  {...field}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="new-password"
                  maxLength={6}
                  value={confirmPin}
                  onChange={(event) => updatePin(event.target.value, setConfirmPin)}
                  disabled={pinAction.pending}
                />
              )}
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button type="submit" variant="accent" size="md" disabled={pinAction.pending}>
              {pinAction.pending ? "Saving…" : hasPin ? "Change PIN" : "Set PIN"}
            </Button>
            {pinAction.succeeded && <StatusMessage tone="success">PIN saved.</StatusMessage>}
            {pinAction.error !== null && (
              <StatusMessage tone="error">{pinAction.error}</StatusMessage>
            )}
          </div>
        </form>

        {hasPin && (
          <form onSubmit={handleRemovePin} className="border-t border-line p-5">
            <h3 className="font-display text-base font-semibold">Remove PIN</h3>
            <p className="mt-1 text-sm text-ink-soft">
              Confirm with your account password. This does not change your password.
            </p>
            <div className="mt-4 max-w-sm">
              <Field id="remove-pin-password" label="Account password">
                {(field) => (
                  <TextInput
                    {...field}
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      removeAction.reset();
                    }}
                    disabled={removeAction.pending}
                  />
                )}
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button type="submit" variant="soft" size="md" disabled={removeAction.pending}>
                {removeAction.pending ? "Checking…" : "Remove PIN"}
              </Button>
              {removeAction.error !== null && (
                <StatusMessage tone="error">{removeAction.error}</StatusMessage>
              )}
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
