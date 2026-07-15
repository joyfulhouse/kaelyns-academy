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
  // The remembered guest learner auto-enters; both baseline tiles render.
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
  const readIt = page.getByRole("button", { name: "Continue to questions" });
  await expect(readIt).toBeVisible({ timeout: 25_000 });
  await readIt.click();

  const correctChoice = page.getByRole("button", { name: "A shiny rock" });
  await expect(correctChoice).toBeVisible();
  await correctChoice.click();
  await page.getByRole("button", { name: "Check answer" }).click();

  // A correct answer advances into the observable event-order retell.
  await expect(page.getByText("Nice reading. Now put the events in order.")).toBeVisible();
});

test("a math-array baseline activity renders and registers a complete row", async ({ page }) => {
  await page.goto(MATH_ACTIVITY);
  // "Build the rows" (build mode, 3 rows of 4) starts empty. The child adds a
  // complete row, so the visible construction matches the named array model.
  const addRow = page.getByRole("button", { name: "Add a row" });
  await expect(addRow).toBeVisible({ timeout: 25_000 });
  await addRow.click();

  await expect(page.getByText("1 of 3 rows")).toBeVisible();
  await expect(page.getByText("4 tiles in row-major order")).toBeVisible();
});
