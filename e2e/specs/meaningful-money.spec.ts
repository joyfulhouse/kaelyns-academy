import { expect, test } from "@playwright/test";
import { expectSingleHostReward } from "./meaningful-helpers";

const ACTIVITY =
  "/learn/kaelyn-adaptive/life-skills-math/lsm-money-count-2";

test("coin tray keeps editable token instances across a wrong check", async ({ page }) => {
  await page.goto(ACTIVITY);

  const addNickel = page.getByRole("button", { name: "Add Nickel, 5 cents" });
  await expect(addNickel).toBeVisible({ timeout: 25_000 });
  await addNickel.click();
  await addNickel.click();

  const trayNickels = page.getByRole("button", { name: "Remove Nickel, 5 cents" });
  await expect(trayNickels).toHaveCount(2);
  await expect(page.getByText("Tray total: 10 cents")).toBeVisible();

  await page.getByRole("button", { name: "Check it" }).click();
  await expect(page.getByText("You need a little more. Keep your coins and try again.")).toBeVisible();
  await expect(trayNickels).toHaveCount(2);

  await trayNickels.first().click();
  await expect(trayNickels).toHaveCount(1);

  const addQuarter = page.getByRole("button", { name: "Add Quarter, 25 cents" });
  await addQuarter.focus();
  await addQuarter.press("Enter");
  await expect(page.getByText("Tray total: 30 cents")).toBeVisible();

  await addNickel.click();
  await expect(page.getByText("Tray total: 35 cents")).toBeVisible();

  await addNickel.click();
  await expect(page.getByText("Tray total: 40 cents")).toBeVisible();
  await page.getByRole("button", { name: "Check it" }).click();
  await expect(
    page.getByText("That is a little too much. Keep your coins and try again."),
  ).toBeVisible();
  await expect(trayNickels).toHaveCount(3);

  await trayNickels.last().click();
  await expect(page.getByText("Tray total: 35 cents")).toBeVisible();
  await page.getByRole("button", { name: "Check it" }).click();

  await expectSingleHostReward(page);
});
