import {
  sightwordGameConfig,
  type SightwordGameConfig,
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
    usedHelp: z.boolean(),
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

function assertCompleteCorrectRounds(
  config: SightwordGameConfig,
  response: SightwordGameResponse,
): void {
  const rounds = config.rounds;
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
  const total = config.rounds.length;
  const independence = response.rounds.reduce((sum, round) => {
    const firstTry = round.attempts === 1 ? 1 : 0;
    return sum + (round.usedHelp ? Math.min(firstTry, 0.5) : firstTry);
  }, 0);
  const starRate = total === 0 ? 1 : independence / total;
  const unhelped = response.rounds.filter((round) => !round.usedHelp);
  const unhelpedRate =
    unhelped.length === 0
      ? 0
      : unhelped.filter((round) => round.attempts === 1).length / unhelped.length;
  const evidenceRate = response.rounds.some((round) => round.usedHelp)
    ? Math.min(unhelpedRate, 0.5)
    : unhelpedRate;
  return {
    correct: total,
    total,
    stars: starsFromAccuracy(starRate),
    skillEvidence:
      unhelped.length === 0
        ? []
        : evenSkillEvidence(skillsAffected(config), outcomeFromAccuracy(evidenceRate)),
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
