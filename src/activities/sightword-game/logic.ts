import {
  sightwordGameConfig,
  type SightwordGameConfig,
  type SightwordRound,
} from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import { z } from "zod";
import { evenSkillEvidence, outcomeFromAccuracy, starsFromAccuracy } from "../_shared/scoring";

export const schema = sightwordGameConfig;

const roundResponse = z
  .object({
    roundIndex: z.number().int().min(0).max(7),
    choiceIndex: z.number().int().min(0).max(5),
    attempts: z.number().int().min(1).max(20),
  })
  .strict();

export const responseSchema = z
  .object({
    rounds: z
      .array(roundResponse)
      .min(1)
      .max(8)
      .refine(
        (rounds) => new Set(rounds.map((round) => round.roundIndex)).size === rounds.length,
        "round indexes must be unique",
      ),
  })
  .strict();
export type SightwordGameResponse = z.infer<typeof responseSchema>;

export function normalizeSightwordRounds(config: SightwordGameConfig): SightwordRound[] {
  if (Array.isArray(config.rounds)) return config.rounds;
  const words = config.words ?? [];
  const decoys = config.decoys ?? [];
  return words.map((target) => ({
    target,
    choices: [
      target,
      ...(decoys.length > 0 ? decoys : words.filter((word) => word !== target).slice(0, 5)),
    ],
  }));
}

function assertCompleteCorrectRounds(
  config: SightwordGameConfig,
  response: SightwordGameResponse,
): void {
  const rounds = normalizeSightwordRounds(config);
  if (response.rounds.length !== rounds.length) throw new Error("invalid sight-word response");
  const seen = new Set<number>();
  for (const result of response.rounds) {
    const round = rounds[result.roundIndex];
    const chosen = round?.choices[result.choiceIndex];
    if (
      !round ||
      seen.has(result.roundIndex) ||
      chosen?.toLocaleLowerCase() !== round.target.toLocaleLowerCase()
    ) {
      throw new Error("invalid sight-word response");
    }
    seen.add(result.roundIndex);
  }
}

export function score(
  config: SightwordGameConfig,
  response: SightwordGameResponse,
): ActivityScore {
  assertCompleteCorrectRounds(config, response);
  const total = normalizeSightwordRounds(config).length;
  const firstTry = response.rounds.filter((round) => round.attempts === 1).length;
  const rate = total === 0 ? 1 : firstTry / total;
  return {
    correct: total,
    total,
    stars: starsFromAccuracy(rate),
    skillEvidence: evenSkillEvidence(skillsAffected(config), outcomeFromAccuracy(rate)),
  };
}

/** Recognition evidence is opt-in; a generic target round cannot infer a rubric skill. */
export function skillsAffected(config: SightwordGameConfig): SkillTag[] {
  return config.skillTag ? [config.skillTag] : [];
}

export function validateGenerated(config: SightwordGameConfig): string | null {
  const parsed = schema.safeParse(config);
  if (parsed.success) return null;
  return parsed.error.issues[0]?.message ?? "invalid sight-word rounds";
}
