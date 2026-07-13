import { test, expect } from "@playwright/test";

/**
 * Life Skills Math (world "garden", order 5, unit id "life-skills-math") —
 * guest mode, no account, no DB writes (guest progress is localStorage-only).
 * AUTHORED content only, same posture as learner.spec.ts.
 *
 * The unit is order 5, so a fresh guest (no prior progress) may see its map
 * tile render LOCKED — that's fine, the title still renders either way,
 * proving the seeded unit made it into the guest's program tree. The
 * picker → world map is localStorage-dependent like learner.spec.ts's player
 * test, so the "reaches a lesson" assertion deep-links to a known authored
 * activity instead of clicking through the progression gate.
 */

const ADAPTIVE = "/learn/kaelyn-adaptive";
const LIFE_SKILLS_UNIT = `${ADAPTIVE}/life-skills-math`;
const CLOCK_ACTIVITY = `${LIFE_SKILLS_UNIT}/lsm-time-read-1`;

test("the Life Skills Math world tile renders on the map", async ({ page }) => {
  await page.goto(ADAPTIVE);
  // Guests land straight on the world map (One Big GO: no picker re-ask).
  // Locked or playable, the tile's title renders on the map.
  await expect(page.getByText("Life Skills Math", { exact: true })).toBeVisible({ timeout: 20_000 });
});

test("a Life Skills Math activity renders its interactive player", async ({ page }) => {
  await page.goto(CLOCK_ACTIVITY);
  // "What time is it?" (math-clock, read mode): the clock face + the correct
  // digital-time choice are real, tappable controls — no AI involved.
  await expect(page.getByRole("img", { name: /Clock showing 3:00/i })).toBeVisible({ timeout: 25_000 });
  const answer = page.getByRole("button", { name: "Digital time 3:00" });
  await expect(answer).toBeVisible();

  // Advance the authored step and confirm the activity completes.
  await answer.click();
  await expect(page.getByRole("button", { name: "Keep going" })).toBeVisible();
});
