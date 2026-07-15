import { expect, test } from "@playwright/test";

const MATH = "/learn/kaelyn-adaptive/math-baseline";

test("build mode adds and removes complete rows with pointer and keyboard", async ({ page }) => {
  await page.goto(`${MATH}/math-baseline-a1`);

  const addRow = page.getByRole("button", { name: "Add a row" });
  await expect(addRow).toBeVisible({ timeout: 25_000 });
  await addRow.click();
  await expect(page.getByText("1 of 3 rows")).toBeVisible();
  await expect(page.getByText("4 tiles in row-major order")).toBeVisible();

  const removeRow = page.getByRole("button", { name: "Remove a row" });
  await removeRow.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("0 of 3 rows")).toBeVisible();
});

test("multiply mode reveals rows and announces the skip-count trail", async ({ page }) => {
  await page.goto(`${MATH}/math-baseline-a2`);

  await page.getByRole("button", { name: "Reveal row 1" }).click();
  const secondRow = page.getByRole("button", { name: "Reveal row 2" });
  await secondRow.focus();
  await page.keyboard.press("Space");

  await expect(page.getByText("Skip count: 2, 4")).toBeVisible();
});

test("divide mode deals one visible item at a time around labeled groups", async ({ page }) => {
  await page.goto(`${MATH}/math-baseline-a3`);

  const pool = page.getByRole("button", { name: "Deal one item, 12 left" });
  await expect(pool).toBeVisible({ timeout: 25_000 });
  await pool.click();
  await expect(page.getByRole("group", { name: "Group 1, 1 item" })).toBeVisible();

  const next = page.getByRole("button", { name: "Deal one item, 11 left" });
  await next.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: "Group 2, 1 item" })).toBeVisible();
});

test("area mode fills and removes individual labeled unit squares", async ({ page }) => {
  await page.goto(`${MATH}/math-baseline-a4`);

  const firstSquare = page.getByRole("button", {
    name: "Row 1, column 1, empty unit square",
  });
  await expect(firstSquare).toBeVisible({ timeout: 25_000 });
  await firstSquare.click();

  const secondSquare = page.getByRole("button", {
    name: "Row 1, column 2, empty unit square",
  });
  await secondSquare.focus();
  await page.keyboard.press("Space");
  await expect(page.getByText("2 of 12 unit squares filled")).toBeVisible();

  await page
    .getByRole("button", { name: "Row 1, column 1, filled unit square" })
    .click();
  await expect(page.getByText("1 of 12 unit squares filled")).toBeVisible();
});
