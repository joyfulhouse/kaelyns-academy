import { expect, test } from "@playwright/test";
import { expectSingleHostReward } from "../helpers";

const ACTIVITY = "/learn/kaelyn-adaptive/word-study/word-r4-a1";

test("word build retains exact tile copies through correction and a sound sweep", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(ACTIVITY);

  await expect(page.getByRole("button", { name: "Hear the target word" })).toBeVisible();
  await expect(page.getByRole("button", { name: /rabbit/i })).toHaveCount(0);
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

test("speech-unavailable word builds reveal each target only through explicit help", async ({
  page,
}) => {
  await page.route("**/api/tts", async (route) => {
    await route.fulfill({ status: 503 });
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: undefined,
    });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(ACTIVITY);

  await expect(
    page.getByText("Audio isn’t available here. Show the target word to keep going."),
  ).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText("Word to build: rabbit")).toHaveCount(0);

  await page.getByRole("button", { name: "Show the target word" }).click();
  await expect(page.getByText("Word to build: rabbit")).toBeVisible();
  await page.getByRole("button", { name: "Use tile rab" }).click();
  await page.getByRole("button", { name: "Use tile bit" }).press("Enter");
  await page.getByRole("button", { name: "Check it" }).click();

  await expect(page.getByText("Word 2 of 2")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Word to build: cocoa")).toHaveCount(0);
  await page.getByRole("button", { name: "Show the target word" }).click();
  await expect(page.getByText("Word to build: cocoa")).toBeVisible();
  await page.getByRole("button", { name: "Use tile co, copy 1 of 2" }).click();
  await page.getByRole("button", { name: "Use tile co, copy 2 of 2" }).press("Space");
  await page.getByRole("button", { name: "Use tile a" }).click();
  await page.getByRole("button", { name: "Check it" }).click();

  await expectSingleHostReward(page);
  await expect(page.getByText("You earned 3 of 3 stars.")).toBeVisible();
});
