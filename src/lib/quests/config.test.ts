import { describe, expect, it } from "vitest";
import {
  QUEST_PARAMS_SCHEMAS,
  questKindSchema,
  questParamsSchemaFor,
  questProgressSchema,
  questTargetSchema,
} from "./config";

describe("quest config schemas", () => {
  it("accepts the three v1 kinds and rejects others", () => {
    expect(questKindSchema.safeParse("complete_n").success).toBe(true);
    expect(questKindSchema.safeParse("try_strand").success).toBe(true);
    expect(questKindSchema.safeParse("practice_skill").success).toBe(true);
    expect(questKindSchema.safeParse("reach_checkpoint").success).toBe(false); // Phase C
  });

  it("validates per-kind params", () => {
    expect(QUEST_PARAMS_SCHEMAS.complete_n.safeParse({ count: 3 }).success).toBe(true);
    expect(QUEST_PARAMS_SCHEMAS.complete_n.safeParse({ count: 0 }).success).toBe(false);
    expect(questParamsSchemaFor("try_strand").safeParse({}).success).toBe(true);
  });

  it("bounds target and progress", () => {
    expect(questTargetSchema.safeParse({ count: 3 }).success).toBe(true);
    expect(questTargetSchema.safeParse({ count: 3, unitId: "u1" }).success).toBe(true);
    expect(questTargetSchema.safeParse({ count: 99 }).success).toBe(false);
    expect(questProgressSchema.safeParse({ done: 0 }).success).toBe(true);
    expect(questProgressSchema.safeParse({ done: -1 }).success).toBe(false);
  });
});
