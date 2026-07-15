import { expect, test, type Page } from "@playwright/test";
import { expectSingleHostReward } from "../helpers";

const SCIENCE = "/learn/kaelyn-adaptive/science-nature";

async function placeSortItem(page: Page, item: string, bin: string, keyboard = false) {
  const itemButton = page.getByRole("button", { name: `${item}, in the sorting tray` });
  if (keyboard) {
    await itemButton.focus();
    await page.keyboard.press("Enter");
    const binButton = page.getByRole("button", { name: `Put ${item} in ${bin}` });
    await binButton.focus();
    await page.keyboard.press("Enter");
    return;
  }
  await itemButton.click();
  await page.getByRole("button", { name: `Put ${item} in ${bin}` }).click();
}

test("sorting supports free placement, preserved wrong work, moving, and keyboard parity", async ({
  page,
}) => {
  await page.goto(`${SCIENCE}/sci-sort-living`);

  const check = page.getByRole("button", { name: "Check my groups" });
  await expect(check).toBeDisabled();

  await placeSortItem(page, "Dog", "Living", true);
  await placeSortItem(page, "Tree", "Living");
  await placeSortItem(page, "Fish", "Living");
  await placeSortItem(page, "Bird", "Living");
  await placeSortItem(page, "Rock", "Living");
  await placeSortItem(page, "Toy car", "Nonliving");
  await placeSortItem(page, "Cup", "Nonliving");
  await placeSortItem(page, "Ball", "Nonliving");

  await expect(check).toBeEnabled();
  await check.click();
  await expect(page.getByRole("status")).toContainText("One item needs another look");

  const livingItems = page.getByRole("list", { name: "Living group items" });
  const reviewItem = livingItems.getByRole("button", {
    name: /Rock, in Living.*Needs another look/i,
  });
  await expect(reviewItem).toBeVisible();
  await expect(reviewItem.getByText("Needs another look", { exact: true })).toBeVisible();
  await expect(
    livingItems.getByRole("button", { name: /Dog, in Living.*Needs another look/i }),
  ).toHaveCount(0);
  await reviewItem.click();
  await expect(page.getByRole("button", { name: "Return Rock to tray" })).toBeVisible();
  await page.getByRole("button", { name: "Put Rock in Nonliving" }).click();

  await expect(livingItems.getByRole("button", { name: /Rock, in Living/ })).toHaveCount(0);
  await expect(
    page.getByRole("list", { name: "Nonliving group items" }).getByRole("button", {
      name: /Rock, in Nonliving/,
    }),
  ).toBeVisible();

  await check.click();
  await expectSingleHostReward(page);
});

async function placeSequenceCard(page: Page, card: string, position: string, keyboard = false) {
  const cardButton = page.getByRole("button", { name: `${card}, in the card tray` });
  if (keyboard) {
    await cardButton.focus();
    await page.keyboard.press("Enter");
    const slot = page.getByRole("button", { name: `Put ${card} in ${position}` });
    await slot.focus();
    await page.keyboard.press("Enter");
    return;
  }
  await cardButton.click();
  await page.getByRole("button", { name: `Put ${card} in ${position}` }).click();
}

test("sequencing accepts any arrangement, preserves a wrong check, swaps, and Arrow-reorders", async ({
  page,
}) => {
  await page.goto(`${SCIENCE}/sci-cycle-frog`);

  await placeSequenceCard(page, "Tadpole", "1st", true);
  await placeSequenceCard(page, "Egg", "2nd");
  await placeSequenceCard(page, "Froglet", "3rd");
  await placeSequenceCard(page, "Frog", "4th");

  const check = page.getByRole("button", { name: "Check my order" });
  await check.click();
  await expect(page.getByRole("status")).toContainText("That order needs another look");
  await expect(page.getByText("Try the next one.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /1st, Tadpole/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /2nd, Egg/ })).toBeVisible();

  await page.getByRole("button", { name: /1st, Tadpole/ }).click();
  await page.getByRole("button", { name: /Put Tadpole in 2nd, swapping with Egg/ }).click();
  await expect(page.getByRole("button", { name: /1st, Egg/ })).toBeVisible();

  const egg = page.getByRole("button", { name: /1st, Egg/ });
  await egg.press("ArrowRight");
  await expect(page.getByRole("status")).toContainText("Egg moved to 2nd");
  const movedEgg = page.getByRole("button", { name: /2nd, Egg/ });
  await movedEgg.press("ArrowLeft");
  await expect(page.getByRole("button", { name: /1st, Egg/ })).toBeVisible();

  await check.click();
  await expectSingleHostReward(page);
});
