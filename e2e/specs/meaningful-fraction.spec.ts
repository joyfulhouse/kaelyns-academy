import { expect, test } from "@playwright/test";
import { expectSingleHostReward } from "../helpers";

const MATH = "/learn/kaelyn-adaptive";

test("partition mode compares equal and unequal same-denominator bars with tap and keyboard", async ({
  page,
}) => {
  await page.goto(`${MATH}/math/math-r8-a2`);

  const first = page.getByRole("button", {
    name: "Choice 1. Four parts with relative widths 1, 3, 2, 2.",
  });
  await expect(first).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId("partition-choice-1")).toHaveAttribute("data-part-widths", "1,3,2,2");
  await expect(page.getByTestId("partition-choice-2")).toHaveAttribute("data-part-widths", "2,2,2,2");
  await expect(page.getByTestId("partition-choice-3")).toHaveAttribute("data-part-widths", "3,1,2,2");

  await first.click();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Check it" }).click();
  await expect(
    page.getByText("Keep your choice. Compare the width of every share. Fair shares should match."),
  ).toBeVisible();
  await expect(first).toHaveAttribute("aria-pressed", "true");

  const fair = page.getByRole("button", {
    name: "Choice 2. Four parts with relative widths 2, 2, 2, 2.",
  });
  await expect(fair).toBeEnabled();
  await fair.focus();
  await fair.press("Space");
  await expect(fair).toHaveAttribute("aria-pressed", "true");
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

  await page.getByRole("button", { name: "Check it" }).click();
  await expect(
    page.getByText(
      "Keep your selection. Count the shaded pieces and inspect whether every share is the same size.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Part 1 of 4, selected" })).toBeVisible();

  const third = page.getByRole("button", { name: "Part 3 of 4, not selected" });
  await expect(third).toBeEnabled();
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
