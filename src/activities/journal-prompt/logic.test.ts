import { describe, expect, it } from "vitest";
import type { JournalPromptConfig } from "@/content/activity-configs";
import { responseSchema, schema, score, skillsAffected } from "./logic";

const config: JournalPromptConfig = {
  prompt: "Draw your favorite animal.",
  sentenceStarter: "My favorite animal is",
  drawing: true,
};

const markResponse = {
  markCount: 1,
  textLength: 0,
  usedDictation: false,
  mode: "draw" as const,
  didDraw: true,
};
const typedResponse = {
  markCount: 0,
  textLength: 3,
  usedDictation: false,
  mode: "type" as const,
  didDraw: false,
};
const dictatedResponse = {
  markCount: 0,
  textLength: 12,
  usedDictation: true,
  mode: "dictate" as const,
  didDraw: false,
};

describe("journal-prompt response privacy and participation", () => {
  it("rejects a blank response", () => {
    expect(
      responseSchema.safeParse({
        markCount: 0,
        textLength: 0,
        usedDictation: false,
        mode: "type",
        didDraw: false,
      }).success,
    ).toBe(false);
  });

  it("accepts one pointer mark, contributed text, scribed text, or successful dictation", () => {
    expect(responseSchema.safeParse(markResponse).success).toBe(true);
    expect(responseSchema.safeParse(typedResponse).success).toBe(true);
    expect(
      responseSchema.safeParse({ ...typedResponse, mode: "scribe" }).success,
    ).toBe(true);
    expect(responseSchema.safeParse(dictatedResponse).success).toBe(true);
  });

  it("rejects inconsistent drawing and dictation summaries", () => {
    expect(responseSchema.safeParse({ ...markResponse, didDraw: false }).success).toBe(false);
    expect(responseSchema.safeParse({ ...typedResponse, mode: "dictate" }).success).toBe(false);
    expect(
      responseSchema.safeParse({ ...dictatedResponse, usedDictation: false }).success,
    ).toBe(false);
  });

  it("cannot carry text, transcript, strokes, images, or a client-authored score", () => {
    for (const extra of [
      { text: "a child sentence" },
      { transcript: "spoken words" },
      { strokes: [{ x: 1, y: 2 }] },
      { drawingDataUrl: "data:image/png;base64,secret" },
      { image: "secret" },
      { score: { stars: 3 } },
    ]) {
      expect(responseSchema.safeParse({ ...typedResponse, ...extra }).success).toBe(false);
    }
  });

  it("caps every integer field", () => {
    expect(responseSchema.safeParse({ ...markResponse, markCount: 201 }).success).toBe(false);
    expect(responseSchema.safeParse({ ...typedResponse, textLength: 2_001 }).success).toBe(false);
  });
});

describe("journal-prompt scoring", () => {
  it("celebrates genuine participation without grading its quality", () => {
    expect(score(config, markResponse)).toEqual({
      correct: 1,
      total: 1,
      stars: 3,
      skillEvidence: [],
    });
    expect(score(config, typedResponse).stars).toBe(3);
    expect(score(config, dictatedResponse).stars).toBe(3);
  });

  it("does not claim sentence, composition, or stamina mastery", () => {
    expect(skillsAffected(config)).toEqual([]);
    expect(score(config, typedResponse).skillEvidence).toEqual([]);
  });
});

describe("journal-prompt config", () => {
  it("keeps bounded draw defaults", () => {
    const parsed = schema.parse({ prompt: "Tell me about it." });
    expect(parsed).toMatchObject({
      mode: "draw",
      drawing: true,
      allowModes: ["type"],
      frames: [],
      wordBank: [],
    });
  });

  it("accepts bounded compose supports and rejects duplicate modes", () => {
    expect(
      schema.safeParse({
        prompt: "What happened?",
        mode: "compose",
        frames: ["First, ______."],
        wordBank: ["lava"],
        allowModes: ["scribe", "type", "dictate"],
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        prompt: "What happened?",
        mode: "compose",
        allowModes: ["type", "type"],
      }).success,
    ).toBe(false);
  });
});
