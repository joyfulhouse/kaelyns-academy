import { expect, test } from "@playwright/test";

const MAKE_TEN = "/learn/kaelyn-adaptive/math/math-r7-a1";

test("make-ten fills, trades, continues, and undoes with pointer and keyboard", async ({ page }) => {
  await page.goto(MAKE_TEN);

  const trade = page.getByRole("button", { name: "Trade for a ten" });
  await expect(trade).toBeVisible({ timeout: 25_000 });
  await expect(trade).toBeDisabled();

  await page.getByRole("button", { name: "Cell 8, empty, tap to add" }).click();
  const ninthCell = page.getByRole("button", { name: "Cell 9, empty, tap to add" });
  await ninthCell.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Cell 10, empty, tap to add" }).click();

  await expect(page.getByText("The first frame is full. Trade it for one ten.")).toBeVisible();
  await expect(trade).toBeEnabled();
  await trade.focus();
  await page.keyboard.press("Space");

  await expect(page.getByRole("img", { name: "One ten token" })).toBeVisible();
  await expect(page.getByRole("img", { name: "First frame traded for one ten token" })).toBeVisible();

  const eleventhCell = page.getByRole("button", { name: "Cell 11, empty, tap to add" });
  await eleventhCell.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("One ten and 1 ones. 4 of 8 added.")).toBeVisible();

  const undo = page.getByRole("button", { name: "Undo" });
  await undo.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("One ten and 0 ones. 3 of 8 added.")).toBeVisible();
});
