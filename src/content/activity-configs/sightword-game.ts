import { z } from "zod";

const boundedWord = z.string().trim().min(1).max(32);
const boundedInstruction = z.string().trim().min(1).max(240);

function normalized(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

const WORD_CHARACTER = /[\p{L}\p{N}]/u;
const TERMINAL_EXPLICIT_TARGET =
  /\b(?:find|choose|pick|tap|show|read)\s+(?:the\s+)?word\s+["“]?([^"”.,!?;:]+?)["”]?(?=\s*(?:[.!?]|$))/giu;
const QUOTED_EXPLICIT_TARGET =
  /\b(?:find|choose|pick|tap|show|read)\s+(?:the\s+)?word\s+["“]([^"”]+)["”]/giu;

function containsWholeTarget(text: string, target: string): boolean {
  const source = normalized(text);
  const sought = normalized(target);
  let start = source.indexOf(sought);
  while (start !== -1) {
    const before = start === 0 ? undefined : source[start - 1];
    const after = source[start + sought.length];
    if ((!before || !WORD_CHARACTER.test(before)) && (!after || !WORD_CHARACTER.test(after))) {
      return true;
    }
    start = source.indexOf(sought, start + sought.length);
  }
  return false;
}

function explicitlyNamedTargets(instruction: string): string[] {
  const matches = [
    ...instruction.matchAll(TERMINAL_EXPLICIT_TARGET),
    ...instruction.matchAll(QUOTED_EXPLICIT_TARGET),
  ].map((match) => normalized(match[1] ?? ""));
  return [...new Set(matches.filter(Boolean))];
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

export function validateSightwordRoundSet(
  instruction: string,
  rounds: readonly SightwordRound[],
): string | null {
  const targets = rounds.map((round) => normalized(round.target));
  const targetSet = new Set(targets);
  if (targetSet.size !== targets.length) return "round targets must be unique";

  const instructionTargets = explicitlyNamedTargets(instruction);
  if (instructionTargets.length > 0 && rounds.length !== 1) {
    return "a specific global instruction can only describe one round";
  }
  for (const namedTarget of instructionTargets) {
    if (namedTarget !== targets[0]) {
      return `instruction names ${namedTarget}, which is not a round target`;
    }
  }

  for (const round of rounds) {
    const ownTarget = normalized(round.target);
    if (round.spokenPrompt) {
      const namedTargets = explicitlyNamedTargets(round.spokenPrompt);
      if (namedTargets.some((namedTarget) => namedTarget !== ownTarget)) {
        return `spoken prompt for ${round.target} names a different target`;
      }
      if (!containsWholeTarget(round.spokenPrompt, round.target)) {
        return `spoken prompt must say target ${round.target}`;
      }
    }
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
    const reason = validateSightwordRoundSet(config.instruction, config.rounds);
    if (reason) context.addIssue({ code: "custom", path: ["rounds"], message: reason });
  });

export const sightwordGameConfig = roundConfig;
export type SightwordGameConfig = z.input<typeof sightwordGameConfig>;
