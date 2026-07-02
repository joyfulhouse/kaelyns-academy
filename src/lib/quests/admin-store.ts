// server-only: opens DB connections; import from server actions / route handlers only.
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import {
  isValidStatusTransition,
  lifecycleStatusSchema,
  ConcurrentStatusChangeError,
  InvalidStatusTransitionError,
  type LifecycleStatus,
} from "@/lib/admin/lifecycle";
import { questKindSchema, questParamsSchemaFor, type QuestKind } from "./config";

/** Thrown when a new quest template's slug collides with an existing one. */
export class DuplicateTemplateSlugError extends Error {
  constructor(slug: string) {
    super(`A quest template with slug "${slug}" already exists`);
    this.name = "DuplicateTemplateSlugError";
  }
}

/**
 * PURE. Validate a template's `params` against its `kind`'s schema
 * (questParamsSchemaFor) — the two-gate pattern quests/config.ts documents
 * (authoring AND persistence must both reject a mismatched kind/params pair).
 * @throws {z.ZodError} on a kind/params mismatch (e.g. complete_n with no
 * `count`, or a count outside 1–10).
 */
export function validateTemplateInput(kind: QuestKind, params: unknown): void {
  questParamsSchemaFor(kind).parse(params);
}

const slugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens");

/** Shared authoring fields. Slug is immutable after creation (see
 *  updateQuestTemplateInputSchema), matching the program store's convention. */
export const createQuestTemplateInputSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1).max(160),
  kind: questKindSchema,
  params: z.unknown(),
  rewardStars: z.number().int().min(1).max(20),
});
export type CreateQuestTemplateInput = z.infer<typeof createQuestTemplateInputSchema>;

export const updateQuestTemplateInputSchema = createQuestTemplateInputSchema.omit({ slug: true });
export type UpdateQuestTemplateInput = z.infer<typeof updateQuestTemplateInputSchema>;

export interface AdminQuestTemplateRow {
  id: string;
  slug: string;
  title: string;
  kind: QuestKind;
  params: unknown;
  rewardStars: number;
  status: string;
}

function toRow(r: typeof schema.questTemplate.$inferSelect): AdminQuestTemplateRow {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    kind: r.kind as QuestKind,
    params: r.params,
    rewardStars: r.rewardStars,
    status: r.status,
  };
}

/** Every template (any status), authoring order. */
export async function listQuestTemplates(): Promise<AdminQuestTemplateRow[]> {
  const rows = await getDb()
    .select()
    .from(schema.questTemplate)
    .orderBy(asc(schema.questTemplate.createdAt));
  return rows.map(toRow);
}

/**
 * Create a new template as a draft. Store-boundary validation (defense in
 * depth behind the action layer's parseInput — T12 review requirement):
 * @throws {z.ZodError} bad shape or a kind/params mismatch.
 * @throws {DuplicateTemplateSlugError} the slug is already in use.
 */
export async function createQuestTemplate(
  input: CreateQuestTemplateInput,
): Promise<{ id: string }> {
  const parsed = createQuestTemplateInputSchema.parse(input);
  validateTemplateInput(parsed.kind, parsed.params);

  const db = getDb();
  const existing = await db
    .select({ id: schema.questTemplate.id })
    .from(schema.questTemplate)
    .where(eq(schema.questTemplate.slug, parsed.slug))
    .limit(1);
  if (existing[0]) throw new DuplicateTemplateSlugError(parsed.slug);

  const id = globalThis.crypto.randomUUID();
  await db.insert(schema.questTemplate).values({
    id,
    slug: parsed.slug,
    title: parsed.title,
    kind: parsed.kind,
    params: parsed.params,
    rewardStars: parsed.rewardStars,
    status: "draft",
  });
  return { id };
}

/**
 * Edit a template in place — no version cloning (spec §2 deviation note).
 * Slug is immutable. Throws when the template doesn't exist (no silent no-op —
 * review finding). @throws {z.ZodError} bad shape or a kind/params mismatch.
 */
export async function updateQuestTemplate(
  id: string,
  input: UpdateQuestTemplateInput,
): Promise<void> {
  const parsed = updateQuestTemplateInputSchema.parse(input);
  validateTemplateInput(parsed.kind, parsed.params);

  const updated = await getDb()
    .update(schema.questTemplate)
    .set({
      title: parsed.title,
      kind: parsed.kind,
      params: parsed.params,
      rewardStars: parsed.rewardStars,
    })
    .where(eq(schema.questTemplate.id, id))
    .returning({ id: schema.questTemplate.id });
  if (updated.length === 0) throw new Error(`Quest template not found: ${id}`);
}

/**
 * Move a template along the draft→published→archived lifecycle. The write is
 * CONDITIONAL on the status the transition was validated against — 0 affected
 * rows means a concurrent write moved it first, so throw instead of applying
 * a now-unvalidated edge (compare-and-swap, mirroring publishVersion).
 * @throws {InvalidStatusTransitionError} for a disallowed (or raced) edge.
 */
export async function setQuestTemplateStatus(
  id: string,
  status: LifecycleStatus,
): Promise<void> {
  const parsedStatus = lifecycleStatusSchema.parse(status);
  const db = getDb();
  const rows = await db
    .select({ status: schema.questTemplate.status })
    .from(schema.questTemplate)
    .where(eq(schema.questTemplate.id, id))
    .limit(1);
  const current = rows[0];
  if (!current) throw new Error(`Quest template not found: ${id}`);
  if (!isValidStatusTransition(current.status as LifecycleStatus, parsedStatus)) {
    throw new InvalidStatusTransitionError(current.status, parsedStatus);
  }
  const updated = await db
    .update(schema.questTemplate)
    .set({ status: parsedStatus })
    .where(and(eq(schema.questTemplate.id, id), eq(schema.questTemplate.status, current.status)))
    .returning({ id: schema.questTemplate.id });
  if (updated.length === 0) throw new ConcurrentStatusChangeError();
}
