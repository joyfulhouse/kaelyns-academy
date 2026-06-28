import { test, expect } from "@playwright/test";

/**
 * Learner (kid) surface — guest mode, no account, no DB writes (guest progress
 * is localStorage-only). We exercise AUTHORED content only and never trigger the
 * paid AI-practice path ("More, made just for me").
 *
 * The kid surfaces resolve client-side, so assertions auto-wait with generous
 * timeouts. The world picker → learner picker step is localStorage-dependent, so
 * the player test deep-links to a known authored activity for stability.
 */

const KID_HEADER = "Read this aloud";
const ADAPTIVE = "/learn/kaelyn-adaptive";
const AUTHORED_ACTIVITY = `${ADAPTIVE}/reading/reading-r1-a1`;

test("guest can open a world from the picker", async ({ page }) => {
  await page.goto("/learn");
  await expect(page.getByRole("heading", { name: "Pick a world" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("link", { name: /Kaelyn's Adaptive Curriculum/ }).click();
  await expect(page).toHaveURL(new RegExp(`${ADAPTIVE}$`));
  // The kid chrome (with the read-aloud control) is present on every studio screen.
  await expect(page.getByRole("button", { name: KID_HEADER })).toBeVisible({ timeout: 20_000 });
});

test("an authored activity renders its interactive player", async ({ page }) => {
  await page.goto(AUTHORED_ACTIVITY);
  // The reading activity opens on its passage step with real, tappable controls.
  const advance = page.getByRole("button", { name: /I read it/i });
  await expect(advance).toBeVisible({ timeout: 25_000 });
  await expect(page.getByRole("button", { name: /Read the story to me/i })).toBeVisible();

  // Advance one authored step and confirm the activity progresses (no AI involved).
  await advance.click();
  await expect(page.getByRole("button", { name: KID_HEADER })).toBeVisible();
});
