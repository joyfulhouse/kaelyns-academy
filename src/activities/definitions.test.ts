import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { ACTIVITY_CONFIG_SCHEMAS, type ActivityKind } from "@/content/activity-configs";
import {
  allServerActivityTypes,
  getServerActivityType,
  type ServerActivityDefinition,
  validatePlayableActivityConfig,
} from "./definitions";

const KINDS = Object.keys(ACTIVITY_CONFIG_SCHEMAS) as ActivityKind[];

describe("server activity definitions", () => {
  it("has one config-and-response definition for every activity kind", () => {
    expect(allServerActivityTypes().map(({ kind }) => kind)).toEqual(KINDS);

    for (const kind of KINDS) {
      const definition: ServerActivityDefinition = getServerActivityType(kind);
      expect(definition.kind).toBe(kind);
      expect(definition.schema).toBe(ACTIVITY_CONFIG_SCHEMAS[kind]);
      expect(typeof definition.responseSchema.safeParse).toBe("function");
      expect(typeof definition.score).toBe("function");
      expect(typeof definition.skillsAffected).toBe("function");
    }
  });

  it("imports relative activity modules only through their server-safe logic files", () => {
    const source = readFileSync(new URL("./definitions.ts", import.meta.url), "utf8");
    const relativeImports = [...source.matchAll(/from "(\.[^"]+)"/g)].map((match) => match[1]);

    expect(relativeImports).toHaveLength(KINDS.length);
    expect(relativeImports.every((path) => path.endsWith("/logic"))).toBe(true);
    expect(source).not.toContain("Player");
    expect(source).not.toContain('from "react"');
    expect(source).not.toContain('from "@/content/registry"');
  });

  it.each([
    {
      kind: "math-clock",
      config: {
        mode: "read",
        instruction: "Read the clock",
        hour: 3,
        minute: 0,
        choices: ["4:00", "3:00"],
        answerIndex: 0,
      },
      message: "is not 3:00",
    },
    {
      kind: "math-money",
      config: {
        mode: "count",
        instruction: "Make 7 cents",
        palette: ["nickel"],
        targetCents: 7,
      },
      message: "unreachable",
    },
    {
      kind: "sort-categories",
      config: {
        instruction: "Sort the animals",
        bins: [
          { id: "farm", label: "Farm" },
          { id: "ocean", label: "Ocean" },
        ],
        items: [
          { label: "Cow", binId: "farm" },
          { label: "Pig", binId: "farm" },
          { label: "Hen", binId: "farm" },
        ],
      },
      message: 'bin "ocean" has no items',
    },
    {
      kind: "seq-order",
      config: {
        instruction: "Put the steps in order",
        cards: [{ label: "Wash" }, { label: "wash" }, { label: "Dry" }],
      },
      message: "duplicate card labels",
    },
  ] as const)("rejects schema-valid but unplayable $kind configs", ({ kind, config, message }) => {
    const result = validatePlayableActivityConfig(kind, config);
    expect(result).toMatchObject({ ok: false, reason: "unplayable" });
    if (!result.ok && result.reason === "unplayable") expect(result.message).toContain(message);
  });

  it("fails closed with a stable message when a plugin invariant throws", () => {
    const definition = getServerActivityType("math-clock");
    const invariant = vi
      .spyOn(definition, "validateGenerated")
      .mockImplementationOnce(() => {
        throw new Error("internal answer-key details");
      });

    try {
      const result = validatePlayableActivityConfig("math-clock", {
        mode: "set",
        instruction: "Set the clock",
        targetHour: 3,
        targetMinute: 0,
      });

      expect(result).toEqual({
        ok: false,
        reason: "unplayable",
        message: "activity playability check failed",
      });
      expect(JSON.stringify(result)).not.toContain("internal answer-key details");
    } finally {
      invariant.mockRestore();
    }
  });
});
