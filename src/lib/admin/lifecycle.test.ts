import { describe, expect, it } from "vitest";
import { isValidStatusTransition } from "./lifecycle";

describe("isValidStatusTransition", () => {
  it("allows draft→published, published→archived, archived→published", () => {
    expect(isValidStatusTransition("draft", "published")).toBe(true);
    expect(isValidStatusTransition("published", "archived")).toBe(true);
    expect(isValidStatusTransition("archived", "published")).toBe(true);
  });

  it("allows setting the same status (no-op write)", () => {
    expect(isValidStatusTransition("draft", "draft")).toBe(true);
    expect(isValidStatusTransition("published", "published")).toBe(true);
    expect(isValidStatusTransition("archived", "archived")).toBe(true);
  });

  it("rejects published→draft, archived→draft, and draft→archived", () => {
    expect(isValidStatusTransition("published", "draft")).toBe(false);
    expect(isValidStatusTransition("archived", "draft")).toBe(false);
    expect(isValidStatusTransition("draft", "archived")).toBe(false);
  });
});
