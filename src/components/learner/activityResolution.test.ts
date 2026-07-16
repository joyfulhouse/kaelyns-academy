import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Activity, Program, Unit } from "@/content";
import {
  generatedPracticeRequestKey,
  playerIdentityKey,
  resolveGeneratedPractice,
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

describe("resolveGeneratedPractice", () => {
  const row = {
    id: "generated-1",
    learnerId: "learner-1",
    programSlug: "kaelyn-adaptive",
    programVersionId: "PV1",
    unitKey: "route-unit",
  };
  const activeRequestKey = generatedPracticeRequestKey(
    "learner-1",
    "kaelyn-adaptive",
    "generated-1",
    "PV1",
  );

  it("stays loading until the selected account learner is ready", () => {
    expect(
      resolveGeneratedPractice({
        mode: "account",
        ready: false,
        available: true,
        selectedLearnerId: "learner-1",
        programSlug: "kaelyn-adaptive",
        programVersionId: "PV1",
        generatedId: "generated-1",
        activeUnitKeys: undefined,
        loaded: null,
      }),
    ).toEqual({ status: "loading" });
  });

  it("does not expose a previously loaded sibling row after learner selection changes", () => {
    expect(
      resolveGeneratedPractice({
        mode: "account",
        ready: true,
        available: true,
        selectedLearnerId: "learner-2",
        programSlug: "kaelyn-adaptive",
        programVersionId: "PV1",
        generatedId: "generated-1",
        activeUnitKeys: undefined,
        loaded: { requestKey: activeRequestKey, row },
      }),
    ).toEqual({ status: "loading" });
  });

  it("rejects a row whose owner does not match the selected learner", () => {
    expect(
      resolveGeneratedPractice({
        mode: "account",
        ready: true,
        available: true,
        selectedLearnerId: "learner-1",
        programSlug: "kaelyn-adaptive",
        programVersionId: "PV1",
        generatedId: "generated-1",
        activeUnitKeys: undefined,
        loaded: {
          requestKey: activeRequestKey,
          row: { ...row, learnerId: "learner-2" },
        },
      }),
    ).toEqual({ status: "moved" });
  });

  it("returns the row only for the exact selected learner/program/id request", () => {
    expect(
      resolveGeneratedPractice({
        mode: "account",
        ready: true,
        available: true,
        selectedLearnerId: "learner-1",
        programSlug: "kaelyn-adaptive",
        programVersionId: "PV1",
        generatedId: "generated-1",
        activeUnitKeys: ["route-unit"],
        loaded: { requestKey: activeRequestKey, row },
      }),
    ).toEqual({ status: "ready", row });
  });

  it("blocks unavailable and curated-out generated practice", () => {
    const unavailable = resolveGeneratedPractice({
      mode: "account",
      ready: true,
      available: false,
      selectedLearnerId: "learner-1",
      programSlug: "kaelyn-adaptive",
      programVersionId: "PV1",
      generatedId: "generated-1",
      activeUnitKeys: undefined,
      loaded: null,
    });
    const curatedOut = resolveGeneratedPractice({
      mode: "account",
      ready: true,
      available: true,
      selectedLearnerId: "learner-1",
      programSlug: "kaelyn-adaptive",
      programVersionId: "PV1",
      generatedId: "generated-1",
      activeUnitKeys: ["another-unit"],
      loaded: { requestKey: activeRequestKey, row },
    });

    expect(unavailable).toEqual({ status: "blocked" });
    expect(curatedOut).toEqual({ status: "blocked" });
  });

  it("changes request identity across a same-route enrollment repin", () => {
    expect(
      generatedPracticeRequestKey(
        "learner-1",
        "kaelyn-adaptive",
        "generated-1",
        "PV1",
      ),
    ).not.toBe(
      generatedPracticeRequestKey(
        "learner-1",
        "kaelyn-adaptive",
        "generated-1",
        "PV2",
      ),
    );
  });

  it("never exposes an old-pin load after a PV1 to PV2 repin", () => {
    expect(
      resolveGeneratedPractice({
        mode: "account",
        ready: true,
        available: true,
        selectedLearnerId: "learner-1",
        programSlug: "kaelyn-adaptive",
        programVersionId: "PV2",
        generatedId: "generated-1",
        activeUnitKeys: undefined,
        loaded: { requestKey: activeRequestKey, row },
      }),
    ).toEqual({ status: "loading" });

    const pv2RequestKey = generatedPracticeRequestKey(
      "learner-1",
      "kaelyn-adaptive",
      "generated-1",
      "PV2",
    );
    expect(
      resolveGeneratedPractice({
        mode: "account",
        ready: true,
        available: true,
        selectedLearnerId: "learner-1",
        programSlug: "kaelyn-adaptive",
        programVersionId: "PV2",
        generatedId: "generated-1",
        activeUnitKeys: undefined,
        loaded: { requestKey: pv2RequestKey, row },
      }),
    ).toEqual({ status: "moved" });
  });

  it("moves calmly when the captured enrollment pin or row pin is legacy-null", () => {
    expect(
      resolveGeneratedPractice({
        mode: "account",
        ready: true,
        available: true,
        selectedLearnerId: "learner-1",
        programSlug: "kaelyn-adaptive",
        programVersionId: null,
        generatedId: "generated-1",
        activeUnitKeys: undefined,
        loaded: null,
      }),
    ).toEqual({ status: "moved" });

    expect(
      resolveGeneratedPractice({
        mode: "account",
        ready: true,
        available: true,
        selectedLearnerId: "learner-1",
        programSlug: "kaelyn-adaptive",
        programVersionId: "PV1",
        generatedId: "generated-1",
        activeUnitKeys: undefined,
        loaded: {
          requestKey: activeRequestKey,
          row: { ...row, programVersionId: null },
        },
      }),
    ).toEqual({ status: "moved" });
  });
});
