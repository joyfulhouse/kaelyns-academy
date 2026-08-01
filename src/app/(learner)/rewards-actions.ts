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
import {
  questIsReachable,
  selectDailyQuests,
  skillsInPlayableUnits,
} from "@/lib/quests/logic";
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
import {
  activeUnitKeySet,
  isSequentialProgram,
  playableUnitIds,
} from "@/components/learner/unitAccess";
import { resolveAccountLearnerProgram } from "@/lib/content/repository";
import type { Program } from "@/content";

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
 * The learner's resolved program plus the unit/skill sets a quest may point at.
 *
 * One derivation shared by generation and by every later read, so a quest can
 * never be minted into — or left sitting in — territory the world map hides and
 * the activity route refuses. `playableUnitIds` is the same function backing
 * both of those surfaces.
 */
async function resolveQuestAccess(
  accountId: string,
  learnerId: string,
  programSlug: string,
  gate: { config: { activeUnitKeys?: string[] } },
): Promise<{
  program: Program;
  completedIds: Set<string>;
  playable: ReadonlySet<string>;
  playableSkills: ReadonlySet<string>;
} | null> {
  const program = await resolveAccountLearnerProgram(accountId, learnerId, programSlug);
  if (!program) return null;
  const completed = await getCompletedActivityIds(accountId, learnerId);
  const completedIds = new Set(completed.map((c) => c.activityId));
  const playable = playableUnitIds(
    program.units,
    activeUnitKeySet(gate.config.activeUnitKeys),
    completedIds,
    { sequential: isSequentialProgram(programSlug) },
  );
  return { program, completedIds, playable, playableSkills: skillsInPlayableUnits(program, playable) };
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
      if (gate?.status !== "active" || !gate.configValid) return [];
      const day = today();

      const access = await resolveQuestAccess(accountId, learnerId, programSlug, gate);
      if (!access) return [];
      const { program, completedIds, playable, playableSkills } = access;

      // Access is re-derived on every read, not just at generation. A parent can
      // narrow the assignment after the day's menu is drawn, and a quest that
      // pointed into what she can no longer open would otherwise sit there all
      // day: untappable to any purpose, since `recordAttempt` refuses the write.
      // A finished quest always stays — she earned those stars, and hiding them
      // would read as the reward being taken back.
      const existing = await getDailyQuests(accountId, learnerId, programSlug, day);
      if (existing.length > 0) {
        return existing.filter(
          (quest) =>
            quest.status === "done" || questIsReachable(quest, playable, playableSkills),
        );
      }

      const [state, templates] = await Promise.all([
        getSkillState(accountId, learnerId),
        listPublishedQuestTemplates(),
      ]);
      // `nextBest` reasons about the whole program; quests must only ever point
      // at a unit she can actually open. Otherwise a curated-out or
      // sequence-locked unit becomes a "Try …" quest she can never finish,
      // quietly burning a slot every day.
      const recs = nextBest(program, state, completedIds)
        .filter((r) => playable.has(r.unit.id))
        .map((r) => ({ unitId: r.unit.id, unitTitle: r.unit.title }));
      // Same rule for the skill-shaped quests. A skill only goes "emerging" by
      // being attempted, so a strand she practiced and a parent later curated
      // away still reads emerging — and `questActivityHref` would find no
      // playable activity teaching it, leaving another dead row.
      const emerging = [...playableSkills].filter((s) => outcomeOf(state, s) === "emerging");
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

/**
 * Promote a quest to "active". Refuses one the learner can no longer reach.
 *
 * Dropping the row on read is not enough on its own: `activateQuest` demotes
 * whichever quest is currently active before promoting its target, so a stale
 * client holding a since-hidden quest could knock her off the one she is
 * actually working on, in exchange for one that can never progress.
 */
export async function activateQuestAction(
  learnerId: string,
  programSlug: string,
  questId: string,
): Promise<{ ok: boolean }> {
  if (
    !idSchema.safeParse(learnerId).success ||
    !idSchema.safeParse(programSlug).success ||
    !idSchema.safeParse(questId).success
  ) {
    return { ok: false };
  }
  try {
    return await withAccount(async ({ accountId }) => {
      const gate = await getEnrollmentForGate(accountId, learnerId, programSlug);
      if (gate?.status !== "active" || !gate.configValid) return { ok: false };
      const day = today();
      const quest = (await getDailyQuests(accountId, learnerId, programSlug, day)).find(
        (q) => q.id === questId,
      );
      if (!quest) return { ok: false };
      const access = await resolveQuestAccess(accountId, learnerId, programSlug, gate);
      if (!access || !questIsReachable(quest, access.playable, access.playableSkills)) {
        return { ok: false };
      }
      return { ok: await activateQuest(accountId, learnerId, questId, day) };
    });
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
