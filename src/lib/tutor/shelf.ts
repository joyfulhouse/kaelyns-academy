import { isGenerableKind } from "@/lib/ai/generable";
import { getSkill } from "@/content";
import type { Lesson, SkillTag } from "@/content";
import type { ActivityKind } from "@/content/activity-configs";

export const SHELF_BATCH = 4;
export const SHELF_LESSON_CAP = 8;

/**
 * The client-safe shelf-item shape (mirrors {@link import("./store").ShelfItem}
 * structurally so this pure module stays free of any DB/store import — store.ts
 * imports THIS module, so a back-import would cycle). The kid surface + the
 * server action both pass real ShelfItems here.
 */
export interface ShelfPick {
  id: string;
  kind: ActivityKind;
  title: string;
  createdAt: string;
  lessonId: string;
  unitKey: string;
}

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

/**
 * The "next thing" fallback pick (B3 / spec §4.1): when the tutor has no authored
 * recommendation left, offer the oldest not-yet-played generated shelf item so a
 * child who has finished the authored map still has something fresh to do. Pure:
 * oldest-first by `createdAt` (a stable, deterministic order matching how the
 * shelf is stored/rendered), skipping any item already completed. Returns
 * undefined when the shelf is empty or every item is done.
 */
export function nextGeneratedPick<T extends ShelfPick>(
  shelf: readonly T[],
  completed: Set<string>,
): T | undefined {
  return [...shelf]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .find((item) => !completed.has(item.id));
}

/**
 * Fold the learner's completed generated SHELF attempts into the completed-id +
 * best-stars pair the learner surface reconciles from (durable shelf credit, B3).
 *
 * A generated shelf item is a one-time, durable star earner — unlike an ephemeral
 * in-session "More" one-shot — so its completion must survive the post-record
 * reconcile (otherwise {@link nextGeneratedPick} would re-offer a played item and
 * its optimistic star glyph would flash away). The server state read carries best
 * stars for ALL generated attempts; this scopes them to the shelf ids so ONLY
 * durable shelf plays are credited — an in-session "More" attempt (whose
 * activityId is an authored id, never a shelf row) has no matching shelf id and
 * stays excluded. Pure.
 */
export function shelfCompletions(
  shelf: readonly ShelfPick[],
  generatedBest: readonly { activityId: string; stars: number }[],
): { activityId: string; stars: number }[] {
  const shelfIds = new Set(shelf.map((s) => s.id));
  return generatedBest.filter((c) => shelfIds.has(c.activityId));
}
