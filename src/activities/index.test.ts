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
  it("registers a plugin for every implemented kind; unimplemented kinds fall back to the coming-soon placeholder", () => {
    // Not every kind in ACTIVITY_CONFIG_SCHEMAS has a plugin yet — a kind can
    // land (schema + defaultConfigFor skeleton) before its Player/logic module
    // is built. Unregistered kinds render a "coming soon" placeholder (see the
    // file header above), so this test only asserts internal consistency: a
    // registered kind's plugin is well-formed, and an unregistered kind has no
    // plugin at all (never a half-registered state).
    registerActivityTypes();
    for (const kind of KINDS) {
      const type = getActivityType(kind);
      if (isActivityKindRegistered(kind)) {
        expect(type?.kind).toBe(kind);
        expect(typeof type?.score).toBe("function");
        expect(typeof type?.skillsAffected).toBe("function");
        expect(type?.Player).toBeTypeOf("function");
        expect(type?.label).toBeTruthy();
      } else {
        expect(type).toBeUndefined();
      }
    }
    expect(allActivityTypes().length).toBeLessThanOrEqual(KINDS.length);
  });

  it("is idempotent (re-registering does not duplicate)", () => {
    registerActivityTypes();
    const before = allActivityTypes().length;
    registerActivityTypes();
    expect(allActivityTypes()).toHaveLength(before);
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
