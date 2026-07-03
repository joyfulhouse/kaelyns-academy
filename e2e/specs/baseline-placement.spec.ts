import { test, expect } from "@playwright/test";

/**
 * Baseline check-ins (Adventure 2.0 C1) — "Show what you know" placement
 * units for Reading ("reading-baseline", world "sunshine") and Math
 * ("math-baseline", world "bigtop"). Guest mode, no account, no DB writes
 * (guest progress is localStorage-only); AUTHORED content only, same
 * posture as science.spec.ts.
 *
 * Both units are order 0, so they surface ahead of their strand's regular
 * units and a fresh guest sees them unlocked. The picker → world map is
 * localStorage-dependent like learner.spec.ts's player test, so the
 * "reaches an activity" assertions deep-link to known authored activities
 * instead of clicking through the progression gate.
 */

const ADAPTIVE = "/learn/kaelyn-adaptive";
const READING_ACTIVITY = `${ADAPTIVE}/reading-baseline/reading-baseline-a1`;
const MATH_ACTIVITY = `${ADAPTIVE}/math-baseline/math-baseline-a1`;

test("the baseline check-in world tiles render on the map", async ({ page }) => {
  await page.goto(ADAPTIVE);
  // Guest picker: tap a mock learner to reach the world map.
  const kaelynTile = page.getByRole("button", { name: "Kaelyn" });
  await expect(kaelynTile).toBeVisible({ timeout: 20_000 });
  await kaelynTile.click();

  // Both baseline tiles' titles render on the map.
  await expect(page.getByText("Reading — Show what you know", { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("Math — Show what you know", { exact: true })).toBeVisible();
});

test("a reading-comprehension baseline activity renders and advances after a correct answer", async ({
  page,
}) => {
  await page.goto(READING_ACTIVITY);
  // "Ben's Lucky Find" — read the passage, then answer the literal question.
  const readIt = page.getByRole("button", { name: "I read it" });
  await expect(readIt).toBeVisible({ timeout: 25_000 });
  await readIt.click();

  const correctChoice = page.getByRole("button", { name: "A shiny rock" });
  await expect(correctChoice).toBeVisible();
  await correctChoice.click();

  // A correct answer advances to the next question.
  await expect(page.getByText("Question 2 of 5")).toBeVisible();
});

test("a math-array baseline activity renders and registers a build tap", async ({ page }) => {
  await page.goto(MATH_ACTIVITY);
  // "Build the rows" (build mode, 3 rows of 4) — tap the first tile and
  // confirm the build progress registers.
  const firstTile = page.getByRole("button", { name: "Empty tile 1" });
  await expect(firstTile).toBeVisible({ timeout: 25_000 });
  await firstTile.click();

  await expect(page.getByText("1 of 12 tiles")).toBeVisible();
});
