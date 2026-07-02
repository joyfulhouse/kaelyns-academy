// server-only: opens DB connections; import from server actions / route handlers only.
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { learner, learnerSticker, sticker, stickerPack, starLedger } from "@/lib/db/schema";
import { withOwnedLearner } from "@/lib/tutor/scope";
import { sumLedger } from "./logic";

export interface CatalogSticker {
  id: string;
  slug: string;
  title: string;
  artRef: string;
  starCost: number;
}

export interface CatalogPack {
  id: string;
  slug: string;
  title: string;
  theme: string | null;
  stickers: CatalogSticker[];
}

/** Published packs + their stickers (the child-facing catalog). Global, not
 *  account-scoped — same posture as the program catalog. */
export async function getStickerCatalog(): Promise<CatalogPack[]> {
  const rows = await getDb()
    .select({
      packId: stickerPack.id,
      packSlug: stickerPack.slug,
      packTitle: stickerPack.title,
      theme: stickerPack.theme,
      packSort: stickerPack.sortKey,
      id: sticker.id,
      slug: sticker.slug,
      title: sticker.title,
      artRef: sticker.artRef,
      starCost: sticker.starCost,
      sort: sticker.sortKey,
    })
    .from(stickerPack)
    .innerJoin(sticker, eq(sticker.packId, stickerPack.id))
    .where(eq(stickerPack.status, "published"))
    .orderBy(asc(stickerPack.sortKey), asc(sticker.sortKey));

  const packs = new Map<string, CatalogPack>();
  for (const r of rows) {
    let pack = packs.get(r.packId);
    if (!pack) {
      pack = { id: r.packId, slug: r.packSlug, title: r.packTitle, theme: r.theme, stickers: [] };
      packs.set(r.packId, pack);
    }
    pack.stickers.push({ id: r.id, slug: r.slug, title: r.title, artRef: r.artRef, starCost: r.starCost });
  }
  return [...packs.values()];
}

export async function listOwnedStickerIds(accountId: string, learnerId: string): Promise<string[]> {
  return withOwnedLearner<string[]>(
    accountId,
    learnerId,
    async () => {
      const rows = await getDb()
        .select({ stickerId: learnerSticker.stickerId })
        .from(learnerSticker)
        .where(eq(learnerSticker.learnerId, learnerId));
      return rows.map((r) => r.stickerId);
    },
    [],
  );
}

export type PurchaseResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "already_owned" | "insufficient" | "error" };

/**
 * Atomic spend+grant (spec §3.1): one transaction that (1) locks the learner
 * row FOR UPDATE — the ownership check AND the serialization point, so two
 * concurrent purchases for the same learner can't both pass the balance check —
 * then (2) validates the sticker is purchasable, (3) sums the ledger, and
 * (4) writes the spend + the grant together. Balance can never go negative.
 */
export async function purchaseSticker(
  accountId: string,
  learnerId: string,
  stickerId: string,
): Promise<PurchaseResult> {
  return getDb().transaction(async (tx) => {
    const owned = await tx
      .select({ id: learner.id })
      .from(learner)
      .where(and(eq(learner.id, learnerId), eq(learner.accountId, accountId)))
      .limit(1)
      .for("update");
    if (!owned[0]) return { ok: false, reason: "not_found" as const };

    const stickerRows = await tx
      .select({ id: sticker.id, starCost: sticker.starCost, packStatus: stickerPack.status })
      .from(sticker)
      .innerJoin(stickerPack, eq(sticker.packId, stickerPack.id))
      .where(eq(sticker.id, stickerId))
      .limit(1);
    const target = stickerRows[0];
    if (!target || target.packStatus !== "published") {
      return { ok: false, reason: "not_found" as const };
    }

    const already = await tx
      .select({ id: learnerSticker.id })
      .from(learnerSticker)
      .where(and(eq(learnerSticker.learnerId, learnerId), eq(learnerSticker.stickerId, stickerId)))
      .limit(1);
    if (already[0]) return { ok: false, reason: "already_owned" as const };

    const ledgerRows = await tx
      .select({ delta: starLedger.delta })
      .from(starLedger)
      .where(eq(starLedger.learnerId, learnerId));
    const balance = sumLedger(ledgerRows.map((r) => r.delta));
    if (balance < target.starCost) return { ok: false, reason: "insufficient" as const };

    await tx.insert(starLedger).values({
      learnerId,
      delta: -target.starCost,
      reason: "sticker_purchase",
      refId: stickerId,
    });
    await tx.insert(learnerSticker).values({ learnerId, stickerId });
    return { ok: true as const };
  });
}
