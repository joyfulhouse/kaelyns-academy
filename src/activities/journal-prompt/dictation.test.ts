import { describe, expect, it } from "vitest";
import {
  boundDictationText,
  createJournalDictationForm,
  MAX_DICTATION_MS,
  parseDictationResponse,
} from "./dictation";
import { MAX_JOURNAL_TEXT_LENGTH } from "./state";

const AUDIO = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });
const IDENTITY = {
  learnerId: "learner-1",
  programSlug: "kaelyn-adaptive",
  unitKey: "unit-1",
  activityId: "journal-1",
};

describe("createJournalDictationForm", () => {
  it("carries the audio + authored identity as multipart fields", () => {
    const form = createJournalDictationForm(AUDIO, IDENTITY);
    expect(form).not.toBeNull();
    expect(form?.get("learnerId")).toBe("learner-1");
    expect(form?.get("programSlug")).toBe("kaelyn-adaptive");
    expect(form?.get("unitKey")).toBe("unit-1");
    expect(form?.get("activityId")).toBe("journal-1");
    expect(form?.get("file")).toBeInstanceOf(Blob);
  });

  it("refuses to build a request without an authored unit/activity (shelf hosts)", () => {
    expect(createJournalDictationForm(AUDIO, { learnerId: "l", programSlug: "p" })).toBeNull();
    expect(
      createJournalDictationForm(AUDIO, { learnerId: "l", programSlug: "p", unitKey: "u" }),
    ).toBeNull();
  });
});

describe("boundDictationText", () => {
  it("trims and hard-caps to the journal text ceiling", () => {
    expect(boundDictationText("  hi there  ")).toBe("hi there");
    expect(boundDictationText("a".repeat(MAX_JOURNAL_TEXT_LENGTH + 50))).toHaveLength(
      MAX_JOURNAL_TEXT_LENGTH,
    );
  });
});

describe("parseDictationResponse", () => {
  it("returns the bounded transcript for a well-formed body", () => {
    expect(parseDictationResponse({ text: "  the cat ran  " })).toBe("the cat ran");
  });

  it("collapses any malformed or non-string body to an empty string", () => {
    expect(parseDictationResponse(null)).toBe("");
    expect(parseDictationResponse("nope")).toBe("");
    expect(parseDictationResponse({})).toBe("");
    expect(parseDictationResponse({ text: 42 })).toBe("");
    expect(parseDictationResponse({ text: { nested: true } })).toBe("");
  });
});

describe("MAX_DICTATION_MS", () => {
  it("stays within the kaelyn-stt decoded-speech cap", () => {
    expect(MAX_DICTATION_MS).toBeLessThanOrEqual(15_000);
  });
});
