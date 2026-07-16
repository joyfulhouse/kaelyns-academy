import { test, expect } from "@playwright/test";
import {
  uniqueTag,
  E2E_LEARNER_PREFIX,
  addChild,
  expectSingleHostReward,
  selectAccountLearner,
} from "../helpers";

/**
 * Adventure 2.0 B3 completion smoke — SIGNED-IN half (`parent` project,
 * authenticated via the seeded parent's storageState). The guest counterpart
 * lives in adaptive-generation.spec.ts (one file → one Playwright project).
 *
 * The account path persists the bounded response before showing exactly one
 * ActivityHost-owned reward. Fresh generated practice is warmed in the
 * background and belongs on the durable lesson shelf; the removed in-session
 * "More, made just for me" action must not return. LLM-FREE: the gate env has no
 * LiteLLM, and this test never depends on generation succeeding.
 *
 * Fixture choice — a per-run THROWAWAY learner, not the persistent one:
 * completing `reading-baseline-a1` records a real attempt AND mints
 * `activity_complete` ledger stars for the learner (the star mint in
 * `recordAttempt` runs even for a checkpoint/baseline unit — it only skips
 * skill_state + quests). motivation.spec.ts depends on its persistent
 * `E2E Learner` fixture staying balance-0 forever to keep its
 * insufficient-balance sticker assertion idempotent, so this spec must NOT play
 * an authored activity as that learner. Instead it creates an `E2E Kid <tag>`
 * throwaway (same pattern parent.spec.ts uses), plays as it, then deletes it —
 * no cross-run star accumulation, and scripts/e2e-cleanup.sh's `E2E Kid%` sweep
 * catches it if a run fails before the inline delete.
 */

const ADAPTIVE = "/learn/kaelyn-adaptive";
const READING_ACTIVITY = `${ADAPTIVE}/reading-baseline/reading-baseline-a1`;

test("a signed-in learner reaches one host reward without ephemeral AI practice", async ({
  page,
}) => {
  const name = `${E2E_LEARNER_PREFIX} ${uniqueTag()}`;

  // Create the throwaway learner (auto-enrolled in kaelyn-adaptive by
  // createLearnerAction, so it can reach the adaptive world immediately).
  await addChild(page, name);

  try {
    // Seed this learner before entering the kid route so both the world map and
    // direct activity link resolve deterministically to the throwaway profile.
    await selectAccountLearner(page, name);

    // Complete the authored generable activity (same flow as the guest spec).
    await page.goto(READING_ACTIVITY);
    const readIt = page.getByRole("button", { name: "Continue to questions" });
    await expect(readIt).toBeVisible({ timeout: 25_000 });
    await readIt.click();

    const correctChoice = page.getByRole("button", { name: "A shiny rock" });
    await expect(correctChoice).toBeVisible();
    await correctChoice.click();
    // Meaningful interactions: choosing selects; the explicit check submits.
    await page.getByRole("button", { name: "Check answer" }).click();

    // The activity now ends with a structured retell: place the three events in
    // story order, then check.
    await page.getByRole("button", { name: "Add event Ben finds a shiny rock." }).click();
    await page.getByRole("button", { name: "Add event Ben puts the rock in his pocket." }).click();
    await page.getByRole("button", { name: "Add event Ben runs home to show his sister." }).click();
    await page.getByRole("button", { name: "Check event order" }).click();

    // The Player submits directly to the host. The host waits for the account
    // write, then replaces the Player with its single reward screen.
    await expectSingleHostReward(page);
    await expect(page.getByRole("link", { name: "Map" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("More, made just for me", { exact: true })).toHaveCount(0);
  } finally {
    // Tear the throwaway learner down so no star balance accumulates across runs.
    await page.goto("/parent/learners");
    await page.getByRole("link", { name }).first().click();
    await expect(page).toHaveURL(/\/parent\/learners\/[^/]+$/);
    await page.getByRole("button", { name: /Delete .*profile/ }).click();
    await page.getByRole("button", { name: "Confirm delete" }).click();
    await page.waitForURL("**/parent/learners", { timeout: 30_000 });
    await expect(page.getByRole("link", { name })).toHaveCount(0);
  }
});
