import { test, expect } from "@playwright/test";
import { expectSingleHostReward } from "../helpers";

/**
 * Adventure 2.0 B3 adaptive-generation smoke — GUEST half (public project,
 * signed-out). LLM-FREE by construction: the gate env has no LiteLLM, so no test
 * may trigger live generation.
 *
 * Coverage:
 *  - an authored reading activity submits directly to ActivityHost and reaches
 *    exactly one host-owned reward; the removed in-session "More, made just for
 *    me" flow never renders.
 *  - the generated-shelf play route degrades to the calm "moved" state (never a
 *    500/scary 404) for an unknown id — for a guest there is no session, so the
 *    row is always null and GeneratedPracticeHost renders `ShelfItemMoved`.
 *
 * Same posture as baseline-placement.spec.ts: AUTHORED content only, guest mode,
 * no DB writes (guest progress is localStorage-only), deep-linking to a known
 * authored activity rather than clicking through the localStorage-gated map.
 */

const ADAPTIVE = "/learn/kaelyn-adaptive";
// `reading-baseline-a1` — "Ben's Lucky Find": a single literal question, and a
// reading-comprehension kind, so it exercises a Player that used to show its own
// completion overlay before handing control back to the host.
const READING_ACTIVITY = `${ADAPTIVE}/reading-baseline/reading-baseline-a1`;

test("a guest finishes an authored activity through one host-owned reward", async ({
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
  // Meaningful interactions: choosing selects; the explicit check submits.
  await page.getByRole("button", { name: "Check answer" }).click();

  // The activity now ends with a structured retell: place the three events in
  // story order, then check.
  await page.getByRole("button", { name: "Add event Ben finds a shiny rock." }).click();
  await page.getByRole("button", { name: "Add event Ben puts the rock in his pocket." }).click();
  await page.getByRole("button", { name: "Add event Ben runs home to show his sister." }).click();
  await page.getByRole("button", { name: "Check event order" }).click();

  // Player completion goes straight through the host's save boundary. Only the
  // host reward remains, and its continuation actions are links rather than a
  // second Player-owned reward button.
  await expectSingleHostReward(page);
  await expect(page.getByRole("link", { name: "Map" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("More, made just for me", { exact: true })).toHaveCount(0);
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
