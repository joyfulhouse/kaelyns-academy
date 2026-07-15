import type { z } from "zod";
import {
  getServerActivityType,
  validatePlayableActivityConfig,
} from "@/activities/definitions";
import {
  ACTIVITY_CONFIG_SCHEMAS,
  type ActivityKind,
} from "@/content/activity-configs";
import { getSkill } from "@/content/skills";
import type { SkillTag } from "@/content/types";

export interface PrepareGeneratedItemsOptions {
  skillHints: SkillTag[];
  /** Optional server-owned fact canonicalizer. Return null to reject one sibling. */
  canonicalize?: (parsed: unknown) => unknown | null;
}

export function assertKnownSkillHints(kind: ActivityKind, skillHints: readonly SkillTag[]): void {
  if (skillHints.some((skill) => getSkill(skill) === undefined)) {
    throw new Error(`prepareGeneratedItems: ${kind} received an unknown skill hint`);
  }
}

export function canonicalSkillHints(
  kind: ActivityKind,
  skillHints: readonly SkillTag[],
): SkillTag[] {
  assertKnownSkillHints(kind, skillHints);
  return [...new Set(skillHints)];
}

function canonicalizeSkillRouting(
  kind: ActivityKind,
  parsed: unknown,
  skillHints: readonly SkillTag[],
): void {
  if (!parsed || typeof parsed !== "object") return;
  const item = parsed as Record<string, unknown>;
  if (kind === "phonics-wordbuild") {
    const hint = skillHints.find((skill) => skill.startsWith("phonics.decode."));
    if (hint) item.skillTag = hint;
    else delete item.skillTag;
  }
  if (kind === "sightword-game") {
    const [hint] = skillHints;
    if (hint) item.skillTag = hint;
    else delete item.skillTag;
  }
  if (kind === "lang-symbol-intro" || kind === "lang-listen-match") {
    item.skillTags = [...skillHints];
  }
}

function validationMessage(
  result: ReturnType<typeof validatePlayableActivityConfig>,
): string | null {
  if (result.ok) return null;
  if (result.reason === "unknown-kind") return "unknown activity kind";
  if (result.reason === "unplayable") return result.message;
  return result.error.issues[0]?.message ?? "invalid activity config";
}

/** Shared exact-schema + playability boundary for one generated config. */
export function validateGeneratedFor(kind: ActivityKind, config: unknown): string | null {
  return validationMessage(validatePlayableActivityConfig(kind, config));
}

/**
 * Parse, canonicalize, and validate generated siblings independently. Invalid
 * siblings are discarded; no raw model object crosses this boundary. The
 * returned values are the registered schema's parsed output.
 */
export function prepareGeneratedItems<K extends ActivityKind>(
  kind: K,
  rawItems: readonly unknown[],
  options: PrepareGeneratedItemsOptions,
): z.output<(typeof ACTIVITY_CONFIG_SCHEMAS)[K]>[] {
  const skillHints = canonicalSkillHints(kind, options.skillHints);

  const schema = ACTIVITY_CONFIG_SCHEMAS[kind];
  const definition = getServerActivityType(kind);
  const kept: z.output<(typeof ACTIVITY_CONFIG_SCHEMAS)[K]>[] = [];

  for (const rawItem of rawItems) {
    const parsed = schema.safeParse(rawItem);
    if (!parsed.success) continue;
    canonicalizeSkillRouting(kind, parsed.data, skillHints);

    let canonical: unknown;
    try {
      canonical = options.canonicalize ? options.canonicalize(parsed.data) : parsed.data;
    } catch {
      continue;
    }
    if (canonical === null) continue;

    const playable = validatePlayableActivityConfig(kind, canonical);
    if (!playable.ok) continue;
    const runtimeSkills = definition.skillsAffected(playable.data);
    if (runtimeSkills.some((skill) => getSkill(skill) === undefined)) continue;
    if (runtimeSkills.some((skill) => !skillHints.includes(skill))) continue;
    if (skillHints.length > 0 && runtimeSkills.length === 0) continue;

    kept.push(playable.data as z.output<(typeof ACTIVITY_CONFIG_SCHEMAS)[K]>);
  }

  if (kept.length === 0) {
    throw new Error(`prepareGeneratedItems: all ${kind} items failed shared validation`);
  }
  return kept;
}
