import { describe, expect, it } from "vitest";
import { validateTemplateInput } from "./admin-store";

describe("validateTemplateInput", () => {
  it("accepts params matching the kind's schema", () => {
    expect(() => validateTemplateInput("complete_n", { count: 3 })).not.toThrow();
    expect(() => validateTemplateInput("try_strand", {})).not.toThrow();
    expect(() => validateTemplateInput("practice_skill", {})).not.toThrow();
  });

  it("throws when params don't match the kind's schema", () => {
    expect(() => validateTemplateInput("complete_n", {})).toThrow();
    expect(() => validateTemplateInput("complete_n", { count: 0 })).toThrow();
    expect(() => validateTemplateInput("complete_n", { count: 11 })).toThrow();
    // try_strand/practice_skill take no params — an unexpected shape (like a
    // complete_n count) still passes since QUEST_PARAMS_SCHEMAS uses a bare
    // z.object({}), which is non-strict; the mismatch that MUST reject is a
    // missing/invalid required field for the kind that has one.
    expect(() => validateTemplateInput("complete_n", { count: "three" })).toThrow();
  });
});
