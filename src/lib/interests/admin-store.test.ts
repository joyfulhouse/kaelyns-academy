import { describe, expect, it } from "vitest";
import { createInterestInputSchema } from "./admin-store";

describe("createInterestInputSchema", () => {
  it("defaults status to draft (safe-by-default: the child picker and AI theming consume published only)", () => {
    const parsed = createInterestInputSchema.parse({ slug: "dinosaurs", label: "Dinosaurs" });
    expect(parsed.status).toBe("draft");
  });

  it("accepts an explicit published status", () => {
    const parsed = createInterestInputSchema.parse({
      slug: "space",
      label: "Space",
      icon: "🚀",
      status: "published",
    });
    expect(parsed.status).toBe("published");
  });

  it("rejects a bad slug or an unknown status", () => {
    expect(() => createInterestInputSchema.parse({ slug: "Has Spaces", label: "X" })).toThrow();
    expect(() =>
      createInterestInputSchema.parse({ slug: "ok", label: "X", status: "live" }),
    ).toThrow();
  });
});
