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
  activateQuest: vi.fn(async () => true),
  skillLabel: vi.fn(async (slug: string) => slug),
}));

vi.mock("@/lib/content/repository", () => ({
  resolveProgramForEnrollmentVersion: vi.fn(),
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
const { assignDailyQuests, listPublishedQuestTemplates, getDailyQuests, activateQuest } =
  await import("@/lib/quests/store");
const { resolveProgramForEnrollmentVersion } = await import("@/lib/content/repository");
const { getDailyQuestsAction, activateQuestAction } = await import("./rewards-actions");

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
  {
    id: "tpl-practice",
    slug: "practice-skill",
    title: "Practice {focus}",
    kind: "practice_skill" as const,
    params: {},
    rewardStars: 2,
  },
];

describe("getDailyQuestsAction unit access", () => {
  beforeEach(() => {
    vi.mocked(listPublishedQuestTemplates).mockResolvedValue(TEMPLATES);
    vi.mocked(resolveProgramForEnrollmentVersion).mockResolvedValue(keyboardClub);
    vi.mocked(assignDailyQuests).mockClear();
    vi.mocked(activateQuest).mockClear();
    vi.mocked(getDailyQuests).mockResolvedValue([]);
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

  // A quest is drawn once per day, but a parent can narrow the assignment
  // afterwards. The row is DROPPED rather than replaced — the day just offers
  // fewer quests — because it points into a unit the map now hides and the
  // write path would refuse. It is not deleted, so re-widening brings it back.
  describe("a quest that access has moved out from under", () => {
    /** A day's menu already on disk, drawn before the parent narrowed access. */
    beforeEach(() => {
      vi.mocked(getDailyQuests).mockResolvedValue([
        { id: "q-try", title: "Try Word Workshop", kind: "try_strand",
          target: { count: 1, unitId: "word-workshop" }, progress: { done: 0 },
          rewardStars: 3, status: "offered" },
        { id: "q-skill", title: "Practice top row", kind: "practice_skill",
          target: { count: 2, skill: "typing.keys.top-row" }, progress: { done: 0 },
          rewardStars: 2, status: "offered" },
        { id: "q-any", title: "Finish 2 things", kind: "complete_n",
          target: { count: 2 }, progress: { done: 0 }, rewardStars: 2, status: "offered" },
      ]);
      const { completed, state } = after(THROUGH_BIG_LETTERS);
      vi.mocked(getSkillState).mockResolvedValue(state);
      vi.mocked(getCompletedActivityIds).mockResolvedValue(completed);
    });

    it("disappears from the menu, leaving the reachable ones", async () => {
      gateWith(THROUGH_BIG_LETTERS); // Word Workshop curated away after the draw
      const quests = await getDailyQuestsAction("learner-1", "keyboard-club");
      // Only the Word Workshop row goes: the top-row skill is still taught by
      // Sky Row, which is curated in, so each kind is judged on its own target.
      expect(quests.map((q) => q.id)).toEqual(["q-skill", "q-any"]);
      // Dropped, never regenerated — the menu is short for the rest of the day.
      expect(vi.mocked(assignDailyQuests)).not.toHaveBeenCalled();
    });

    it("stays while she can still reach it", async () => {
      gateWith(undefined);
      const quests = await getDailyQuestsAction("learner-1", "keyboard-club");
      expect(quests.map((q) => q.id)).toEqual(["q-try", "q-skill", "q-any"]);
    });

    // The skill-shaped half of the guard. "typing.keys.top-row" is taught only
    // by Sky Row, so curating down to Home Base strands the quest exactly as a
    // unit-shaped one: questActivityHref finds no playable activity for it.
    it("drops a practice quest whose skill is no longer taught anywhere she can go", async () => {
      gateWith(["home-base"]);
      const quests = await getDailyQuestsAction("learner-1", "keyboard-club");
      expect(quests.map((q) => q.id)).not.toContain("q-skill");
      expect(quests.map((q) => q.id)).toContain("q-any");
    });

    // A pinned version that fails closed leaves us unable to judge reachability
    // at all. Filtering exists to drop a dead row, not to swallow the day —
    // including quests she has already finished and been paid for.
    it("keeps the day intact when the program cannot be resolved", async () => {
      vi.mocked(resolveProgramForEnrollmentVersion).mockResolvedValue(undefined);
      gateWith(THROUGH_BIG_LETTERS);
      const quests = await getDailyQuestsAction("learner-1", "keyboard-club");
      expect(quests.map((q) => q.id)).toEqual(["q-try", "q-skill", "q-any"]);
    });

    it("cannot activate a practice quest whose skill is out of reach", async () => {
      gateWith(["home-base"]);
      expect(await activateQuestAction("learner-1", "keyboard-club", "q-skill")).toEqual({ ok: false });
      expect(vi.mocked(activateQuest)).not.toHaveBeenCalled();
    });

    // She already earned those stars; hiding the row would read as the reward
    // being taken back.
    it("still shows it once she has finished it", async () => {
      vi.mocked(getDailyQuests).mockResolvedValue([
        { id: "q-try", title: "Try Word Workshop", kind: "try_strand",
          target: { count: 1, unitId: "word-workshop" }, progress: { done: 1 },
          rewardStars: 3, status: "done" },
      ]);
      gateWith(THROUGH_BIG_LETTERS);
      const quests = await getDailyQuestsAction("learner-1", "keyboard-club");
      expect(quests.map((q) => q.id)).toEqual(["q-try"]);
    });

    // Dropping the row is not enough on its own: activateQuest demotes the
    // currently-active quest before promoting its target, so a stale client
    // could knock her off the quest she is actually working on.
    it("cannot be activated by a client that still has the row", async () => {
      gateWith(THROUGH_BIG_LETTERS);
      expect(await activateQuestAction("learner-1", "keyboard-club", "q-try")).toEqual({ ok: false });
      expect(vi.mocked(activateQuest)).not.toHaveBeenCalled();
    });

    it("activates normally while still reachable", async () => {
      gateWith(undefined);
      expect(await activateQuestAction("learner-1", "keyboard-club", "q-try")).toEqual({ ok: true });
      expect(vi.mocked(activateQuest)).toHaveBeenCalled();
    });
  });

  // A skill goes "emerging" by being ATTEMPTED, so it outlives access: practise
  // Sky Row, then have a parent narrow the assignment to Home Base, and the
  // top-row skill still reads emerging with no playable activity teaching it.
  // A quest pointing there resolves to no href — another row she cannot finish.
  it("mints no practice quest for a skill only taught outside her access", async () => {
    const skyRow = keyboardClub.units.find((u) => u.id === "sky-row")!;
    const topRowSkill = skyRow.lessons
      .flatMap((l) => l.activities)
      .flatMap((a) => a.skillTags)
      .find((tag) => tag === "typing.keys.top-row")!;

    gateWith(["home-base"]);
    // One solid day only → emerging, not solid.
    vi.mocked(getSkillState).mockResolvedValue({
      [topRowSkill]: { history: [{ day: "2026-07-30", outcome: "solid" }] },
    });
    vi.mocked(getCompletedActivityIds).mockResolvedValue([]);

    await getDailyQuestsAction("learner-1", "keyboard-club");
    const drafts = vi.mocked(assignDailyQuests).mock.calls[0]?.[4] ?? [];
    expect(drafts.filter((d) => d.kind === "practice_skill")).toEqual([]);
  });
});
