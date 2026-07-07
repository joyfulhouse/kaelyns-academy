import { test, expect } from "@playwright/test";
import { uniqueTag, E2E_LEARNER_PREFIX } from "../helpers";

/**
 * Adventure 2.0 B3 adaptive-generation affordance smoke — SIGNED-IN half
 * (`parent` project, authenticated via the seeded parent's storageState). The
 * guest counterpart lives in adaptive-generation.spec.ts (one file → one
 * Playwright project); this file holds only the account-mode assertion.
 *
 * The one thing to prove here: on the reward screen of an authored, GENERABLE
 * activity, a signed-in household IS offered the "More, made just for me"
 * affordance — the exact inverse of the guest case. `signedIn` is the
 * differentiator now that ALL kinds are generable (ActivityHost's `canGenerate`).
 * LLM-FREE: the gate env has no LiteLLM, so we assert the button is PRESENT and
 * never click it — no test may trigger live generation.
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

test("a signed-in learner is offered AI 'More' practice on the reward screen", async ({ page }) => {
  const name = `${E2E_LEARNER_PREFIX} ${uniqueTag()}`;

  // Create the throwaway learner (auto-enrolled in kaelyn-adaptive by
  // createLearnerAction, so it can reach the adaptive world immediately).
  await page.goto("/parent/learners");
  await page.getByLabel("Child's name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Add a child" }).click();
  await expect(page.getByRole("status")).toContainText(/enrolled/i);

  try {
    // Select this learner on the account picker so the activity host loads ITS
    // state (account mode otherwise defaults to the first learner, which is
    // non-deterministic across the seeded account's rows). Writing the choice to
    // localStorage here carries it to the deep-linked activity below.
    // exact: true — the tag makes the name unique, but keep it strict-mode-safe.
    await page.goto(ADAPTIVE);
    await page.getByRole("button", { name, exact: true }).click();

    // Complete the authored generable activity (same flow as the guest spec).
    await page.goto(READING_ACTIVITY);
    const readIt = page.getByRole("button", { name: "I read it" });
    await expect(readIt).toBeVisible({ timeout: 25_000 });
    await readIt.click();

    const correctChoice = page.getByRole("button", { name: "A shiny rock" });
    await expect(correctChoice).toBeVisible();
    await correctChoice.click();

    const keepGoing = page.getByRole("button", { name: "Keep going" });
    await expect(keepGoing).toBeVisible({ timeout: 20_000 });
    await keepGoing.click();

    // On the host reward screen (anchored by its stable "Back to the map"
    // button), the account-only affordance IS offered. Do NOT click it — the
    // gate env has no LiteLLM, so a click would fire a real generation.
    await expect(page.getByRole("button", { name: "Back to the map" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: "More, made just for me" })).toBeVisible();
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
