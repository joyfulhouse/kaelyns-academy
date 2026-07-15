import { langSymbolIntroConfig, type LangSymbolIntroConfig } from "@/content/activity-configs";
import { LANGUAGE_LIST } from "@/content/languages";
import type { ActivityScore, SkillTag } from "@/content/types";
import { z } from "zod";
import {
  evenSkillEvidence,
  firstTryRateFromAttempts,
  outcomeFromAccuracy,
  starsFromAccuracy,
} from "../_shared/scoring";

/** Server-safe schema + scoring for lang-symbol-intro. No "use client". */
export const schema = langSymbolIntroConfig;

const exposure = z
  .object({
    symbolId: z.string().min(1).max(160),
    activated: z.boolean(),
    heardExample: z.boolean(),
    usedHelp: z.boolean(),
  })
  .strict();

const check = z
  .object({
    choiceIndex: z.number().int().min(0).max(5),
    attempts: z.number().int().min(1).max(20),
  })
  .strict();

/** Bounded exposure flags and final verification choices; no child audio or text. */
export const responseSchema = z
  .object({
    exposures: z.array(exposure).min(3).max(8),
    checks: z.array(check).min(1).max(6),
  })
  .strict();
export type LangSymbolIntroResponse = z.infer<typeof responseSchema>;

function assertResponseMatchesConfig(
  config: LangSymbolIntroConfig,
  response: LangSymbolIntroResponse,
): void {
  if (response.exposures.length !== config.symbols.length) {
    throw new Error("A symbol response must include one exposure per taught symbol.");
  }

  const ids = response.exposures.map((entry) => entry.symbolId);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Symbol exposure ids must be unique.");
  }
  const expectedIds = new Set(config.symbols.map((entry) => entry.id));
  if (ids.some((id) => !expectedIds.has(id))) {
    throw new Error("Symbol exposures must match the taught inventory ids.");
  }
  if (response.exposures.some((entry) => !entry.activated)) {
    throw new Error("Every taught symbol must be activated before completion.");
  }

  if (response.checks.length !== config.verify.length) {
    throw new Error("A symbol response must include one check per verification prompt.");
  }
  response.checks.forEach((result, index) => {
    const choiceCount = config.verify[index]?.choices.length ?? 0;
    if (
      !Number.isInteger(result.choiceIndex) ||
      result.choiceIndex < 0 ||
      result.choiceIndex >= choiceCount
    ) {
      throw new Error(`Symbol check ${index + 1} has an out-of-range choice index.`);
    }
  });
}

export function score(
  config: LangSymbolIntroConfig,
  response: LangSymbolIntroResponse,
): ActivityScore {
  assertResponseMatchesConfig(config, response);

  const total = config.verify.length;
  let correct = 0;
  let independence = 0;
  for (let index = 0; index < total; index += 1) {
    const result = response.checks[index];
    const matched = result?.choiceIndex === config.verify[index]?.answerIndex;
    if (matched) correct += 1;
    if (result) independence += firstTryRateFromAttempts(matched, result.attempts);
  }
  const independentRate = total === 0 ? 1 : independence / total;
  const usedPronunciationHelp = response.exposures.some((entry) => entry.usedHelp);
  const rate = usedPronunciationHelp ? Math.min(independentRate, 0.5) : independentRate;

  return {
    correct,
    total,
    stars: correct > 0 ? starsFromAccuracy(rate) : 1,
    skillEvidence: evenSkillEvidence(skillsAffected(config), outcomeFromAccuracy(rate)),
  };
}

export function skillsAffected(config: LangSymbolIntroConfig): SkillTag[] {
  return config.skillTags;
}

/** Exact plugin-local language inventory net for generated symbol introductions. */
export function validateGenerated(config: unknown): string | null {
  const parsed = schema.safeParse(config);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid symbol config.";

  const language = LANGUAGE_LIST.find((candidate) => candidate.locale === parsed.data.locale);
  if (!language) return `Unknown language locale: ${parsed.data.locale}`;

  for (const taught of parsed.data.symbols) {
    const canonical = language.inventory.find((entry) => entry.id === taught.id);
    if (!canonical) return `Unknown inventory symbol id: ${taught.id}`;
    if (
      taught.symbol !== canonical.symbol ||
      taught.romanization !== canonical.romanization ||
      taught.spoken !== canonical.spoken
    ) {
      return `Symbol ${taught.id} must use its canonical glyph, romanization, and spoken text.`;
    }
    if (taught.audioKey !== canonical.id) {
      return `Symbol ${taught.id} must use its canonical audio key.`;
    }
    if (taught.example !== undefined && taught.example !== canonical.example) {
      return `Symbol ${taught.id} has a noncanonical example.`;
    }
    if (
      taught.exampleSpoken !== undefined &&
      taught.exampleSpoken !== canonical.exampleSpoken
    ) {
      return `Symbol ${taught.id} has noncanonical spoken example text.`;
    }
    if (taught.meaning !== undefined && taught.meaning !== canonical.meaning) {
      return `Symbol ${taught.id} has a noncanonical meaning.`;
    }
  }

  if (parsed.data.verify.some((verification) => !verification.spokenPrompt)) {
    return "Every symbol verification needs a spokenPrompt.";
  }
  return null;
}
