import { isGenerableKind } from "@/lib/ai/practice";
import { getSkill } from "@/content";
import type { Lesson, SkillTag } from "@/content";
import type { ActivityKind } from "@/content/activity-configs";

export const SHELF_BATCH = 4;
export const SHELF_LESSON_CAP = 8;

export interface GenerationTarget {
  kind: ActivityKind;
  focus: string;
  skillTags: SkillTag[];
  sourceTitle: string;
  n: number;
}

/**
 * Choose what to generate for a completed lesson (B3 §5.1): group the lesson's
 * GENERABLE activities by kind, split `batch` across the groups (earlier
 * groups get the remainder), focus = the primary skill's label (the same
 * derivation as ActivityHost's explore path). Deterministic, pure.
 */
export function pickGenerationTargets(lesson: Lesson, batch: number): GenerationTarget[] {
  const generable = lesson.activities.filter((a) => isGenerableKind(a.kind));
  if (generable.length === 0 || batch <= 0) return [];
  const byKind = new Map<ActivityKind, (typeof generable)[number]>();
  for (const a of generable) if (!byKind.has(a.kind)) byKind.set(a.kind, a);
  const groups = [...byKind.values()];
  const base = Math.floor(batch / groups.length);
  const extra = batch % groups.length;
  return groups
    .map((a, i) => ({
      kind: a.kind,
      focus: (a.skillTags[0] ? getSkill(a.skillTags[0])?.label : undefined) ?? a.title,
      skillTags: a.skillTags,
      sourceTitle: a.title,
      n: base + (i < extra ? 1 : 0),
    }))
    .filter((t) => t.n > 0);
}
