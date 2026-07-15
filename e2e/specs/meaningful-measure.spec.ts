import { expect, test } from "@playwright/test";
import { dragPointer, expectSingleHostReward } from "../helpers";

const UNIT_ACTIVITY =
  "/learn/kaelyn-adaptive/life-skills-math/lsm-measure-units-1";
const WEIGHT_ACTIVITY =
  "/learn/kaelyn-adaptive/life-skills-math/lsm-measure-cmp-2";
const LENGTH_ACTIVITY =
  "/learn/kaelyn-adaptive/life-skills-math/lsm-measure-cmp-1";

test("measurement snaps units and lets the learner correct alignment, gaps, and overlaps", async ({
  page,
}) => {
  await page.goto(UNIT_ACTIVITY);

  const supply = page.getByRole("button", { name: "Select one cube to place" });
  await expect(supply).toBeVisible({ timeout: 25_000 });

  await supply.click();
  await page.getByRole("button", { name: "Position 2, empty" }).click();
  await expect(page.getByText("Measurement count: 0 cubes")).toBeVisible();

  await page.getByRole("button", { name: "Check it" }).click();
  await expect(page.getByText("Start the first unit at the start line.")).toBeVisible();

  const misplaced = page.getByRole("button", { name: "Select cube at position 2" });
  await expect(misplaced).toBeEnabled();
  await misplaced.focus();
  await misplaced.press("Home");
  await expect(page.getByText("Measurement count: 1 cube", { exact: true })).toBeVisible();

  await dragPointer(page, supply, page.locator('[data-snap-slot="2"]'));
  await expect(page.getByRole("button", { name: "Select cube at position 3" })).toBeVisible();
  await page.getByRole("button", { name: "Check it" }).click();
  await expect(page.getByText("There is a gap. Move the units so their edges just touch.")).toBeVisible();

  const gapped = page.getByRole("button", { name: "Select cube at position 3" });
  await expect(gapped).toBeEnabled();
  await gapped.focus();
  await gapped.press("ArrowLeft");
  await expect(page.getByText("Measurement count: 2 cubes")).toBeVisible();

  await supply.click();
  await page
    .getByRole("button", { name: "Place selected cube at occupied position 2" })
    .click();
  await page.getByRole("button", { name: "Check it" }).click();
  await expect(
    page.getByText("Some units overlap. Move them so their edges just touch."),
  ).toBeVisible();

  const overlapping = page.getByRole("button", { name: "Select cube at position 2" });
  await expect(overlapping).toHaveCount(2);
  await expect(overlapping.last()).toBeEnabled();
  await overlapping.last().focus();
  await overlapping.last().press("ArrowRight");
  await expect(page.getByText("Measurement count: 3 cubes")).toBeVisible();

  await supply.focus();
  await supply.press("Enter");
  await page.getByRole("button", { name: "Position 4, empty" }).press("Enter");
  await supply.focus();
  await supply.press("Space");
  await page.getByRole("button", { name: "Position 5, empty" }).press("Space");
  await expect(page.getByText("Measurement count: 5 cubes")).toBeVisible();

  const target = page.getByTestId("measurement-target");
  const validSpan = page.getByTestId("measurement-valid-span");
  await expect(target).toHaveAttribute("data-unit-px", "48");
  await expect(target).toHaveAttribute("data-unit-count", "5");
  await expect(target).toHaveAttribute("data-endpoint", "240");
  await expect(validSpan).toHaveAttribute("data-unit-count", "5");
  await expect(validSpan).toHaveAttribute("data-endpoint", "240");

  const targetBox = await target.boundingBox();
  const validSpanBox = await validSpan.boundingBox();
  if (!targetBox || !validSpanBox) throw new Error("Measurement geometry is not rendered");
  expect(Math.abs(targetBox.x - validSpanBox.x)).toBeLessThan(1);
  expect(Math.abs(targetBox.width - validSpanBox.width)).toBeLessThan(1);

  const lastUnit = page.getByRole("button", { name: "Select cube at position 5" });
  await lastUnit.focus();
  await lastUnit.press("Delete");
  await expect(page.getByText("Measurement count: 4 cubes")).toBeVisible();
  await supply.focus();
  await supply.press("Enter");
  await page.getByRole("button", { name: "Position 5, empty" }).press("Enter");

  await page.getByRole("button", { name: "Check it" }).click();

  await expectSingleHostReward(page);
});

test("weight comparison exposes pan positions without naming the answer", async ({
  page,
}) => {
  await page.goto(WEIGHT_ACTIVITY);

  const balance = page.getByRole("img", { name: /balance comparing feather and watermelon/i });
  await expect(balance).toBeVisible({ timeout: 25_000 });
  await expect(balance).toHaveAccessibleDescription(
    /watermelon pan is lower; feather pan is higher/i,
  );
  await expect(balance).not.toHaveAccessibleDescription(/heavier|lighter/i);
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

test("length comparison requires learner-controlled alignment and remains keyboard completable", async ({
  page,
}) => {
  await page.goto(LENGTH_ACTIVITY);

  const comparison = page.getByRole("img", { name: "Length comparison" });
  await expect(comparison).toBeVisible({ timeout: 25_000 });
  await expect(comparison).toHaveAccessibleDescription(
    /pencil extends 3 relative units; crayon extends 2 relative units; marker extends 4 relative units/i,
  );

  await expect(page.getByRole("button", { name: "Choose marker" })).toHaveCount(0);
  for (const label of ["pencil", "crayon"]) {
    const align = page.getByRole("button", { name: `Line up ${label}` });
    await align.focus();
    await align.press("Enter");
    await expect(page.getByRole("button", { name: `${label} lined up` })).toBeDisabled();
  }
  await page.getByRole("button", { name: "Line up marker" }).press("Enter");

  const marker = page.getByRole("button", { name: "Choose marker" });
  await marker.focus();
  await marker.press("Enter");
  await expectSingleHostReward(page);
});
