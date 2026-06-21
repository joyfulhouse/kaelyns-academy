import { describe, expect, it } from "vitest";
import { canTransitionStatus } from "./enrollment";

describe("canTransitionStatus", () => {
  it("allows idempotent transitions (X → X)", () => {
    expect(canTransitionStatus("active", "active")).toBe(true);
    expect(canTransitionStatus("paused", "paused")).toBe(true);
    expect(canTransitionStatus("removed", "removed")).toBe(true);
  });

  it("allows active ↔ paused", () => {
    expect(canTransitionStatus("active", "paused")).toBe(true);
    expect(canTransitionStatus("paused", "active")).toBe(true);
  });

  it("allows active → removed", () => {
    expect(canTransitionStatus("active", "removed")).toBe(true);
  });

  it("allows paused → removed", () => {
    expect(canTransitionStatus("paused", "removed")).toBe(true);
  });

  it("allows removed → active (restore)", () => {
    expect(canTransitionStatus("removed", "active")).toBe(true);
  });

  it("disallows removed → paused (must restore to active first)", () => {
    expect(canTransitionStatus("removed", "paused")).toBe(false);
  });
});
