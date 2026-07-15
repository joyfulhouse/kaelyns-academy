import { expect, test } from "@playwright/test";
import { expectSingleHostReward } from "../helpers";

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

test("five-column multiply rows stay reachable without widening a narrow page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/learn/kaelyn-adaptive/math/math-r2-a2");

  const scroller = page.getByTestId("multiply-array-scroll");
  await expect(scroller).toBeVisible({ timeout: 25_000 });
  await expect(page.getByRole("button", { name: "Reveal row 1" })).toBeVisible();

  const before = await scroller.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(before.scrollWidth).toBeGreaterThan(before.clientWidth);

  await scroller.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });

  const finalCell = page.getByRole("button", { name: "Reveal row 1" }).locator("span").last();
  const [scrollerBox, finalCellBox] = await Promise.all([
    scroller.boundingBox(),
    finalCell.boundingBox(),
  ]);
  expect(scrollerBox).not.toBeNull();
  expect(finalCellBox).not.toBeNull();
  if (scrollerBox && finalCellBox) {
    expect(finalCellBox.x + finalCellBox.width).toBeLessThanOrEqual(
      scrollerBox.x + scrollerBox.width + 1,
    );
  }

  const pageWidths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(pageWidths.scroll).toBe(pageWidths.client);
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

test("divide mode completes and retries the four related facts with pointer and keyboard", async ({
  page,
}) => {
  await page.goto(`${MATH}/math-baseline-a3`);

  for (let remaining = 12; remaining > 0; remaining -= 1) {
    await page.getByRole("button", { name: `Deal one item, ${remaining} left` }).click();
  }

  await page.getByRole("button", { name: "Choose 3" }).click();
  await page.getByRole("button", { name: "Check share" }).click();

  await expect(page.getByRole("heading", { name: "Build the fact family" })).toBeVisible();
  await expect(page.getByText("4 × 3 = ?", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByRole("button", { name: "Deal one item, 12 left" })).toBeVisible();

  for (let remaining = 12; remaining > 0; remaining -= 1) {
    await page.getByRole("button", { name: `Deal one item, ${remaining} left` }).click();
  }
  await page.getByRole("button", { name: "Choose 3" }).click();
  await page.getByRole("button", { name: "Check share" }).click();

  await page.getByRole("button", { name: "Choose 11" }).click();
  await page.getByRole("button", { name: "Check fact" }).click();
  await expect(page.getByText("Fact 1 of 4", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Choose 12" }).click();
  await page.getByRole("button", { name: "Check fact" }).click();
  await expect(page.getByText("3 × 4 = ?", { exact: true })).toBeVisible();

  const commutedProduct = page.getByRole("button", { name: "Choose 12" });
  await commutedProduct.focus();
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "Check fact" }).click();

  await expect(page.getByText("12 ÷ 4 = ?", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Choose 3" }).click();
  await page.getByRole("button", { name: "Check fact" }).click();

  await expect(page.getByText("12 ÷ 3 = ?", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Choose 4" }).click();
  await page.getByRole("button", { name: "Check fact" }).click();

  await expectSingleHostReward(page);
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
