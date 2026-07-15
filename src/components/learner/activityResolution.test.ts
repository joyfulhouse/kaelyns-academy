import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Activity, Program, Unit } from "@/content";
import {
  playerIdentityKey,
  resolvePlayableActivity,
  safeParsePlayerConfig,
} from "./activityResolution";

function activity(id: string, config: Record<string, unknown> = { target: 3 }): Activity {
  return {
    id,
    title: id,
    kind: "math-tenframe",
    band: "ready",
    skillTags: ["math.add"],
    config,
  } as Activity;
}

function unit(id: string, activities: Activity[]): Unit {
  return {
    id,
    order: 1,
    title: id,
    emoji: "🌟",
    world: "sunshine",
    bigIdea: "",
    phonicsFocus: "",
    mathFocus: "",
    project: "",
    lessons: [{ id: `${id}-lesson`, order: 1, title: "One", activities }],
  };
}

function program(units: Unit[]): Program {
  return {
    slug: "kaelyn-adaptive",
    title: "Test",
    subtitle: "",
    ageBand: "",
    summary: "",
    units,
  };
}

const SSR_ACTIVITY = activity("target");
const SSR_UNIT = unit("route-unit", [SSR_ACTIVITY]);

describe("resolvePlayableActivity", () => {
  it("does not expose published SSR content while account state is loading", () => {
    expect(
      resolvePlayableActivity({
        mode: "account",
        ready: false,
        available: true,
        program: null,
        activeUnitKeys: undefined,
        unitKey: "route-unit",
        activityKey: "target",
        ssrUnit: SSR_UNIT,
        ssrActivity: SSR_ACTIVITY,
      }),
    ).toEqual({ status: "loading" });
  });

  it("does not satisfy a route with a duplicate activity id from another pinned unit", () => {
    const pinned = program([
      unit("route-unit", [activity("different")]),
      unit("other-unit", [activity("target")]),
    ]);

    expect(
      resolvePlayableActivity({
        mode: "account",
        ready: true,
        available: true,
        program: pinned,
        activeUnitKeys: undefined,
        unitKey: "route-unit",
        activityKey: "target",
        ssrUnit: SSR_UNIT,
        ssrActivity: SSR_ACTIVITY,
      }),
    ).toEqual({ status: "moved" });
  });

  it("returns moved when the pinned route unit is absent instead of falling back to SSR", () => {
    expect(
      resolvePlayableActivity({
        mode: "account",
        ready: true,
        available: true,
        program: program([unit("other-unit", [activity("target")])]),
        activeUnitKeys: undefined,
        unitKey: "route-unit",
        activityKey: "target",
        ssrUnit: SSR_UNIT,
        ssrActivity: SSR_ACTIVITY,
      }),
    ).toEqual({ status: "moved" });
  });

  it("blocks a ready account route curated out of the selected learner's program", () => {
    expect(
      resolvePlayableActivity({
        mode: "account",
        ready: true,
        available: true,
        program: program([SSR_UNIT]),
        activeUnitKeys: ["another-unit"],
        unitKey: "route-unit",
        activityKey: "target",
        ssrUnit: SSR_UNIT,
        ssrActivity: SSR_ACTIVITY,
      }),
    ).toEqual({ status: "blocked" });
  });

  it("allows a guest to play the exact activity from the published SSR unit", () => {
    expect(
      resolvePlayableActivity({
        mode: "guest",
        ready: false,
        available: true,
        program: null,
        activeUnitKeys: undefined,
        unitKey: "route-unit",
        activityKey: "target",
        ssrUnit: SSR_UNIT,
        ssrActivity: SSR_ACTIVITY,
      }),
    ).toMatchObject({ status: "ready", activity: SSR_ACTIVITY, unit: SSR_UNIT });
  });
});

describe("safeParsePlayerConfig", () => {
  const schema = z.object({ target: z.number().int().min(1).max(10) });

  it("returns parsed data for a valid bounded config", () => {
    expect(safeParsePlayerConfig(schema, { target: 4 })).toEqual({
      status: "ready",
      config: { target: 4 },
    });
  });

  it("returns a calm malformed state instead of throwing", () => {
    expect(safeParsePlayerConfig(schema, { target: 99 })).toEqual({ status: "malformed" });
  });
});

describe("playerIdentityKey", () => {
  const base = {
    learnerId: "learner-1",
    programSlug: "kaelyn-adaptive",
    unitKey: "route-unit",
    activityKey: "target",
    kind: "math-tenframe",
    variant: "authored",
    sequence: 0,
  } as const;

  it("changes when resolved content/config changes", () => {
    const first = playerIdentityKey({ ...base, content: { version: 1 }, config: { target: 3 } });
    const second = playerIdentityKey({ ...base, content: { version: 2 }, config: { target: 3 } });
    const third = playerIdentityKey({ ...base, content: { version: 2 }, config: { target: 4 } });

    expect(new Set([first, second, third])).toHaveLength(3);
  });

  it("is stable when object property order differs", () => {
    const first = playerIdentityKey({ ...base, content: {}, config: { a: 1, b: 2 } });
    const second = playerIdentityKey({ ...base, content: {}, config: { b: 2, a: 1 } });

    expect(first).toBe(second);
  });
});
