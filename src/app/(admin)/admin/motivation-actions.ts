"use server";

/**
 * Admin server actions for the Adventure 2.0 motivation taxonomies (stickers,
 * quests, interests) — mirrors src/app/(admin)/admin/actions.ts exactly:
 * every mutation runs behind withAdminAction (requireAdmin + mapError) with
 * parseInput at the boundary, and revalidates the page it edits. Reads are
 * direct server-component calls into the admin-stores (no action needed).
 *
 * NOTE: do NOT re-export types from this "use server" file — see the identical
 * warning in actions.ts (Next.js registers every export as a server reference;
 * a `export type { … }` re-export of an imported binding throws at runtime and
 * breaks every action in the module). Import types directly from the stores.
 */
import { revalidatePath } from "next/cache";
import { parseInput } from "@/lib/actions/results";
import { idParam, withAdminAction, type AdminErrorResult } from "@/lib/admin/action-helpers";
import { lifecycleStatusSchema } from "@/lib/admin/lifecycle";
import {
  createStickerPack,
  updateStickerPack,
  setStickerPackStatus,
  createSticker,
  updateSticker,
  createStickerPackInputSchema,
  updateStickerPackInputSchema,
  createStickerInputSchema,
  updateStickerInputSchema,
} from "@/lib/rewards/admin-store";
import {
  createQuestTemplate,
  updateQuestTemplate,
  setQuestTemplateStatus,
  createQuestTemplateInputSchema,
  updateQuestTemplateInputSchema,
} from "@/lib/quests/admin-store";
import {
  createInterest,
  updateInterest,
  setInterestStatus,
  createInterestInputSchema,
  updateInterestInputSchema,
} from "@/lib/interests/admin-store";

// ── Revalidation helpers ──────────────────────────────────────────────────────

function revalidateStickers(): void {
  revalidatePath("/admin/stickers");
}

function revalidateQuests(): void {
  revalidatePath("/admin/quests");
}

function revalidateInterests(): void {
  revalidatePath("/admin/interests");
}

// ── Stickers ──────────────────────────────────────────────────────────────────

export async function createStickerPackAction(
  input: unknown,
): Promise<{ ok: true; id: string } | AdminErrorResult> {
  return withAdminAction("createStickerPackAction", async () => {
    const parsed = parseInput(createStickerPackInputSchema, input, "Invalid sticker pack input.");
    if (!parsed.ok) return parsed;

    const result = await createStickerPack(parsed.data);
    revalidateStickers();
    return { ok: true, ...result };
  });
}

export async function updateStickerPackAction(
  packId: string,
  input: unknown,
): Promise<{ ok: true } | AdminErrorResult> {
  return withAdminAction("updateStickerPackAction", async () => {
    const id = idParam(packId, "Invalid pack id.");
    if (!id.ok) return id;

    const parsed = parseInput(updateStickerPackInputSchema, input, "Invalid sticker pack input.");
    if (!parsed.ok) return parsed;

    await updateStickerPack(id.value, parsed.data);
    revalidateStickers();
    return { ok: true };
  });
}

export async function setStickerPackStatusAction(
  packId: string,
  status: unknown,
): Promise<{ ok: true } | AdminErrorResult> {
  return withAdminAction("setStickerPackStatusAction", async () => {
    const id = idParam(packId, "Invalid pack id.");
    if (!id.ok) return id;

    const parsed = parseInput(lifecycleStatusSchema, status, "Invalid status.");
    if (!parsed.ok) return parsed;

    await setStickerPackStatus(id.value, parsed.data);
    revalidateStickers();
    return { ok: true };
  });
}

export async function createStickerAction(
  input: unknown,
): Promise<{ ok: true; id: string } | AdminErrorResult> {
  return withAdminAction("createStickerAction", async () => {
    const parsed = parseInput(createStickerInputSchema, input, "Invalid sticker input.");
    if (!parsed.ok) return parsed;

    const result = await createSticker(parsed.data);
    revalidateStickers();
    return { ok: true, ...result };
  });
}

export async function updateStickerAction(
  stickerId: string,
  input: unknown,
): Promise<{ ok: true } | AdminErrorResult> {
  return withAdminAction("updateStickerAction", async () => {
    const id = idParam(stickerId, "Invalid sticker id.");
    if (!id.ok) return id;

    const parsed = parseInput(updateStickerInputSchema, input, "Invalid sticker input.");
    if (!parsed.ok) return parsed;

    await updateSticker(id.value, parsed.data);
    revalidateStickers();
    return { ok: true };
  });
}

// ── Quests ────────────────────────────────────────────────────────────────────

export async function createQuestTemplateAction(
  input: unknown,
): Promise<{ ok: true; id: string } | AdminErrorResult> {
  return withAdminAction("createQuestTemplateAction", async () => {
    const parsed = parseInput(createQuestTemplateInputSchema, input, "Invalid quest template input.");
    if (!parsed.ok) return parsed;

    const result = await createQuestTemplate(parsed.data);
    revalidateQuests();
    return { ok: true, ...result };
  });
}

export async function updateQuestTemplateAction(
  templateId: string,
  input: unknown,
): Promise<{ ok: true } | AdminErrorResult> {
  return withAdminAction("updateQuestTemplateAction", async () => {
    const id = idParam(templateId, "Invalid template id.");
    if (!id.ok) return id;

    const parsed = parseInput(updateQuestTemplateInputSchema, input, "Invalid quest template input.");
    if (!parsed.ok) return parsed;

    await updateQuestTemplate(id.value, parsed.data);
    revalidateQuests();
    return { ok: true };
  });
}

export async function setQuestTemplateStatusAction(
  templateId: string,
  status: unknown,
): Promise<{ ok: true } | AdminErrorResult> {
  return withAdminAction("setQuestTemplateStatusAction", async () => {
    const id = idParam(templateId, "Invalid template id.");
    if (!id.ok) return id;

    const parsed = parseInput(lifecycleStatusSchema, status, "Invalid status.");
    if (!parsed.ok) return parsed;

    await setQuestTemplateStatus(id.value, parsed.data);
    revalidateQuests();
    return { ok: true };
  });
}

// ── Interests ─────────────────────────────────────────────────────────────────

export async function createInterestAction(
  input: unknown,
): Promise<{ ok: true; id: string } | AdminErrorResult> {
  return withAdminAction("createInterestAction", async () => {
    const parsed = parseInput(createInterestInputSchema, input, "Invalid interest input.");
    if (!parsed.ok) return parsed;

    const result = await createInterest(parsed.data);
    revalidateInterests();
    return { ok: true, ...result };
  });
}

export async function updateInterestAction(
  interestId: string,
  input: unknown,
): Promise<{ ok: true } | AdminErrorResult> {
  return withAdminAction("updateInterestAction", async () => {
    const id = idParam(interestId, "Invalid interest id.");
    if (!id.ok) return id;

    const parsed = parseInput(updateInterestInputSchema, input, "Invalid interest input.");
    if (!parsed.ok) return parsed;

    await updateInterest(id.value, parsed.data);
    revalidateInterests();
    return { ok: true };
  });
}

export async function setInterestStatusAction(
  interestId: string,
  status: unknown,
): Promise<{ ok: true } | AdminErrorResult> {
  return withAdminAction("setInterestStatusAction", async () => {
    const id = idParam(interestId, "Invalid interest id.");
    if (!id.ok) return id;

    const parsed = parseInput(lifecycleStatusSchema, status, "Invalid status.");
    if (!parsed.ok) return parsed;

    await setInterestStatus(id.value, parsed.data);
    revalidateInterests();
    return { ok: true };
  });
}
