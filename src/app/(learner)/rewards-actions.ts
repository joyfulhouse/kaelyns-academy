"use server";

import { z } from "zod";
import { captureNonCritical } from "@/lib/capture";
import { UnauthenticatedError, withAccount } from "@/lib/tenancy";
import { getStarBalance } from "@/lib/rewards/store";
import {
  getStickerCatalog,
  listOwnedStickerIds,
  purchaseSticker,
  type CatalogPack,
  type PurchaseResult,
} from "@/lib/rewards/stickers";
import {
  activateQuest,
  assignDailyQuests,
  getDailyQuests,
  listPublishedQuestTemplates,
  skillLabel,
  type QuestView,
} from "@/lib/quests/store";
import { selectDailyQuests } from "@/lib/quests/logic";
import {
  getLearnerInterests,
  setPickedInterests,
  type InterestView,
} from "@/lib/interests/store";
import { outcomeOf } from "@/lib/tutor/mastery";
import { nextBest } from "@/lib/tutor/recommend";
import {
  getCompletedActivityIds,
  getEnrollmentForGate,
  getSkillState,
} from "@/lib/tutor/store";
import { resolveAccountLearnerProgram } from "@/lib/content/repository";
import { skillTagsForProgram } from "@/content";

/**
 * Learner rewards/quests actions. Same posture as (learner)/actions.ts:
 * lazy per-request session resolution, calm empty results on unauth/failure,
 * NEVER throw to the client. Account-only (guest mode has no economy).
 */

const idSchema = z.string().min(1);
/** Bounded interest-id array: same shape as the parent-side offered-set cap
 *  (store.ts slices to 30) — defense-in-depth before validatePicks' own
 *  max-5 subset check runs. */
const interestIdsSchema = z.array(z.string().min(1)).max(30);

export interface RewardsState {
  signedIn: boolean;
  balance: number;
  catalog: CatalogPack[];
  ownedStickerIds: string[];
}

const EMPTY_REWARDS: RewardsState = { signedIn: false, balance: 0, catalog: [], ownedStickerIds: [] };

export async function getRewardsStateAction(learnerId: string): Promise<RewardsState> {
  if (!idSchema.safeParse(learnerId).success) return EMPTY_REWARDS;
  try {
    return await withAccount(async ({ accountId }) => {
      const [balance, catalog, ownedStickerIds] = await Promise.all([
        getStarBalance(accountId, learnerId),
        getStickerCatalog(),
        listOwnedStickerIds(accountId, learnerId),
      ]);
      return { signedIn: true, balance, catalog, ownedStickerIds };
    });
  } catch (error) {
    if (!(error instanceof UnauthenticatedError)) {
      captureNonCritical("getRewardsStateAction failed", error);
    }
    return EMPTY_REWARDS;
  }
}

export async function purchaseStickerAction(
  learnerId: string,
  stickerId: string,
): Promise<PurchaseResult> {
  if (!idSchema.safeParse(learnerId).success || !idSchema.safeParse(stickerId).success) {
    return { ok: false, reason: "not_found" };
  }
  try {
    return await withAccount(({ accountId }) => purchaseSticker(accountId, learnerId, stickerId));
  } catch (error) {
    if (!(error instanceof UnauthenticatedError)) {
      captureNonCritical("purchaseStickerAction failed", error);
    }
    return { ok: false, reason: "error" };
  }
}

/** Server day (YYYY-MM-DD) — the same clock recordAttemptAction stamps. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Today's quest menu, generating it on first read (idempotent under races via
 * the day+template unique index). Requires an ACTIVE enrollment — same gate as
 * play itself; a paused/removed program offers no quests.
 */
export async function getDailyQuestsAction(
  learnerId: string,
  programSlug: string,
): Promise<QuestView[]> {
  if (!idSchema.safeParse(learnerId).success || !idSchema.safeParse(programSlug).success) return [];
  try {
    return await withAccount(async ({ accountId }) => {
      const gate = await getEnrollmentForGate(accountId, learnerId, programSlug);
      if (gate?.status !== "active") return [];
      const day = today();

      const existing = await getDailyQuests(accountId, learnerId, programSlug, day);
      if (existing.length > 0) return existing;

      const program = await resolveAccountLearnerProgram(accountId, learnerId, programSlug);
      if (!program) return [];
      const [state, completed, templates] = await Promise.all([
        getSkillState(accountId, learnerId),
        getCompletedActivityIds(accountId, learnerId),
        listPublishedQuestTemplates(),
      ]);
      const recs = nextBest(program, state, new Set(completed.map((c) => c.activityId))).map((r) => ({
        unitId: r.unit.id,
        unitTitle: r.unit.title,
      }));
      const emerging = [...skillTagsForProgram(program)].filter(
        (s) => outcomeOf(state, s) === "emerging",
      );
      const drafts = selectDailyQuests(templates, recs, emerging);
      // Friendly label for the practice_skill title (the pure layer used the slug).
      for (const d of drafts) {
        if (d.kind === "practice_skill" && d.target.skill) {
          d.title = d.title.replace(d.target.skill, await skillLabel(d.target.skill));
        }
      }
      return assignDailyQuests(accountId, learnerId, programSlug, day, drafts);
    });
  } catch (error) {
    if (!(error instanceof UnauthenticatedError)) {
      captureNonCritical("getDailyQuestsAction failed", error);
    }
    return [];
  }
}

export async function activateQuestAction(
  learnerId: string,
  questId: string,
): Promise<{ ok: boolean }> {
  if (!idSchema.safeParse(learnerId).success || !idSchema.safeParse(questId).success) {
    return { ok: false };
  }
  try {
    return await withAccount(async ({ accountId }) => ({
      ok: await activateQuest(accountId, learnerId, questId, today()),
    }));
  } catch (error) {
    if (!(error instanceof UnauthenticatedError)) {
      captureNonCritical("activateQuestAction failed", error);
    }
    return { ok: false };
  }
}

/* ── Interests (spec §4.3): child-facing read + write of the picker board ── */

export interface InterestsState {
  offered: InterestView[];
  picked: InterestView[];
}

const EMPTY_INTERESTS: InterestsState = { offered: [], picked: [] };

/** The picker board: what the parent OFFERED and what the child has PICKED. */
export async function getInterestsAction(learnerId: string): Promise<InterestsState> {
  if (!idSchema.safeParse(learnerId).success) return EMPTY_INTERESTS;
  try {
    return await withAccount(({ accountId }) => getLearnerInterests(accountId, learnerId));
  } catch (error) {
    if (!(error instanceof UnauthenticatedError)) {
      captureNonCritical("getInterestsAction failed", error);
    }
    return EMPTY_INTERESTS;
  }
}

/**
 * Save the child's picks. Server-authoritative (§8): `setPickedInterests`
 * re-validates the submitted ids ⊆ the parent-offered set, max 5, so a
 * tampered client request can never smuggle an unoffered interest in.
 */
export async function setPickedInterestsAction(
  learnerId: string,
  interestIds: string[],
): Promise<{ ok: boolean }> {
  if (!idSchema.safeParse(learnerId).success || !interestIdsSchema.safeParse(interestIds).success) {
    return { ok: false };
  }
  try {
    return await withAccount(async ({ accountId }) => ({
      ok: await setPickedInterests(accountId, learnerId, interestIds),
    }));
  } catch (error) {
    if (!(error instanceof UnauthenticatedError)) {
      captureNonCritical("setPickedInterestsAction failed", error);
    }
    return { ok: false };
  }
}
