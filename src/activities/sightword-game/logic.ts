import { sightwordGameConfig, type SightwordGameConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import { z } from "zod";
import { evenSkillEvidence, outcomeFromAccuracy, starsFromAccuracy } from "../_shared/scoring";

/** Server-safe schema + scoring for sightword-game. No "use client". */
export const schema = sightwordGameConfig;

/** The Player reports how many real words were found and how many decoy taps happened. */
export const responseSchema = z
  .object({
    /** Target sight words the child correctly identified. */
    found: z.array(z.string().min(1).max(64)).max(64),
    /** Count of taps on decoys (gentle misses, not failures). */
    decoyTaps: z.number().int().min(0).max(100),
  })
  .strict();
export type SightwordGameResponse = z.infer<typeof responseSchema>;

export function score(
  config: SightwordGameConfig,
  response: SightwordGameResponse,
): ActivityScore {
  const total = config.words.length;
  const correct = response.found.length;
  // First-try cleanliness: targets found with no decoy detours.
  // Each decoy tap dilutes the "read with confidence" signal.
  const denom = correct + response.decoyTaps;
  const cleanRate = denom === 0 ? (total === 0 ? 1 : 0) : correct / denom;

  return {
    correct,
    total,
    stars: starsFromAccuracy(cleanRate),
    skillEvidence: evenSkillEvidence(skillsAffected(config), outcomeFromAccuracy(cleanRate)),
  };
}

/**
 * Sight-word recognition feeds decodable reading fluency by default. Word Study
 * games override `skillTag` so the evidence lands on the authored word/vocab
 * skill the recommender gates on instead of the generic reading.decodable.
 */
export function skillsAffected(config: SightwordGameConfig): SkillTag[] {
  return [config.skillTag ?? "reading.decodable"];
}
