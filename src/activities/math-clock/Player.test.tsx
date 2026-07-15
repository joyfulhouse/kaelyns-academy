import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MathClockConfig } from "@/content/activity-configs";
import { MathClockPlayer } from "./Player";

vi.mock("../_shared/useSpeech", () => ({
  useSpeech: () => ({
    supported: false,
    hasVoice: true,
    speak: () => Promise.resolve("unavailable" as const),
    cancel: () => undefined,
  }),
}));

function renderPlayer(config: MathClockConfig): string {
  return renderToStaticMarkup(
    createElement(MathClockPlayer, { config, onComplete: () => undefined }),
  );
}

describe("math-clock Player interaction contract", () => {
  it("cannot complete an initially-correct noon target before a hand is manipulated", () => {
    const markup = renderPlayer({
      mode: "set",
      instruction: "Make the clock say twelve o'clock.",
      targetHour: 12,
      targetMinute: 0,
    });

    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Check it<\/button>/);
  });

  it("keeps set-time changes on the SVG hands instead of external steppers", () => {
    const markup = renderPlayer({
      mode: "set",
      instruction: "Make the clock say half past eleven.",
      targetHour: 11,
      targetMinute: 30,
    });

    expect(markup).not.toContain("Earlier by 30 minutes");
    expect(markup).not.toContain("Later by 30 minutes");
    expect(markup).toContain('aria-label="Hour hand"');
    expect(markup).toContain('aria-label="Minute hand"');
  });

  it("does not disclose the read answer in the clock image's accessible name", () => {
    const markup = renderPlayer({
      mode: "read",
      instruction: "What time does the clock say?",
      hour: 3,
      minute: 0,
      choices: ["2:00", "3:00", "4:00"],
      answerIndex: 1,
    });

    expect(markup).toContain(
      'aria-label="Analog clock face. Read the hour and minute hands, then choose the matching digital time."',
    );
    expect(markup).not.toContain('aria-label="Clock showing 3:00"');
  });
});
