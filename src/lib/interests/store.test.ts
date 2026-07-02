import { describe, expect, it } from "vitest";
import { validatePicks } from "./store";

describe("validatePicks", () => {
  it("accepts picks that are a subset of offered, deduped, max 5", () => {
    expect(validatePicks(["a", "b", "a"], ["a", "b", "c"])).toEqual(["a", "b"]);
  });
  it("rejects a pick outside the offered set", () => {
    expect(validatePicks(["a", "z"], ["a", "b"])).toBeNull();
  });
  it("rejects more than 5 picks", () => {
    expect(validatePicks(["a", "b", "c", "d", "e", "f"], ["a", "b", "c", "d", "e", "f"])).toBeNull();
  });
});
