import { test, expect } from "@playwright/test";

/**
 * Adventure 2.0 B3 adaptive-generation affordance smoke — GUEST half (public
 * project, signed-out). LLM-FREE by construction: the gate env has no LiteLLM,
 * so no test may trigger live generation. These assertions only inspect
 * affordances (which button renders, which calm state renders); nothing here
 * clicks "More" or depends on a generation succeeding.
 *
 * Coverage:
 *  - a guest finishing an authored, GENERABLE-kind activity (reading-comprehension,
 *    `reading-baseline-a1`) reaches the reward screen but is NOT offered the
 *    account-only "More, made just for me" affordance (signed-out gating: the
 *    AI-practice path requires an account — see ActivityHost's `canGenerate`).
 *  - the generated-shelf play route degrades to the calm "moved" state (never a
 *    500/scary 404) for an unknown id — for a guest there is no session, so the
 *    row is always null and GeneratedPracticeHost renders `ShelfItemMoved`.
 *
 * The signed-in counterpart (the SAME reward flow SHOWING the More button) lives
 * in adaptive-generation-signed-in.spec.ts under the `parent` project, because a
 * single spec file maps to one Playwright project.
 *
 * Same posture as baseline-placement.spec.ts: AUTHORED content only, guest mode,
 * no DB writes (guest progress is localStorage-only), deep-linking to a known
 * authored activity rather than clicking through the localStorage-gated map.
 */

const ADAPTIVE = "/learn/kaelyn-adaptive";
// `reading-baseline-a1` — "Ben's Lucky Find": a single literal question, and a
// reading-comprehension kind (isGenerableKind === true), so it is exactly the
// authored generable activity whose reward screen the More gate keys off.
const READING_ACTIVITY = `${ADAPTIVE}/reading-baseline/reading-baseline-a1`;

test("a guest finishes a generable activity but the reward screen offers no AI 'More'", async ({
  page,
}) => {
  await page.goto(READING_ACTIVITY);

  // Read the passage, then answer the one literal question (mirrors
  // baseline-placement.spec.ts's proven flow for this activity).
  const readIt = page.getByRole("button", { name: "Continue to questions" });
  await expect(readIt).toBeVisible({ timeout: 25_000 });
  await readIt.click();

  const correctChoice = page.getByRole("button", { name: "A shiny rock" });
  await expect(correctChoice).toBeVisible();
  await correctChoice.click();

  // The activity's own earned-reward overlay lands first ("Keep going"); tapping
  // it fires onComplete, which advances the host to its reward screen.
  const keepGoing = page.getByRole("button", { name: "Keep going" });
  await expect(keepGoing).toBeVisible({ timeout: 20_000 });
  await keepGoing.click();

  // We're on the host reward screen once its stable quiet "Map" action
  // renders (the reward headline varies with star count, so it's not a reliable
  // anchor). Then assert the account-only affordance is absent for a guest.
  await expect(page.getByRole("link", { name: "Map" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("button", { name: "More, made just for me" })).toHaveCount(0);
});

test("an unknown generated shelf id renders the calm moved state, not an error", async ({
  page,
}) => {
  // No session (guest) → the page resolves the shelf row as null and
  // GeneratedPracticeHost renders ShelfItemMoved — a warm nudge, never a 500.
  const response = await page.goto(`${ADAPTIVE}/generated/nonexistent-id`);
  expect(response?.status() ?? 200).toBeLessThan(500);

  await expect(page.getByRole("heading", { name: "This one moved!" })).toBeVisible({
    timeout: 20_000,
  });
});
