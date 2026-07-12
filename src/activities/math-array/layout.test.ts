import { describe, expect, it } from "vitest";
import { arrayGridClass } from "./Player";

describe("math-array responsive layout", () => {
  it("keeps the authored column count at every viewport width", () => {
    for (let cols = 1; cols <= 12; cols += 1) {
      const className = arrayGridClass(cols);
      expect(className).toContain(`grid-cols-${cols}`);
      expect(className).not.toMatch(/(?:sm:|min-\[374px\]:|lg:)grid-cols-/);
    }
  });
});
