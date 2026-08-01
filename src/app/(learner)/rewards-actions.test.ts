import { describe, expect, it, vi, beforeEach } from "vitest";
import { keyboardClub } from "@/content/programs/keyboard-club";
import type { CompletedActivity } from "@/lib/tutor/store";

// getDailyQuestsAction turns the recommender's output into the day's quest
// menu. The recommender reasons about the WHOLE program, so the action must
// narrow its output to what the learner may actually open before a "Try <unit>"
// quest is minted — otherwise a curated-out or sequence-locked unit becomes a
// quest she can tap but never finish (recordAttempt refuses the write), redrawn
// every single day. There is no live test DB here, so the stores are mocked and
// the assertion is on the drafts the action hands to assignDailyQuests.

vi.mock("@/lib/tenancy", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/tenancy")>()),
  withAccount: vi.fn(async (fn: (ctx: { accountId: string; userId: string }) => unknown) =>
    fn({ accountId: "acc-1", userId: "acc-1" }),
  ),
}));

vi.mock("@/lib/tutor/store", () => ({
  getEnrollmentForGate: vi.fn(),
  getSkillState: vi.fn(),
  getCompletedActivityIds: vi.fn(),
}));

vi.mock("@/lib/quests/store", () => ({
  getDailyQuests: vi.fn(async () => []),
  listPublishedQuestTemplates: vi.fn(),
  assignDailyQuests: vi.fn(async () => []),
  activateQuest: vi.fn(),
  skillLabel: vi.fn(async (slug: string) => slug),
}));

vi.mock("@/lib/content/repository", () => ({
  resolveAccountLearnerProgram: vi.fn(),
}));

vi.mock("@/lib/rewards/store", () => ({ getStarBalance: vi.fn() }));
vi.mock("@/lib/rewards/stickers", () => ({
  getStickerCatalog: vi.fn(),
  listOwnedStickerIds: vi.fn(),
  purchaseSticker: vi.fn(),
}));
vi.mock("@/lib/interests/store", () => ({
  getLearnerInterests: vi.fn(),
  setPickedInterests: vi.fn(),
}));

const { getEnrollmentForGate, getSkillState, getCompletedActivityIds } = await import(
  "@/lib/tutor/store"
);
const { assignDailyQuests, listPublishedQuestTemplates } = await import("@/lib/quests/store");
const { resolveAccountLearnerProgram } = await import("@/lib/content/repository");
const { getDailyQuestsAction } = await import("./rewards-actions");

/** The four Keyboard Club units before Word Workshop, in authored order. */
const THROUGH_BIG_LETTERS = ["home-base", "sky-row", "under-ground", "big-letters"];

/** Every activity in the named units, finished, with their skills solid. */
function after(unitIds: string[]) {
  const completed: CompletedActivity[] = [];
  const state: Record<string, { history: { day: string; outcome: "solid" }[] }> = {};
  for (const unit of keyboardClub.units.filter((u) => unitIds.includes(u.id))) {
    for (const lesson of unit.lessons) {
      for (const activity of lesson.activities) {
        completed.push({ activityId: activity.id, stars: 3 });
        for (const tag of activity.skillTags) {
          state[tag] = {
            history: [
              { day: "2026-07-30", outcome: "solid" },
              { day: "2026-07-31", outcome: "solid" },
            ],
          };
        }
      }
    }
  }
  return { completed, state };
}

const TEMPLATES = [
  {
    id: "tpl-try",
    slug: "try-strand",
    title: "Try {focus}",
    kind: "try_strand" as const,
    params: {},
    rewardStars: 3,
  },
];

describe("getDailyQuestsAction unit access", () => {
  beforeEach(() => {
    vi.mocked(listPublishedQuestTemplates).mockResolvedValue(TEMPLATES);
    vi.mocked(resolveAccountLearnerProgram).mockResolvedValue(keyboardClub);
    vi.mocked(assignDailyQuests).mockClear();
  });

  function gateWith(activeUnitKeys: string[] | undefined) {
    vi.mocked(getEnrollmentForGate).mockResolvedValue({
      status: "active",
      config: activeUnitKeys ? { activeUnitKeys } : {},
      configValid: true,
      programVersionId: null,
    });
  }

  /** The unitIds the action actually minted "Try <unit>" quests for. */
  async function questedUnitIds(activeUnitKeys: string[] | undefined) {
    const { completed, state } = after(THROUGH_BIG_LETTERS);
    gateWith(activeUnitKeys);
    vi.mocked(getSkillState).mockResolvedValue(state);
    vi.mocked(getCompletedActivityIds).mockResolvedValue(completed);
    await getDailyQuestsAction("learner-1", "keyboard-club");
    const drafts = vi.mocked(assignDailyQuests).mock.calls[0]?.[4] ?? [];
    return drafts.map((d) => d.target.unitId);
  }

  // With no curation, Word Workshop is both recommended and open — the fix must
  // not suppress a legitimate offer.
  it("still quests an uncurated program's next unit", async () => {
    expect(await questedUnitIds(undefined)).toEqual(["word-workshop"]);
  });

  // Curated to the first four units and all of them finished, the recommender
  // still surfaces Word Workshop — but she cannot open it, so no quest may
  // point there. The menu degrades to fewer quests rather than a broken one.
  it("mints no quest for a unit the learner cannot open", async () => {
    expect(await questedUnitIds(THROUGH_BIG_LETTERS)).toEqual([]);
  });
});
