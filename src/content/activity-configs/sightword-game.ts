import { z } from "zod";

const boundedWord = z.string().trim().min(1).max(32);
const boundedInstruction = z.string().trim().min(1).max(240);

function normalized(value: string): string {
  return value.toLocaleLowerCase();
}

export const sightwordRoundSchema = z
  .object({
    target: boundedWord,
    choices: z.array(boundedWord).min(2).max(6),
    context: z.string().trim().min(1).max(160).optional(),
    spokenPrompt: z.string().trim().min(1).max(160).optional(),
  })
  .strict()
  .superRefine((round, context) => {
    const choices = round.choices.map(normalized);
    if (new Set(choices).size !== choices.length) {
      context.addIssue({ code: "custom", path: ["choices"], message: "choices must be unique" });
    }
    const targetOccurrences = choices.filter((choice) => choice === normalized(round.target)).length;
    if (targetOccurrences !== 1) {
      context.addIssue({
        code: "custom",
        path: ["choices"],
        message: "choices must contain the target exactly once",
      });
    }
  });
export type SightwordRound = z.infer<typeof sightwordRoundSchema>;

export function validateSightwordRoundSet(rounds: readonly SightwordRound[]): string | null {
  const targets = rounds.map((round) => normalized(round.target));
  const targetSet = new Set(targets);
  if (targetSet.size !== targets.length) return "round targets must be unique";
  for (const round of rounds) {
    const ownTarget = normalized(round.target);
    for (const choice of round.choices) {
      const candidate = normalized(choice);
      if (candidate !== ownTarget && targetSet.has(candidate)) {
        return `target ${choice} cannot be a distractor in another round`;
      }
    }
  }
  return null;
}

const roundConfig = z
  .object({
    instruction: boundedInstruction,
    rounds: z.array(sightwordRoundSchema).min(1).max(8),
    skillTag: z.string().trim().min(1).max(64).optional(),
  })
  .strict()
  .superRefine((config, context) => {
    const reason = validateSightwordRoundSet(config.rounds);
    if (reason) context.addIssue({ code: "custom", path: ["rounds"], message: reason });
  });

export const sightwordGameConfig = roundConfig;
export type SightwordGameConfig = z.input<typeof sightwordGameConfig>;
