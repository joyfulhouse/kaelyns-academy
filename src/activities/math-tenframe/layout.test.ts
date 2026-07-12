import { describe, expect, it } from "vitest";
import { TEN_FRAME_GRID_CLASS } from "./Player";

describe("math-tenframe responsive layout", () => {
  it("stays a two-row, five-column frame at every viewport width", () => {
    expect(TEN_FRAME_GRID_CLASS).toContain("grid-cols-5");
    expect(TEN_FRAME_GRID_CLASS).not.toMatch(/(?:sm:|min-\[374px\]:|lg:)grid-cols-/);
  });
});
