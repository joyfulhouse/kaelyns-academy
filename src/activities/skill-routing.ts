import type { ActivityKind } from "@/content/activity-configs";
import { getSkill } from "@/content/skills";
import type { SkillTag } from "@/content/types";
import { getServerActivityType, validatePlayableActivityConfig } from "./definitions";

function duplicateSkill(skills: readonly SkillTag[]): SkillTag | undefined {
  const seen = new Set<SkillTag>();
  for (const skill of skills) {
    if (seen.has(skill)) return skill;
    seen.add(skill);
  }
  return undefined;
}

/**
 * Validate the complete server-owned skill-routing contract for one activity.
 * The config must be playable, every outer/runtime skill must exist, and the
 * two unique skill sets must match exactly. Exact equality matters because
 * outer tags drive recommendations while runtime tags authorize evidence.
 *
 * PURE + server-safe: no DB, browser component, or provider import.
 */
export function exactSkillRoutingIssue(
  kind: ActivityKind,
  config: unknown,
  outerSkills: readonly SkillTag[],
): string | null {
  const playable = validatePlayableActivityConfig(kind, config);
  if (!playable.ok) return `invalid or unplayable ${kind} config`;

  const duplicateOuter = duplicateSkill(outerSkills);
  if (duplicateOuter) return `duplicate outer skill: ${duplicateOuter}`;
  const unknownOuter = outerSkills.find((skill) => getSkill(skill) === undefined);
  if (unknownOuter) return `unknown outer skill: ${unknownOuter}`;

  let runtimeSkills: SkillTag[];
  try {
    runtimeSkills = getServerActivityType(kind).skillsAffected(playable.data);
  } catch {
    return `${kind} runtime skill routing failed`;
  }

  const duplicateRuntime = duplicateSkill(runtimeSkills);
  if (duplicateRuntime) return `duplicate runtime skill: ${duplicateRuntime}`;
  const unknownRuntime = runtimeSkills.find((skill) => getSkill(skill) === undefined);
  if (unknownRuntime) return `unknown runtime skill: ${unknownRuntime}`;

  const outerSet = new Set(outerSkills);
  const runtimeSet = new Set(runtimeSkills);
  const missingOuter = runtimeSkills.find((skill) => !outerSet.has(skill));
  if (missingOuter) return `runtime skill is missing from outer skills: ${missingOuter}`;
  const extraOuter = outerSkills.find((skill) => !runtimeSet.has(skill));
  if (extraOuter) return `outer skill is not emitted at runtime: ${extraOuter}`;
  return null;
}
