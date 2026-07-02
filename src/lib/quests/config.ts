import { z } from "zod";

/**
 * Quest vocabulary (Adventure 2.0 Phase A). v1 kinds only — `reach_checkpoint`
 * arrives with Phase C (the kind column is plain text, so adding it later is
 * data, not a migration).
 */
export const questKindSchema = z.enum(["complete_n", "try_strand", "practice_skill"]);
export type QuestKind = z.infer<typeof questKindSchema>;

/** Per-kind template params, validated at authoring time (admin) AND before
 *  persistence (store) — same two-gate pattern as ACTIVITY_CONFIG_SCHEMAS. */
export const QUEST_PARAMS_SCHEMAS = {
  complete_n: z.object({ count: z.number().int().min(1).max(10) }),
  try_strand: z.object({}),
  practice_skill: z.object({}),
} as const satisfies Record<QuestKind, z.ZodTypeAny>;

export function questParamsSchemaFor(kind: QuestKind): z.ZodTypeAny {
  return QUEST_PARAMS_SCHEMAS[kind];
}

/**
 * The resolved, denormalized goal snapshotted onto a learner_quest at
 * assignment time (template edits never mutate an in-flight day):
 * every quest is "do `count` matching things"; the match predicate is the
 * kind + the optional unitId/skill target.
 */
export const questTargetSchema = z.object({
  count: z.number().int().min(1).max(10),
  unitId: z.string().min(1).optional(),
  skill: z.string().min(1).max(60).optional(),
});
export type QuestTarget = z.infer<typeof questTargetSchema>;

export const questProgressSchema = z.object({ done: z.number().int().min(0) });
export type QuestProgress = z.infer<typeof questProgressSchema>;

export type QuestStatus = "offered" | "active" | "done";
