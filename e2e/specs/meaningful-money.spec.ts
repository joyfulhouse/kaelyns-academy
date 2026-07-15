import { expect, test } from "@playwright/test";
import { dragPointer, expectSingleHostReward } from "../helpers";

const ACTIVITY =
  "/learn/kaelyn-adaptive/life-skills-math/lsm-money-count-2";

test("coin tray converges tap, pointer drag, and keyboard placement through one tray", async ({
  page,
}) => {
  await page.goto(ACTIVITY);

  const nickel = page.getByRole("button", { name: /^Select Nickel, 5 cents\./ });
  await expect(nickel).toBeVisible({ timeout: 25_000 });
  await nickel.click();
  await expect(nickel).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Place selected Nickel in tray" }).click();
  await expect(page.getByText("Tray total: 5 cents")).toBeVisible();

  const clear = page.getByRole("button", { name: "Clear" });
  await expect(clear).toBeEnabled();
  await clear.click();
  await expect(page.getByText("Tray total: 0 cents")).toBeVisible();

  await nickel.click();
  await page.getByRole("button", { name: "Place selected Nickel in tray" }).click();

  const dime = page.getByRole("button", { name: /^Select Dime, 10 cents\./ });
  await dragPointer(page, dime, page.getByTestId("coin-tray-drop-zone"));
  await expect(page.getByText("Tray total: 15 cents")).toBeVisible();

  const quarter = page.getByRole("button", { name: /^Select Quarter, 25 cents\./ });
  await quarter.focus();
  await quarter.press("Enter");
  await expect(page.getByText("Tray total: 40 cents")).toBeVisible();
  await page.getByRole("button", { name: "Check it" }).click();
  await expect(
    page.getByText("That is a little too much. Keep your coins and try again."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove Nickel, 5 cents" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Remove Dime, 10 cents" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Remove Quarter, 25 cents" })).toHaveCount(1);

  await page.getByRole("button", { name: "Remove Nickel, 5 cents" }).click();
  await expect(page.getByText("Tray total: 35 cents")).toBeVisible();
  await page.getByRole("button", { name: "Check it" }).click();

  await expectSingleHostReward(page);
});
