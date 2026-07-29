import { describe, expect, it } from "vitest";
import { isInteractiveTarget } from "./useTypingKeys";

function targetMatching(match: boolean): EventTarget {
  return {
    closest: (selector: string) => {
      expect(selector).toContain("button");
      expect(selector).toContain("contenteditable");
      return match ? {} : null;
    },
  } as unknown as EventTarget;
}

describe("isInteractiveTarget", () => {
  it("protects interactive controls and their descendants from the typing listener", () => {
    expect(isInteractiveTarget(targetMatching(true))).toBe(true);
  });

  it("keeps ordinary stage keydowns available to the typing listener", () => {
    expect(isInteractiveTarget(targetMatching(false))).toBe(false);
    expect(isInteractiveTarget(null)).toBe(false);
  });
});
