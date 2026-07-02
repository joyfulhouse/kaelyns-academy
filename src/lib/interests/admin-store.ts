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

/** Thrown when a new interest's slug collides with an existing one. */
export class DuplicateInterestSlugError extends Error {
  constructor(slug: string) {
    super(`An interest with slug "${slug}" already exists`);
    this.name = "DuplicateInterestSlugError";
  }
}

const slugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens");

/**
 * Status defaults to "draft" (T12 review requirement: the DB column defaults
 * "published", but a bounded, AI-prompt-visible taxonomy must be safe-by-default
 * at the authoring boundary — the admin form also surfaces this as an explicit
 * choice rather than relying on the silent default alone).
 */
export const createInterestInputSchema = z.object({
  slug: slugSchema,
  label: z.string().min(1).max(80),
  icon: z.string().min(1).max(8).optional(),
  status: lifecycleStatusSchema.default("draft"),
});
export type CreateInterestInput = z.infer<typeof createInterestInputSchema>;

export const updateInterestInputSchema = createInterestInputSchema.omit({ slug: true, status: true });
export type UpdateInterestInput = z.infer<typeof updateInterestInputSchema>;

export interface AdminInterestRow {
  id: string;
  slug: string;
  label: string;
  icon: string | null;
  status: string;
}

function toRow(r: typeof schema.interest.$inferSelect): AdminInterestRow {
  return { id: r.id, slug: r.slug, label: r.label, icon: r.icon, status: r.status };
}

/** Every interest (any status), label order. */
export async function listInterests(): Promise<AdminInterestRow[]> {
  const rows = await getDb().select().from(schema.interest).orderBy(asc(schema.interest.label));
  return rows.map(toRow);
}

/** Create a new interest, defaulting to draft. @throws {z.ZodError} bad shape.
 *  @throws {DuplicateInterestSlugError} the slug is already in use. */
export async function createInterest(input: CreateInterestInput): Promise<{ id: string }> {
  const parsed = createInterestInputSchema.parse(input);

  const db = getDb();
  const existing = await db
    .select({ id: schema.interest.id })
    .from(schema.interest)
    .where(eq(schema.interest.slug, parsed.slug))
    .limit(1);
  if (existing[0]) throw new DuplicateInterestSlugError(parsed.slug);

  const id = globalThis.crypto.randomUUID();
  await db.insert(schema.interest).values({
    id,
    slug: parsed.slug,
    label: parsed.label,
    icon: parsed.icon ?? null,
    status: parsed.status,
  });
  return { id };
}

/** Edit an interest in place. Slug is immutable. Throws when the interest
 *  doesn't exist (no silent no-op — review finding).
 *  @throws {z.ZodError} bad shape. */
export async function updateInterest(id: string, input: UpdateInterestInput): Promise<void> {
  const parsed = updateInterestInputSchema.parse(input);
  const updated = await getDb()
    .update(schema.interest)
    .set({ label: parsed.label, icon: parsed.icon ?? null })
    .where(eq(schema.interest.id, id))
    .returning({ id: schema.interest.id });
  if (updated.length === 0) throw new Error(`Interest not found: ${id}`);
}

/** Move an interest along the draft→published→archived lifecycle. Only
 *  published interests reach the child picker / AI theming prompt (§8).
 *  The write is CONDITIONAL on the status the transition was validated
 *  against — 0 affected rows means a concurrent write moved it first, so
 *  throw instead of applying a now-unvalidated edge (compare-and-swap,
 *  mirroring publishVersion).
 *  @throws {InvalidStatusTransitionError} for a disallowed (or raced) edge. */
export async function setInterestStatus(id: string, status: LifecycleStatus): Promise<void> {
  const parsedStatus = lifecycleStatusSchema.parse(status);
  const db = getDb();
  const rows = await db
    .select({ status: schema.interest.status })
    .from(schema.interest)
    .where(eq(schema.interest.id, id))
    .limit(1);
  const current = rows[0];
  if (!current) throw new Error(`Interest not found: ${id}`);
  if (!isValidStatusTransition(current.status as LifecycleStatus, parsedStatus)) {
    throw new InvalidStatusTransitionError(current.status, parsedStatus);
  }
  const updated = await db
    .update(schema.interest)
    .set({ status: parsedStatus })
    .where(and(eq(schema.interest.id, id), eq(schema.interest.status, current.status)))
    .returning({ id: schema.interest.id });
  if (updated.length === 0) throw new ConcurrentStatusChangeError();
}
