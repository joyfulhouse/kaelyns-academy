import { test, expect } from "@playwright/test";
import { uniqueTag, E2E_LEARNER_PREFIX, addChild } from "../helpers";

/**
 * Parent dashboard journeys (runs authenticated as the SEEDED parent via the
 * `parent` project's storageState). Each test cleans up the learner row it
 * creates; the seeded account itself is never deleted.
 */

test("dashboard is reachable when authenticated", async ({ page }) => {
  await page.goto("/parent");
  await expect(page).toHaveURL(/\/parent/);
  await expect(page.getByRole("link", { name: "Learners" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
});

test("create a learner, export its data, then delete it", async ({ page }) => {
  const name = `${E2E_LEARNER_PREFIX} ${uniqueTag()}`;

  // Add the child, then confirm it appears in the real list (helper forces a
  // fresh SSR so the new learner link is deterministically present).
  await addChild(page, name);
  const learnerLink = page.getByRole("link", { name }).first();

  // Open the learner detail page — the per-child §8 data controls live here.
  await learnerLink.click();
  await expect(page).toHaveURL(/\/parent\/learners\/[^/]+$/);

  // Per-child export → a JSON download.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("-export.json");

  // Delete the learner (two-click confirm) → back to the learners list, gone.
  await page.getByRole("button", { name: /Delete .*profile/ }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await page.waitForURL("**/parent/learners", { timeout: 30_000 });
  await expect(page.getByRole("link", { name })).toHaveCount(0);
});

test("account-level data export downloads a JSON bundle", async ({ page }) => {
  await page.goto("/parent/settings");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("kaelyns-academy-export.json");
});
