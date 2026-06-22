import { describe, expect, it } from "vitest";
import { settingsToFormState } from "./SettingsForm";

// settingsToFormState is the pure mapper that initializes the Settings form from
// the learner's *persisted* settings. The contract that matters: a stored
// aiPractice:false (the §8 AI kill-switch) must survive the round-trip to the
// form, never coerced back to the AI-on default — otherwise a reload (or any
// subsequent save) silently re-enables AI. Per-absent-field fallback to DEFAULTS.

describe("settingsToFormState", () => {
  it("uses the AI-on defaults when there are no persisted settings (null)", () => {
    expect(settingsToFormState(null)).toEqual({
      dailyGoal: "5",
      aiFeatures: true,
      readAloudDefault: true,
    });
  });

  it("keeps a stored aiPractice:false OFF (does not re-enable the §8 switch)", () => {
    const state = settingsToFormState({ aiPractice: false });
    expect(state.aiFeatures).toBe(false);
    // Absent fields still fall back to defaults.
    expect(state.dailyGoal).toBe("5");
    expect(state.readAloudDefault).toBe(true);
  });

  it("preserves a stored aiPractice:true", () => {
    expect(settingsToFormState({ aiPractice: true }).aiFeatures).toBe(true);
  });

  it("maps every stored field onto the form's field names", () => {
    expect(
      settingsToFormState({ dailyGoal: 10, aiPractice: false, readAloud: false }),
    ).toEqual({
      dailyGoal: "10",
      aiFeatures: false,
      readAloudDefault: false,
    });
  });

  it("preserves a stored dailyGoal of 0 (not treated as absent)", () => {
    expect(settingsToFormState({ dailyGoal: 0 }).dailyGoal).toBe("0");
  });

  it("falls back per-absent-field (empty stored object → full defaults)", () => {
    expect(settingsToFormState({})).toEqual({
      dailyGoal: "5",
      aiFeatures: true,
      readAloudDefault: true,
    });
  });
});
