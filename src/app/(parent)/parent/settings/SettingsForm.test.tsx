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

  // P6 per-learner settings: the SAME pure mapper now initializes the per-learner
  // settings page (/parent/learners/[id]/settings), so the §8 kill-switch
  // stickiness invariant holds for EVERY child's stored settings — not just the
  // primary learner's. A non-primary child whose parent stored aiPractice:false
  // must render OFF (and a subsequent save can't silently flip it back on).
  it("keeps a non-primary learner's stored aiPractice:false OFF (per-learner §8 stickiness)", () => {
    const secondChild = settingsToFormState({ dailyGoal: 10, aiPractice: false, readAloud: true });
    expect(secondChild.aiFeatures).toBe(false);
    expect(secondChild.dailyGoal).toBe("10");
    expect(secondChild.readAloudDefault).toBe(true);
  });
});
