import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACTIVITY_CONFIG_SCHEMAS, type ActivityKind } from "@/content/activity-configs";
import {
  allServerActivityTypes,
  getServerActivityType,
  type ServerActivityDefinition,
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
});
