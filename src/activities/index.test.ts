import { describe, it, expect } from "vitest";
import {
  registerActivityTypes,
  getActivityType,
  allActivityTypes,
  isActivityKindRegistered,
} from "./index";
import { ACTIVITY_CONFIG_SCHEMAS, type ActivityKind } from "@/content/activity-configs";

const KINDS = Object.keys(ACTIVITY_CONFIG_SCHEMAS) as ActivityKind[];

describe("activity-type registration", () => {
  it("registers every activity-type plugin", () => {
    registerActivityTypes();
    for (const kind of KINDS) {
      expect(isActivityKindRegistered(kind)).toBe(true);
      const type = getActivityType(kind);
      expect(type?.kind).toBe(kind);
      expect(typeof type?.score).toBe("function");
      expect(typeof type?.skillsAffected).toBe("function");
      expect(type?.Player).toBeTypeOf("function");
      expect(type?.label).toBeTruthy();
    }
    expect(allActivityTypes()).toHaveLength(KINDS.length);
  });

  it("is idempotent (re-registering does not duplicate)", () => {
    registerActivityTypes();
    registerActivityTypes();
    expect(allActivityTypes()).toHaveLength(KINDS.length);
  });

  it("each registered schema parses a minimal valid config", () => {
    registerActivityTypes();
    expect(() =>
      getActivityType("math-tenframe")?.schema.parse({
        instruction: "Show 3.",
        mode: "represent",
        target: 3,
      }),
    ).not.toThrow();
  });
});
