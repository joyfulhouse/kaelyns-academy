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
  authoredQuestCandidates,
  questIsReachable,
  questReach,
  selectDailyQuests,
  type QuestReach,
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
import { resolveProgramForEnrollmentVersion } from "@/lib/content/repository";
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
 *
 * KNOWN NARROWER THAN THE CLIENT, deliberately. `StudioHome`'s `questCandidates`
 * is ranked authored + UNSPENT GENERATED SHELF + remaining authored, while this
 * reads authored only. A quest whose sole destination is a generated practice
 * item is therefore dropped here and refused by activation even though the UI
 * could route it — a false drop, and the wrong direction of wrong. It needs
 * assembly to have dropped a lesson's authored activities while its shelf rows
 * survive (a content-integrity failure), and it resolves itself the moment the
 * content is fixed. Accepted over reading the shelf on every quest fetch: that
 * costs a query on a path the learner home hits on mount and on every window
 * focus, and would fork the client's shelf-curation rules into a second place
 * to drift. Revisit if generated items ever become a primary quest destination.
 */
async function resolveQuestAccess(
  accountId: string,
  learnerId: string,
  programSlug: string,
  gate: { config: { activeUnitKeys?: string[] }; programVersionId: string | null },
): Promise<{
  program: Program;
  completedIds: Set<string>;
  reach: QuestReach;
} | null> {
  // Resolve from the version pin the GATE already read rather than re-reading
  // the enrollment: one query fewer on a path the learner home hits on mount
  // and on every window focus, and the tree can no longer disagree with the
  // authorization decision made two lines earlier if a repin lands between them
  // (`actions.ts` uses this same seam for exactly that reason).
  const [program, completed] = await Promise.all([
    resolveProgramForEnrollmentVersion(programSlug, gate.programVersionId),
    getCompletedActivityIds(accountId, learnerId),
  ]);
  if (!program) return null;
  const completedIds = new Set(completed.map((c) => c.activityId));
  const playable = playableUnitIds(
    program.units,
    activeUnitKeySet(gate.config.activeUnitKeys),
    completedIds,
    { sequential: isSequentialProgram(programSlug) },
  );
  return { program, completedIds, reach: questReach(authoredQuestCandidates(program, playable)) };
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

      // Independent reads: the day's menu does not depend on the access sets.
      // Settled rather than all, so a failure to resolve access degrades to
      // "no access evidence" instead of taking the whole menu down with it.
      const [accessResult, existing] = await Promise.all([
        resolveQuestAccess(accountId, learnerId, programSlug, gate).catch((error) => {
          captureNonCritical("quest access resolution failed", error);
          return null;
        }),
        getDailyQuests(accountId, learnerId, programSlug, day),
      ]);

      // Access is re-derived on every read, not just at generation. A parent can
      // narrow the assignment after the day's menu is drawn, and a quest that
      // pointed into what she can no longer open would otherwise sit there all
      // day: untappable to any purpose, since `recordAttempt` refuses the write.
      // A finished quest always stays — she earned those stars, and hiding them
      // would read as the reward being taken back.
      if (existing.length > 0) {
        // Without access evidence only a FINISHED quest is safe to show. Her
        // stars are already banked, so hiding those rows would read as the
        // reward being taken back — but an offered/active row whose
        // reachability is simply unknown would render a Start button that
        // activation then refuses, forever. Done-only is the honest middle.
        if (!accessResult) return existing.filter((quest) => quest.status === "done");
        return existing.filter(
          (quest) => quest.status === "done" || questIsReachable(quest, accessResult.reach),
        );
      }
      if (!accessResult) return [];
      const { program, completedIds, reach } = accessResult;

      const [state, templates] = await Promise.all([
        getSkillState(accountId, learnerId),
        listPublishedQuestTemplates(),
      ]);
      // `nextBest` reasons about the whole program; quests must only ever point
      // at a unit she can actually open. Otherwise a curated-out or
      // sequence-locked unit becomes a "Try …" quest she can never finish,
      // quietly burning a slot every day.
      const recs = nextBest(program, state, completedIds)
        .filter((r) => reach.units.has(r.unit.id))
        .map((r) => ({ unitId: r.unit.id, unitTitle: r.unit.title }));
      // Same rule for the skill-shaped quests. A skill only goes "emerging" by
      // being attempted, so a strand she practiced and a parent later curated
      // away still reads emerging — and `questActivityHref` would find no
      // playable activity teaching it, leaving another dead row.
      const emerging = [...reach.skills].filter((s) => outcomeOf(state, s) === "emerging");
      // `complete_n` carries no unit and no skill, so nothing upstream of here
      // constrains it: `selectDailyQuests` mints "Finish 2 things" from the
      // template alone, even for a program with no playable destination at all.
      // Minting one would persist a row the very next read has to delete, and
      // with no href the child cannot even tap it into the refusal path.
      const drafts = selectDailyQuests(templates, recs, emerging).filter((draft) =>
        questIsReachable(draft, reach),
      );
      // Friendly label for the practice_skill title (the pure layer used the slug).
      for (const d of drafts) {
        if (d.kind === "practice_skill" && d.target.skill) {
          d.title = d.title.replace(d.target.skill, await skillLabel(d.target.skill));
        }
      }
      // The insert re-reads the whole day, so a racing generator's rows arrive
      // here too — hold them to the same bar rather than trusting our drafts.
      const assigned = await assignDailyQuests(accountId, learnerId, programSlug, day, drafts);
      return assigned.filter((quest) => questIsReachable(quest, reach));
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
      const [menu, access] = await Promise.all([
        getDailyQuests(accountId, learnerId, programSlug, day),
        resolveQuestAccess(accountId, learnerId, programSlug, gate),
      ]);
      const quest = menu.find((q) => q.id === questId);
      if (!quest || !access || !questIsReachable(quest, access.reach)) {
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
