import { test, expect } from "@playwright/test";

/**
 * Science & Nature (world "ocean", order 6, unit id "science-nature") —
 * guest mode, no account, no DB writes (guest progress is localStorage-only).
 * AUTHORED content only, same posture as life-skills-math.spec.ts.
 *
 * The unit is order 6, so a fresh guest (no prior progress) may see its map
 * tile render LOCKED — that's fine, the title still renders either way,
 * proving the seeded unit made it into the guest's program tree. The
 * picker → world map is localStorage-dependent like learner.spec.ts's player
 * test, so the "reaches a lesson" assertions deep-link to known authored
 * activities instead of clicking through the progression gate.
 *
 * B2 introduces two new activity kinds — sort-categories and seq-order —
 * each deep-linked here with one correct tap to confirm the player renders
 * and its placement/order logic actually works, not just that the page loads.
 */

const ADAPTIVE = "/learn/kaelyn-adaptive";
const SCIENCE_UNIT = `${ADAPTIVE}/science-nature`;
const SORT_ACTIVITY = `${SCIENCE_UNIT}/sci-sort-living`;
const SEQ_ACTIVITY = `${SCIENCE_UNIT}/sci-cycle-frog`;

test("the Science & Nature world tile renders on the map", async ({ page }) => {
  await page.goto(ADAPTIVE);
  // Guests land straight on the world map (One Big GO: no picker re-ask).
  // Locked or playable, the tile's title renders on the map.
  await expect(page.getByText("Science & Nature", { exact: true })).toBeVisible({ timeout: 20_000 });
});

test("a sort-categories activity renders and freely places an item", async ({ page }) => {
  await page.goto(SORT_ACTIVITY);
  // "Living or not living?" — tap an item, then its correct bin, and
  // confirm the placement registers (no AI involved).
  const dog = page.getByRole("button", { name: "Dog, in the sorting tray" });
  await expect(dog).toBeVisible({ timeout: 25_000 });
  await dog.click();

  const livingBin = page.getByRole("button", { name: "Put Dog in Living" });
  await livingBin.click();
  await expect(page.getByText("1 of 8 sorted")).toBeVisible();
});

test("a seq-order activity renders and freely places a card", async ({ page }) => {
  await page.goto(SEQ_ACTIVITY);
  // "Frog life cycle" — tap the first card in the true sequence ("Egg") and
  // confirm the order registers.
  const egg = page.getByRole("button", { name: "Egg, in the card tray" });
  await expect(egg).toBeVisible({ timeout: 25_000 });
  await egg.click();
  await page.getByRole("button", { name: "Put Egg in 3rd" }).click();

  await expect(page.getByText("1 of 4 placed")).toBeVisible();
});
