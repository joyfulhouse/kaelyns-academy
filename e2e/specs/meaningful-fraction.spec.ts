import { expect, test } from "@playwright/test";
import { expectSingleHostReward } from "../helpers";

const MATH = "/learn/kaelyn-adaptive";

test("partition mode reveals halves, thirds, and fourths with pointer and keyboard", async ({
  page,
}) => {
  await page.goto(`${MATH}/math/math-r8-a2`);

  const halves = page.getByRole("button", { name: "Split into 2 equal parts" });
  await expect(halves).toBeVisible({ timeout: 25_000 });
  await halves.click();
  const twoPartBar = page.getByRole("group", { name: "Bar split into 2 equal parts" });
  await expect(twoPartBar).toBeVisible();
  await page.getByRole("button", { name: "Check it" }).click();
  await expect(twoPartBar).toBeVisible();

  const thirds = page.getByRole("button", { name: "Split into 3 equal parts" });
  await thirds.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: "Bar split into 3 equal parts" })).toBeVisible();

  const fourths = page.getByRole("button", { name: "Split into 4 equal parts" });
  await fourths.focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("group", { name: "Bar split into 4 equal parts" })).toBeVisible();
  await expect(page.getByText("4 equal parts shown.")).toBeVisible();
  await page.getByRole("button", { name: "Check it" }).click();
  await expectSingleHostReward(page);
});

test("identify mode selects and deselects requested pieces with pointer and keyboard", async ({
  page,
}) => {
  await page.goto(`${MATH}/math-baseline/math-baseline-a5`);

  const first = page.getByRole("button", { name: "Part 1 of 4, not selected" });
  await expect(first).toBeVisible({ timeout: 25_000 });
  await first.click();

  const third = page.getByRole("button", { name: "Part 3 of 4, not selected" });
  await third.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("2 of 4 equal parts selected.")).toBeVisible();

  await page.getByRole("button", { name: "Part 1 of 4, selected" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByText("1 of 4 equal parts selected.")).toBeVisible();

  await page.getByRole("button", { name: "Part 2 of 4, not selected" }).click();
  await expect(page.getByText("2 of 4 equal parts selected.")).toBeVisible();
  await page.getByRole("button", { name: "Check it" }).click();
  await expectSingleHostReward(page);
});
