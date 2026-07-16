import { langListenMatchConfig, type LangListenMatchConfig } from "@/content/activity-configs";
import { LANGUAGE_LIST } from "@/content/languages";
import type { ActivityScore, SkillTag } from "@/content/types";
import { z } from "zod";
import {
  evenSkillEvidence,
  firstTryRateFromAttempts,
  outcomeFromAccuracy,
  starsFromAccuracy,
} from "../_shared/scoring";

/** Server-safe schema + scoring for lang-listen-match. No "use client". */
export const schema = langListenMatchConfig;

const listenResult = z
  .object({
    choiceIndex: z.number().int().min(0).max(5),
    attempts: z.number().int().min(1).max(20),
    usedHelp: z.boolean(),
  })
  .strict();

/** Final choice plus bounded independence/support evidence for each listening item. */
export const responseSchema = z
  .object({ items: z.array(listenResult).min(1).max(12) })
  .strict();
export type LangListenMatchResponse = z.infer<typeof responseSchema>;

function isCorrect(
  config: LangListenMatchConfig,
  response: LangListenMatchResponse,
  index: number,
): boolean {
  return response.items[index]?.choiceIndex === config.items[index]?.answerIndex;
}

export function score(
  config: LangListenMatchConfig,
  response: LangListenMatchResponse,
): ActivityScore {
  const items = config.items;
  const total = items.length;
  if (response.items.length !== total) {
    throw new Error("A listening response must include one result per listening item.");
  }
  response.items.forEach((result, index) => {
    const choiceCount = items[index]?.choices.length ?? 0;
    if (
      !Number.isInteger(result.choiceIndex) ||
      result.choiceIndex < 0 ||
      result.choiceIndex >= choiceCount
    ) {
      throw new Error(`Listening result ${index + 1} has an out-of-range choice index.`);
    }
  });

  let correct = 0;
  let independence = 0;
  for (let i = 0; i < total; i++) {
    const result = response.items[i];
    const matched = isCorrect(config, response, i);
    if (matched) correct += 1;
    if (result) {
      const attemptRate = firstTryRateFromAttempts(matched, result.attempts);
      independence += result.usedHelp ? Math.min(attemptRate, 0.5) : attemptRate;
    }
  }
  const rate = total === 0 ? 1 : independence / total;
  return {
    correct,
    total,
    stars: correct > 0 ? starsFromAccuracy(rate) : 1,
    skillEvidence: evenSkillEvidence(skillsAffected(config), outcomeFromAccuracy(rate)),
  };
}

/** Skills ride on the config so AI-generated items are self-describing. */
export function skillsAffected(config: LangListenMatchConfig): SkillTag[] {
  return config.skillTags;
}

/** Exact plugin-local language inventory net for generated listening configs. */
export function validateGenerated(config: unknown): string | null {
  const parsed = schema.safeParse(config);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid listening config.";

  const language = LANGUAGE_LIST.find((candidate) => candidate.locale === parsed.data.locale);
  if (!language) return `Unknown language locale: ${parsed.data.locale}`;

  for (const item of parsed.data.items) {
    const entries = item.choices.map((choice) =>
      language.inventory.find((entry) => entry.symbol === choice),
    );
    if (entries.some((entry) => entry === undefined)) {
      return "Every listening choice must be an exact inventory symbol.";
    }

    const answer = entries[item.answerIndex];
    if (!answer || item.spoken !== answer.spoken) {
      return "The heard prompt must match the answer's canonical spoken text.";
    }
    if (item.audioKey !== undefined && item.audioKey !== answer.id) {
      return "The audio key must match the answer's canonical inventory id.";
    }
    if (
      item.choiceLabels &&
      item.choiceLabels.some((label, index) => label !== entries[index]?.romanization)
    ) {
      return "Romanization labels must match the canonical inventory.";
    }
  }

  return null;
}
