import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { GrownUpLock, settingsToFormState } from "./SettingsForm";

const settingsFormSource = readFileSync(new URL("./SettingsForm.tsx", import.meta.url), "utf8");

vi.mock("@/app/(parent)/pin-actions", () => ({
  setParentPinAction: vi.fn(),
  clearParentPinByPasswordAction: vi.fn(),
}));

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
      oralReading: false,
    });
  });

  it("keeps a stored aiPractice:false OFF (does not re-enable the §8 switch)", () => {
    const state = settingsToFormState({ aiPractice: false });
    expect(state.aiFeatures).toBe(false);
    // Absent fields still fall back to defaults.
    expect(state.dailyGoal).toBe("5");
    expect(state.readAloudDefault).toBe(true);
    expect(state.oralReading).toBe(false);
  });

  it("preserves a stored aiPractice:true", () => {
    expect(settingsToFormState({ aiPractice: true }).aiFeatures).toBe(true);
  });

  it("maps every stored field onto the form's field names", () => {
    expect(
      settingsToFormState({ dailyGoal: 10, aiPractice: false, readAloud: false, oralReading: true }),
    ).toEqual({
      dailyGoal: "10",
      aiFeatures: false,
      readAloudDefault: false,
      oralReading: true,
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
      oralReading: false,
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

describe("microphone setting disclosure", () => {
  it("covers both oral checks and talk-to-write without implying recordings are stored", () => {
    expect(settingsFormSource).toContain('label="Microphone activities"');
    expect(settingsFormSource).toContain("oral reading checks and talk-to-write");
    expect(settingsFormSource).toContain("Audio and recognized words are never saved by the app");
  });
});

describe("Grown-up lock settings", () => {
  it("shows the set-PIN form and 15-minute grace explanation when no PIN exists", () => {
    const html = renderToStaticMarkup(<GrownUpLock initialHasPin={false} />);

    expect(html).toContain("Grown-up lock");
    expect(html).toContain("15 minutes");
    expect(html).toContain("Set PIN");
    expect(html).toContain('inputMode="numeric"');
    expect(html).not.toContain("Remove PIN");
  });

  it("shows change and password-protected removal controls when a PIN exists", () => {
    const html = renderToStaticMarkup(<GrownUpLock initialHasPin />);

    expect(html).toContain("Change PIN");
    expect(html).toContain("Remove PIN");
    expect(html).toContain('autoComplete="current-password"');
  });
});
