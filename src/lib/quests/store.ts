// server-only: opens DB connections; import from server actions / route handlers only.
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { learnerQuest, questTemplate, skill, starLedger } from "@/lib/db/schema";
import { withOwnedLearner } from "@/lib/tutor/scope";
import { captureNonCritical } from "@/lib/capture";
import type { ZodType } from "zod";
import {
  questKindSchema,
  questProgressSchema,
  questTargetSchema,
  type QuestKind,
  type QuestProgress,
  type QuestStatus,
  type QuestTarget,
} from "./config";
import { foldQuestProgress, type QuestAttemptCtx, type QuestDraft, type QuestTemplateRow } from "./logic";

export interface QuestView {
  id: string;
  title: string;
  kind: QuestKind;
  target: QuestTarget;
  progress: QuestProgress;
  rewardStars: number;
  status: QuestStatus;
}

// "@/lib/db" exports no `Db`/transaction type, so the tx parameter type is
// derived locally from getDb().transaction's callback signature (never `any`
// — see Task 5 brief caveat 1).
type Db = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/**
 * Parse a stored quest jsonb value (target/progress) defensively. NOT
 * `@/lib/tutor/jsonb`'s parseJsonbFailClosed: that helper's `T extends
 * AiGated` constraint requires at least one property in common with
 * `{ aiPractice?: boolean }`, and QuestTarget/QuestProgress share none —
 * TypeScript's weak-type check correctly rejects the call (see Task 5 brief
 * caveat 2; this is a real compile error, not just a null-vs-default
 * difference).
 *
 * Unlike the original version of this helper, this now fails CLOSED like the
 * §8 AI gate: quest jsonb funds the star economy (a `complete_n` quest whose
 * corrupt `target`/`progress` silently defaulted to `{count: 1}`/`{done: 0}`
 * would read as instantly completable, crediting stars off corrupt data), so
 * on schema failure this logs via `captureNonCritical` and returns `null`
 * instead of a safe-looking default — the caller (`toView`) skips the row
 * entirely: it neither renders, folds, nor credits.
 */
function safeParseQuestJsonb<T>(schema: ZodType<T>, raw: unknown, context: string): T | null {
  const parsed = schema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data;
  captureNonCritical(`malformed ${context}`, parsed.error);
  return null;
}

/** Published templates in authoring sort order (selection input). */
export async function listPublishedQuestTemplates(): Promise<QuestTemplateRow[]> {
  const rows = await getDb()
    .select()
    .from(questTemplate)
    .where(eq(questTemplate.status, "published"))
    .orderBy(asc(questTemplate.createdAt));
  const out: QuestTemplateRow[] = [];
  for (const r of rows) {
    const kind = questKindSchema.safeParse(r.kind);
    if (!kind.success) continue; // unknown kind (e.g. Phase C data on old code) — skip
    out.push({ id: r.id, slug: r.slug, title: r.title, kind: kind.data, params: r.params, rewardStars: r.rewardStars });
  }
  return out;
}

/** Resolve a friendly skill label for `{focus}` in practice_skill titles. */
export async function skillLabel(slug: string): Promise<string> {
  const rows = await getDb().select({ label: skill.label }).from(skill).where(eq(skill.slug, slug)).limit(1);
  return rows[0]?.label ?? slug;
}

/**
 * Row → view, fail-closed: an unknown kind or a jsonb column that fails its
 * schema parse returns `null` (skip this row — it neither renders, folds,
 * nor credits) rather than substituting a default that could look
 * instantly-completable.
 */
function toView(r: typeof learnerQuest.$inferSelect): QuestView | null {
  const kind = questKindSchema.safeParse(r.kind);
  if (!kind.success) {
    captureNonCritical(`unknown quest kind (${r.id})`, kind.error);
    return null;
  }
  const target = safeParseQuestJsonb(questTargetSchema, r.target, `quest target (${r.id})`);
  if (target === null) return null;
  const progress = safeParseQuestJsonb(questProgressSchema, r.progress, `quest progress (${r.id})`);
  if (progress === null) return null;
  return {
    id: r.id,
    title: r.title,
    kind: kind.data,
    target,
    progress,
    rewardStars: r.rewardStars,
    status: r.status as QuestStatus,
  };
}

function dayKey(learnerId: string, programSlug: string, day: string) {
  return and(
    eq(learnerQuest.learnerId, learnerId),
    eq(learnerQuest.programSlug, programSlug),
    eq(learnerQuest.assignedOn, day),
  );
}

export async function getDailyQuests(
  accountId: string,
  learnerId: string,
  programSlug: string,
  day: string,
): Promise<QuestView[]> {
  return withOwnedLearner<QuestView[]>(
    accountId,
    learnerId,
    async () => {
      const rows = await getDb().select().from(learnerQuest).where(dayKey(learnerId, programSlug, day));
      return rows.map(toView).filter((v): v is QuestView => v !== null);
    },
    [],
  );
}

/** Insert today's drafts idempotently (unique on learner+program+day+template),
 *  then re-read — two racing generators converge on one menu. */
export async function assignDailyQuests(
  accountId: string,
  learnerId: string,
  programSlug: string,
  day: string,
  drafts: QuestDraft[],
): Promise<QuestView[]> {
  return withOwnedLearner<QuestView[]>(
    accountId,
    learnerId,
    async () => {
      if (drafts.length > 0) {
        await getDb()
          .insert(learnerQuest)
          .values(
            drafts.map((d) => ({
              learnerId,
              templateId: d.templateId,
              programSlug,
              assignedOn: day,
              title: d.title,
              kind: d.kind,
              target: questTargetSchema.parse(d.target),
              progress: { done: 0 },
              rewardStars: d.rewardStars,
              status: "offered" as const,
            })),
          )
          .onConflictDoNothing({
            target: [
              learnerQuest.learnerId,
              learnerQuest.programSlug,
              learnerQuest.assignedOn,
              learnerQuest.templateId,
            ],
          });
      }
      const rows = await getDb().select().from(learnerQuest).where(dayKey(learnerId, programSlug, day));
      return rows.map(toView).filter((v): v is QuestView => v !== null);
    },
    [],
  );
}

/** She activates ONE quest at a time: target offered→active, any other
 *  same-day active→offered. Done quests are never demoted. */
export async function activateQuest(
  accountId: string,
  learnerId: string,
  questId: string,
  day: string,
): Promise<boolean> {
  return withOwnedLearner<boolean>(
    accountId,
    learnerId,
    async () => {
      return getDb().transaction(async (tx) => {
        const rows = await tx
          .select()
          .from(learnerQuest)
          .where(and(eq(learnerQuest.id, questId), eq(learnerQuest.learnerId, learnerId)))
          .limit(1)
          .for("update");
        const target = rows[0];
        if (!target || target.assignedOn !== day || target.status !== "offered") return false;
        await tx
          .update(learnerQuest)
          .set({ status: "offered", updatedAt: new Date() })
          .where(
            and(
              dayKey(learnerId, target.programSlug, day),
              eq(learnerQuest.status, "active"),
            ),
          );
        await tx
          .update(learnerQuest)
          .set({ status: "active", updatedAt: new Date() })
          .where(eq(learnerQuest.id, questId));
        return true;
      });
    },
    false,
  );
}

/**
 * Fold one recorded attempt into today's ACTIVE quests — called INSIDE
 * recordAttempt's open transaction (all-or-nothing with the attempt row).
 * Completion flips status to done and credits rewardStars to the ledger
 * (reason quest_complete) in the same tx.
 *
 * Program-scoped: only quests assigned for `programSlug` fold (mirrors
 * `activateQuest`'s program-scoped demotion via `dayKey`). A learner enrolled
 * in two programs completing an activity in one must never fold into or
 * credit the other program's quests.
 *
 * Lock order is deterministic (`ORDER BY id`) so two racing `recordAttempt`
 * transactions with overlapping active-quest rows lock in the same order
 * rather than potentially deadlocking (mirrors the skill-fold's sorted-lock
 * pattern in `src/lib/tutor/store.ts`).
 */
export async function applyAttemptToQuests(
  tx: Db,
  learnerId: string,
  programSlug: string,
  day: string,
  ctx: QuestAttemptCtx,
): Promise<void> {
  const rows = await tx
    .select()
    .from(learnerQuest)
    .where(and(dayKey(learnerId, programSlug, day), eq(learnerQuest.status, "active")))
    .orderBy(asc(learnerQuest.id))
    .for("update");
  for (const row of rows) {
    const view = toView(row);
    if (!view) continue;
    const { progress, completed } = foldQuestProgress(
      { kind: view.kind, target: view.target, progress: view.progress },
      ctx,
    );
    if (progress.done === view.progress.done) continue;
    await tx
      .update(learnerQuest)
      .set({ progress, status: completed ? "done" : "active", updatedAt: new Date() })
      .where(eq(learnerQuest.id, row.id));
    if (completed && row.rewardStars > 0) {
      await tx.insert(starLedger).values({
        learnerId,
        delta: row.rewardStars,
        reason: "quest_complete",
        refId: row.id,
      });
    }
  }
}
