import type { Program } from "@/content";
import {
  QUEST_PARAMS_SCHEMAS,
  type QuestKind,
  type QuestProgress,
  type QuestTarget,
} from "./config";

/** The attempt facts the quest fold matches against (derived server-side). */
export interface QuestAttemptCtx {
  activityId: string;
  unitId: string | null;
  skills: string[];
  generated: boolean;
}

export function attemptMatchesQuest(
  kind: QuestKind,
  target: QuestTarget,
  ctx: QuestAttemptCtx,
): boolean {
  switch (kind) {
    case "complete_n":
      // Any completed activity counts — INCLUDING generated practice, so "more,
      // made just for me" moves the day's quest (repeat play earns quest
      // progress even though the ledger's first-completion rule earns nothing).
      return true;
    case "try_strand":
      return ctx.unitId !== null && ctx.unitId === target.unitId;
    case "practice_skill":
      return target.skill !== undefined && ctx.skills.includes(target.skill);
  }
}

export function foldQuestProgress(
  quest: { kind: QuestKind; target: QuestTarget; progress: QuestProgress },
  ctx: QuestAttemptCtx,
): { progress: QuestProgress; completed: boolean } {
  if (!attemptMatchesQuest(quest.kind, quest.target, ctx)) {
    return { progress: quest.progress, completed: false };
  }
  const done = Math.min(quest.target.count, quest.progress.done + 1);
  return { progress: { done }, completed: done >= quest.target.count };
}

export interface QuestTemplateRow {
  id: string;
  slug: string;
  title: string;
  kind: QuestKind;
  params: unknown;
  rewardStars: number;
}

export interface RecommendationLite {
  unitId: string;
  unitTitle: string;
}

export interface QuestDraft {
  templateId: string;
  kind: QuestKind;
  title: string;
  target: QuestTarget;
  rewardStars: number;
}

const MAX_DAILY_QUESTS = 3;

/**
 * Pure daily-menu selection: one draft per kind, at most 3 (spec §3.4).
 *   complete_n     → params.count, no target refinement
 *   try_strand     → the recommender's TOP strand (breadth-first, so it points
 *                    at her least-played strand); count 1
 *   practice_skill → the first emerging skill; count 2
 * A template whose params fail the kind schema is skipped (bad authoring must
 * not break the child's day). Deterministic — no randomness (spec §13).
 */
export function selectDailyQuests(
  templates: QuestTemplateRow[],
  recs: RecommendationLite[],
  emergingSkills: string[],
): QuestDraft[] {
  const drafts: QuestDraft[] = [];
  const seenKinds = new Set<QuestKind>();
  for (const t of templates) {
    if (drafts.length >= MAX_DAILY_QUESTS || seenKinds.has(t.kind)) continue;
    const params = QUEST_PARAMS_SCHEMAS[t.kind]?.safeParse(t.params);
    if (!params?.success) continue;

    if (t.kind === "complete_n") {
      const count = (params.data as { count: number }).count;
      drafts.push({ templateId: t.id, kind: t.kind, title: t.title, target: { count }, rewardStars: t.rewardStars });
    } else if (t.kind === "try_strand") {
      const rec = recs[0];
      if (!rec) continue;
      drafts.push({
        templateId: t.id,
        kind: t.kind,
        title: t.title.replace("{focus}", rec.unitTitle),
        target: { count: 1, unitId: rec.unitId },
        rewardStars: t.rewardStars,
      });
    } else {
      const skill = emergingSkills[0];
      if (!skill) continue;
      drafts.push({
        templateId: t.id,
        kind: t.kind,
        title: t.title.replace("{focus}", skill),
        target: { count: 2, skill },
        rewardStars: t.rewardStars,
      });
    }
    seenKinds.add(t.kind);
  }
  return drafts;
}

/** Walk a program tree to the unit containing `activityId` (quest fold context). */
export function findUnitIdOfActivity(program: Program, activityId: string): string | null {
  for (const unit of program.units) {
    for (const lesson of unit.lessons) {
      if (lesson.activities.some((a) => a.id === activityId)) return unit.id;
    }
  }
  return null;
}
