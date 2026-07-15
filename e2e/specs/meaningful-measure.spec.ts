import { expect, test } from "@playwright/test";
import { expectSingleHostReward } from "../helpers";

const UNIT_ACTIVITY =
  "/learn/kaelyn-adaptive/life-skills-math/lsm-measure-units-1";
const WEIGHT_ACTIVITY =
  "/learn/kaelyn-adaptive/life-skills-math/lsm-measure-cmp-2";

test("measurement places and removes individual equal units along the baseline", async ({
  page,
}) => {
  await page.goto(UNIT_ACTIVITY);

  const addUnit = page.getByRole("button", { name: "Add one cube" });
  await expect(addUnit).toBeVisible({ timeout: 25_000 });
  await addUnit.click();
  await addUnit.click();
  await addUnit.click();

  const placedUnits = page.getByRole("button", { name: /Remove cube \d+/ });
  await expect(placedUnits).toHaveCount(3);
  await placedUnits.nth(1).click();
  await expect(placedUnits).toHaveCount(2);

  await page.getByRole("button", { name: "Check it" }).click();
  await expect(page.getByText("Keep your units in place and measure a little farther.")).toBeVisible();
  await expect(placedUnits).toHaveCount(2);

  await expect(addUnit).toBeEnabled();
  await addUnit.focus();
  await addUnit.press("Enter");
  await addUnit.press("Enter");
  await addUnit.press("Enter");
  await expect(page.getByText("5 cubes placed", { exact: true })).toBeVisible();

  const target = page.getByTestId("measurement-target");
  const units = page.getByTestId("measurement-units");
  await expect(target).toHaveAttribute("data-unit-px", "48");
  await expect(target).toHaveAttribute("data-unit-count", "5");
  await expect(target).toHaveAttribute("data-endpoint", "240");
  await expect(units).toHaveAttribute("data-unit-px", "48");
  await expect(units).toHaveAttribute("data-unit-count", "5");
  await expect(units).toHaveAttribute("data-endpoint", "240");

  const targetBox = await target.boundingBox();
  const unitsBox = await units.boundingBox();
  if (!targetBox || !unitsBox) throw new Error("Measurement geometry is not rendered");
  expect(Math.abs(targetBox.x - unitsBox.x)).toBeLessThan(1);
  expect(Math.abs(targetBox.width - unitsBox.width)).toBeLessThan(1);

  await page.getByRole("button", { name: "Check it" }).click();

  await expectSingleHostReward(page);
});

test("weight comparison uses a labeled balance tilted toward the heavier object", async ({
  page,
}) => {
  await page.goto(WEIGHT_ACTIVITY);

  const balance = page.getByRole("img", { name: /balance comparing feather and watermelon/i });
  await expect(balance).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId("balance-beam")).toHaveAttribute("data-tilt", "right");
  await expect(page.getByTestId("left-balance-pan")).toHaveAttribute("data-orientation", "level");
  await expect(page.getByTestId("right-balance-pan")).toHaveAttribute("data-orientation", "level");
  await expect(page.getByTestId("left-balance-string")).toHaveAttribute(
    "data-orientation",
    "vertical",
  );
  await expect(page.getByTestId("right-balance-string")).toHaveAttribute(
    "data-orientation",
    "vertical",
  );

  await page.getByRole("button", { name: "Choose feather" }).click();
  await expect(page.getByText("Look at which pan sits lower, then try again.")).toBeVisible();
  await page.getByRole("button", { name: "Choose watermelon" }).click();

  await expectSingleHostReward(page);
});
