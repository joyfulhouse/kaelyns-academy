// server-only: opens DB connections; import from server actions / route handlers only.
import { asc, eq, and } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import {
  isValidStatusTransition,
  lifecycleStatusSchema,
  ConcurrentStatusChangeError,
  InvalidStatusTransitionError,
  type LifecycleStatus,
} from "@/lib/admin/lifecycle";

/** Thrown when a new sticker pack's slug collides with an existing one. */
export class DuplicatePackSlugError extends Error {
  constructor(slug: string) {
    super(`A sticker pack with slug "${slug}" already exists`);
    this.name = "DuplicatePackSlugError";
  }
}

/** Thrown when a new sticker's slug collides with a sibling in the same pack
 *  (the `sticker_pack_slug_uq` index is scoped to (packId, slug)). */
export class DuplicateStickerSlugError extends Error {
  constructor(slug: string) {
    super(`A sticker with slug "${slug}" already exists in this pack`);
    this.name = "DuplicateStickerSlugError";
  }
}

const ART_REF_PATTERN = /^emoji:.{1,8}$/;
const artRefSchema = z
  .string()
  .regex(ART_REF_PATTERN, 'artRef must look like "emoji:🦊" (1–8 characters after the colon).');

/**
 * PURE. Validate a sticker's v1 `artRef` format ("emoji:<1-8 chars>" — future
 * versions may add "asset:/…"). @throws {z.ZodError} when the format doesn't
 * match (T3/T12 review requirement: there is no DB constraint for this).
 */
export function validateArtRef(artRef: string): void {
  artRefSchema.parse(artRef);
}

const slugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens");

// ── Sticker pack ─────────────────────────────────────────────────────────────

export const createStickerPackInputSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1).max(120),
  theme: z.string().max(120).optional(),
  sortKey: z.string().min(1).max(20).optional(),
});
export type CreateStickerPackInput = z.infer<typeof createStickerPackInputSchema>;

export const updateStickerPackInputSchema = createStickerPackInputSchema.omit({ slug: true });
export type UpdateStickerPackInput = z.infer<typeof updateStickerPackInputSchema>;

export interface AdminStickerRow {
  id: string;
  packId: string;
  slug: string;
  title: string;
  artRef: string;
  starCost: number;
  sortKey: string;
}

export interface AdminStickerPackRow {
  id: string;
  slug: string;
  title: string;
  theme: string | null;
  status: string;
  sortKey: string;
  stickers: AdminStickerRow[];
}

/** Every pack (any status) with its stickers, authoring sort order. */
export async function listStickerPacks(): Promise<AdminStickerPackRow[]> {
  const db = getDb();
  const [packRows, stickerRows] = await Promise.all([
    db.select().from(schema.stickerPack).orderBy(asc(schema.stickerPack.sortKey)),
    db.select().from(schema.sticker).orderBy(asc(schema.sticker.sortKey)),
  ]);

  const byPack = new Map<string, AdminStickerRow[]>();
  for (const s of stickerRows) {
    const list = byPack.get(s.packId) ?? [];
    list.push({
      id: s.id,
      packId: s.packId,
      slug: s.slug,
      title: s.title,
      artRef: s.artRef,
      starCost: s.starCost,
      sortKey: s.sortKey,
    });
    byPack.set(s.packId, list);
  }

  return packRows.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    theme: p.theme,
    status: p.status,
    sortKey: p.sortKey,
    stickers: byPack.get(p.id) ?? [],
  }));
}

/** Create a new pack as a draft. @throws {z.ZodError} bad shape.
 *  @throws {DuplicatePackSlugError} the slug is already in use. */
export async function createStickerPack(
  input: CreateStickerPackInput,
): Promise<{ id: string }> {
  const parsed = createStickerPackInputSchema.parse(input);

  const db = getDb();
  const existing = await db
    .select({ id: schema.stickerPack.id })
    .from(schema.stickerPack)
    .where(eq(schema.stickerPack.slug, parsed.slug))
    .limit(1);
  if (existing[0]) throw new DuplicatePackSlugError(parsed.slug);

  const id = globalThis.crypto.randomUUID();
  await db.insert(schema.stickerPack).values({
    id,
    slug: parsed.slug,
    title: parsed.title,
    theme: parsed.theme ?? null,
    status: "draft",
    ...(parsed.sortKey ? { sortKey: parsed.sortKey } : {}),
  });
  return { id };
}

/** Edit a pack in place — no version cloning. Slug is immutable. Throws when
 *  the pack doesn't exist (a bare UPDATE would silently no-op and report
 *  success — review finding). @throws {z.ZodError} bad shape. */
export async function updateStickerPack(id: string, input: UpdateStickerPackInput): Promise<void> {
  const parsed = updateStickerPackInputSchema.parse(input);
  const updated = await getDb()
    .update(schema.stickerPack)
    .set({
      title: parsed.title,
      theme: parsed.theme ?? null,
      ...(parsed.sortKey ? { sortKey: parsed.sortKey } : {}),
    })
    .where(eq(schema.stickerPack.id, id))
    .returning({ id: schema.stickerPack.id });
  if (updated.length === 0) throw new Error(`Sticker pack not found: ${id}`);
}

/** Move a pack along the draft→published→archived lifecycle. The write is
 *  CONDITIONAL on the status the transition was validated against — 0 affected
 *  rows means a concurrent write moved it first, so throw instead of applying
 *  a now-unvalidated edge (same compare-and-swap shape as publishVersion's
 *  in-tx conditional update).
 *  @throws {InvalidStatusTransitionError} for a disallowed (or raced) edge. */
export async function setStickerPackStatus(id: string, status: LifecycleStatus): Promise<void> {
  const parsedStatus = lifecycleStatusSchema.parse(status);
  const db = getDb();
  const rows = await db
    .select({ status: schema.stickerPack.status })
    .from(schema.stickerPack)
    .where(eq(schema.stickerPack.id, id))
    .limit(1);
  const current = rows[0];
  if (!current) throw new Error(`Sticker pack not found: ${id}`);
  if (!isValidStatusTransition(current.status as LifecycleStatus, parsedStatus)) {
    throw new InvalidStatusTransitionError(current.status, parsedStatus);
  }
  const updated = await db
    .update(schema.stickerPack)
    .set({ status: parsedStatus })
    .where(and(eq(schema.stickerPack.id, id), eq(schema.stickerPack.status, current.status)))
    .returning({ id: schema.stickerPack.id });
  if (updated.length === 0) throw new ConcurrentStatusChangeError();
}

// ── Sticker ──────────────────────────────────────────────────────────────────

export const createStickerInputSchema = z.object({
  packId: z.string().min(1),
  slug: slugSchema,
  title: z.string().min(1).max(120),
  artRef: artRefSchema,
  starCost: z.number().int().min(1).max(100),
  sortKey: z.string().min(1).max(20).optional(),
});
export type CreateStickerInput = z.infer<typeof createStickerInputSchema>;

export const updateStickerInputSchema = createStickerInputSchema.omit({ packId: true, slug: true });
export type UpdateStickerInput = z.infer<typeof updateStickerInputSchema>;

/**
 * Add a sticker to a pack. Store-boundary validation (defense in depth behind
 * the action layer's parseInput — T3/T12 review requirement: starCost > 0
 * with a sensible cap, and a v1-format artRef; neither is DB-constrained).
 * @throws {z.ZodError} bad shape, out-of-range starCost, or a malformed artRef.
 * @throws {DuplicateStickerSlugError} the slug is already used in this pack.
 */
export async function createSticker(input: CreateStickerInput): Promise<{ id: string }> {
  const parsed = createStickerInputSchema.parse(input);

  const db = getDb();
  const existing = await db
    .select({ id: schema.sticker.id })
    .from(schema.sticker)
    .where(and(eq(schema.sticker.packId, parsed.packId), eq(schema.sticker.slug, parsed.slug)))
    .limit(1);
  if (existing[0]) throw new DuplicateStickerSlugError(parsed.slug);

  const id = globalThis.crypto.randomUUID();
  await db.insert(schema.sticker).values({
    id,
    packId: parsed.packId,
    slug: parsed.slug,
    title: parsed.title,
    artRef: parsed.artRef,
    starCost: parsed.starCost,
    ...(parsed.sortKey ? { sortKey: parsed.sortKey } : {}),
  });
  return { id };
}

/** Edit a sticker in place. packId/slug are immutable. Throws when the
 *  sticker doesn't exist (no silent no-op — review finding).
 *  @throws {z.ZodError} out-of-range starCost or a malformed artRef. */
export async function updateSticker(id: string, input: UpdateStickerInput): Promise<void> {
  const parsed = updateStickerInputSchema.parse(input);
  const updated = await getDb()
    .update(schema.sticker)
    .set({
      title: parsed.title,
      artRef: parsed.artRef,
      starCost: parsed.starCost,
      ...(parsed.sortKey ? { sortKey: parsed.sortKey } : {}),
    })
    .where(eq(schema.sticker.id, id))
    .returning({ id: schema.sticker.id });
  if (updated.length === 0) throw new Error(`Sticker not found: ${id}`);
}
