import { z } from "zod";
import type { ActivityKind } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import { getServerActivityType } from "./definitions";

const skillTagSchema = z.string().trim().min(1).max(128);
const activityScoreSchema = z
  .object({
    correct: z.number().int().min(0).max(1_000),
    total: z.number().int().min(0).max(1_000),
    stars: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    skillEvidence: z
      .array(
        z
          .object({
            skill: skillTagSchema,
            outcome: z.enum(["not_yet", "emerging", "solid"]),
          })
          .strict(),
      )
      .max(64),
  })
  .strict()
  .refine(({ correct, total }) => correct <= total, {
    message: "correct cannot exceed total",
    path: ["correct"],
  });

export type ParseAndScoreActivityFailureReason =
  | "invalid-config"
  | "invalid-response"
  | "invalid-score"
  | "unauthorized-skill";

export type ParseAndScoreActivityResult =
  | {
      ok: true;
      config: unknown;
      response: unknown;
      score: ActivityScore;
    }
  | {
      ok: false;
      reason: ParseAndScoreActivityFailureReason;
    };

export function parseAndScoreActivity(
  kind: ActivityKind,
  rawConfig: unknown,
  rawResponse: unknown,
  allowedSkillTags: readonly SkillTag[],
): ParseAndScoreActivityResult {
  const definition = getServerActivityType(kind);
  const parsedConfig = definition.schema.safeParse(rawConfig);
  if (!parsedConfig.success) return { ok: false, reason: "invalid-config" };

  const parsedResponse = definition.responseSchema.safeParse(rawResponse);
  if (!parsedResponse.success) return { ok: false, reason: "invalid-response" };

  const allowedSkills = new Set(allowedSkillTags);
  let affectedSkills: SkillTag[];
  let rawScore: ActivityScore;
  try {
    affectedSkills = definition.skillsAffected(parsedConfig.data);
    rawScore = definition.score(parsedConfig.data, parsedResponse.data);
  } catch {
    return { ok: false, reason: "invalid-score" };
  }

  if (affectedSkills.some((skill) => !allowedSkills.has(skill))) {
    return { ok: false, reason: "unauthorized-skill" };
  }

  const parsedScore = activityScoreSchema.safeParse(rawScore);
  if (!parsedScore.success) return { ok: false, reason: "invalid-score" };
  if (parsedScore.data.skillEvidence.some(({ skill }) => !allowedSkills.has(skill))) {
    return { ok: false, reason: "unauthorized-skill" };
  }

  return {
    ok: true,
    config: parsedConfig.data,
    response: parsedResponse.data,
    score: parsedScore.data,
  };
}
