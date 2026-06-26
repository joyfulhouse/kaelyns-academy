"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { TextInput } from "@/components/ui/TextInput";
import { updateEnrollmentConfigAction } from "@/app/(parent)/actions";
import type { EnrollmentConfig } from "@/lib/content/config";

/**
 * Per-enrollment configuration controls: band (ready|stretch), active unit
 * toggles, AI practice, and daily goal. Wired to `updateEnrollmentConfigAction`
 * via the AddChildForm pattern (useTransition + router.refresh on success).
 *
 * Active-unit semantics: all units on → omit `activeUnitKeys` from the stored
 * config (means "all active"); any unit off → include the list of active keys
 * explicitly. This keeps the common case tidy in the DB.
 */

const BAND_OPTIONS = [
  { value: "ready", label: "Ready — grade-level activities" },
  { value: "stretch", label: "Stretch — a little ahead" },
];

/**
 * Parse the daily-goal text field into the value we both validate against and
 * persist, so the two can never disagree. Empty = "use the default" (returns
 * `value: undefined`, `valid: true`). A non-empty entry is valid only as a plain
 * whole number in [0, 50]: we match digits only (`/^\d+$/`) so browser-accepted
 * number syntax like `1e1` or `5.5` is rejected rather than silently coerced to
 * a different saved value (e.g. `parseInt("1e1") === 1`).
 */
export function parseDailyGoal(raw: string): {
  value: number | undefined;
  valid: boolean;
} {
  const trimmed = raw.trim();
  if (trimmed === "") return { value: undefined, valid: true };
  if (!/^\d+$/.test(trimmed)) return { value: undefined, valid: false };
  const value = Number(trimmed);
  if (value > 50) return { value: undefined, valid: false };
  return { value, valid: true };
}

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

export interface EnrollmentConfigFormProps {
  learnerId: string;
  slug: string;
  units: { key: string; title: string }[];
  config: EnrollmentConfig;
}

export function EnrollmentConfigForm({
  learnerId,
  slug,
  units,
  config,
}: EnrollmentConfigFormProps) {
  const router = useRouter();
  const bandId = useId();
  const dailyGoalId = useId();

  // Derive initial "active unit keys" set: undefined/empty in config = all on.
  const allActive = !config.activeUnitKeys || config.activeUnitKeys.length === 0;
  const [activeKeys, setActiveKeys] = useState<Set<string>>(
    allActive
      ? new Set(units.map((u) => u.key))
      : new Set(config.activeUnitKeys),
  );

  const [band, setBand] = useState<string>(config.band ?? "ready");
  const [aiPractice, setAiPractice] = useState<boolean>(config.aiPractice ?? true);
  const [dailyGoal, setDailyGoal] = useState<string>(
    String(config.dailyGoal ?? 5),
  );
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [isPending, startTransition] = useTransition();

  // Parse + validate the daily goal once (see parseDailyGoal) so the value we
  // surface and the value we save can never disagree.
  const { value: parsedGoal, valid: goalValid } = parseDailyGoal(dailyGoal);
  const goalError = goalValid ? undefined : "Enter a whole number from 0 to 50.";

  // Auto-dismiss the "Saved" confirmation after a few seconds. Errors are left
  // sticky so the parent always sees what failed.
  useEffect(() => {
    if (saveState.status !== "saved") return;
    const timer = setTimeout(() => setSaveState({ status: "idle" }), 3000);
    return () => clearTimeout(timer);
  }, [saveState.status]);

  function toggleUnit(key: string, checked: boolean) {
    setActiveKeys((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
    setSaveState({ status: "idle" });
  }

  function handleSave() {
    if (isPending) return;
    if (goalError) return;

    // Build the config: when every unit is active, omit activeUnitKeys entirely.
    const allOn = units.every((u) => activeKeys.has(u.key));

    // Narrow `band` (a plain string from the <select>) against the allowed
    // literals instead of casting — an out-of-range value becomes undefined and
    // is rejected/normalized server-side rather than silently typed as valid.
    const bandValue = band === "ready" || band === "stretch" ? band : undefined;

    const nextConfig: EnrollmentConfig = {
      band: bandValue,
      activeUnitKeys: allOn ? undefined : [...activeKeys],
      aiPractice,
      dailyGoal: parsedGoal,
    };

    startTransition(async () => {
      setSaveState({ status: "saving" });
      try {
        const result = await updateEnrollmentConfigAction(learnerId, slug, nextConfig);
        if (result.ok) {
          setSaveState({ status: "saved" });
          router.refresh();
        } else {
          setSaveState({ status: "error", message: result.message });
        }
      } catch {
        setSaveState({
          status: "error",
          message: "Could not save config. Please try again.",
        });
      }
    });
  }

  return (
    <div className="mt-4 flex flex-col gap-5 border-t border-line pt-4">
      {/* Band */}
      <Field id={bandId} label="Learning band">
        {(field) => (
          <Select
            {...field}
            options={BAND_OPTIONS}
            value={band}
            onChange={(e) => {
              setBand(e.target.value);
              setSaveState({ status: "idle" });
            }}
            disabled={isPending}
            className="max-w-xs"
          />
        )}
      </Field>

      {/* Active units */}
      {units.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-ink">Active units</p>
          <div className="flex flex-col gap-2">
            {units.map((unit) => (
              <Switch
                key={unit.key}
                checked={activeKeys.has(unit.key)}
                onChange={(checked) => toggleUnit(unit.key, checked)}
                label={unit.title}
                disabled={isPending}
              />
            ))}
          </div>
        </div>
      )}

      {/* AI practice */}
      <Switch
        checked={aiPractice}
        onChange={(v) => {
          setAiPractice(v);
          setSaveState({ status: "idle" });
        }}
        label="AI-generated practice"
        description="The bounded tutor generates fresh practice activities for this program."
        disabled={isPending}
      />

      {/* Daily goal */}
      <Field
        id={dailyGoalId}
        label="Daily activity goal"
        hint="Number of activities per day for this program (0–50)."
        error={goalError}
      >
        {(field) => (
          <TextInput
            {...field}
            type="number"
            min={0}
            max={50}
            step={1}
            invalid={Boolean(goalError)}
            value={dailyGoal}
            onChange={(e) => {
              setDailyGoal(e.target.value);
              setSaveState({ status: "idle" });
            }}
            disabled={isPending}
            className="max-w-[120px]"
          />
        )}
      </Field>

      {/* Save row */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="soft"
          size="sm"
          onClick={handleSave}
          disabled={isPending || Boolean(goalError)}
        >
          {isPending ? "Saving…" : "Save config"}
        </Button>

        {saveState.status === "saved" && (
          <span
            role="status"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-success"
          >
            <CheckCircleIcon weight="fill" className="size-4" />
            Saved.
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
    </div>
  );
}
