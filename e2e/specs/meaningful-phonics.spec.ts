import { expect, test } from "@playwright/test";
import { expectSingleHostReward } from "../helpers";

const ACTIVITY = "/learn/kaelyn-adaptive/word-study/word-r4-a1";

test("word build retains exact tile copies through correction and a sound sweep", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(ACTIVITY);

  await page.getByRole("button", { name: "Use tile rab" }).click();
  await page.getByRole("button", { name: "Use tile bit" }).press("Enter");
  await page.getByRole("button", { name: "Check it" }).click();
  await expect(page.getByText("Word 2 of 2")).toBeVisible({ timeout: 10_000 });

  const firstCo = page.getByRole("button", { name: "Use tile co, copy 1 of 2" });
  const secondCo = page.getByRole("button", { name: "Use tile co, copy 2 of 2" });
  await expect(firstCo).toBeVisible();
  await expect(secondCo).toBeVisible();

  await page.getByRole("button", { name: "Use tile a" }).click();
  await firstCo.click();
  await secondCo.press("Space");
  await page.getByRole("button", { name: "Check it" }).click();

  const misplaced = page.getByRole("button", {
    name: "Placed tile a in slot 1. Activate to return it",
  });
  await expect(misplaced).toBeVisible();
  await expect(page.getByText("Keep your tiles and try a different order.")).toBeVisible();
  await expect(misplaced).toBeEnabled();
  await misplaced.focus();
  await misplaced.press("Delete");
  await page.getByRole("button", { name: "Use tile a" }).click();

  await page.getByRole("button", { name: "Check it" }).click();
  await expect(page.getByRole("group", { name: "Built word cocoa" })).toBeVisible();
  await expect(page.getByText(/Sound sweep:/)).toBeVisible();
  await expect(page.getByText("Blending the whole word: cocoa")).toBeVisible({ timeout: 10_000 });

  await expectSingleHostReward(page);
});
