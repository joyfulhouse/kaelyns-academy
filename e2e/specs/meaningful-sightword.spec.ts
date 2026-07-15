import { expect, test } from "@playwright/test";
import { expectSingleHostReward } from "../helpers";

const ACTIVITY = "/learn/kaelyn-adaptive/word-study/word-sight-find";

test("spoken sight-word rounds retain a wrong card and advance only on the target", async ({
  page,
}) => {
  await page.goto(ACTIVITY);

  await expect(page.getByRole("button", { name: "Show the word" })).toBeVisible({
    timeout: 25_000,
  });
  await expect(page.getByText("Target word: the")).toHaveCount(0);
  await expect(page.getByText("Word to find: the")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "the", exact: true })).toHaveCount(1);

  await page.getByRole("button", { name: "Show the word" }).click();
  await expect(page.getByText("Word to find: the")).toBeVisible();

  const wrong = page.getByRole("button", { name: "then" });
  await wrong.click();
  await expect(wrong).toBeVisible();
  await expect(wrong).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Keep that card here. Listen once more and try again.")).toBeVisible();

  const target = page.getByRole("button", { name: "the", exact: true });
  await target.focus();
  await target.press("Enter");

  await expect(page.getByText("Word to find: the")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show the word" })).toBeVisible();
  const nextTarget = page.getByRole("button", { name: "and", exact: true });
  await nextTarget.focus();
  await nextTarget.press("Space");

  await expect(page.getByRole("button", { name: "Show the word" })).toBeVisible();
  await page.getByRole("button", { name: "said", exact: true }).click();

  await expectSingleHostReward(page);
  await expect(page.getByText("You earned 2 of 3 stars.")).toBeVisible();
});

test("speech-unavailable sight-word rounds remain completable through explicit help", async ({
  page,
}) => {
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
  await page.goto(ACTIVITY);

  await expect(page.getByText("Audio isn’t available here. Show the word to keep going.")).toBeVisible({
    timeout: 25_000,
  });

  for (const target of ["the", "and", "said"]) {
    await page.getByRole("button", { name: "Show the word" }).click();
    await expect(page.getByText(`Word to find: ${target}`)).toBeVisible();
    await page.getByRole("button", { name: target, exact: true }).click();
  }

  await expectSingleHostReward(page);
  await expect(page.getByText("You earned 2 of 3 stars.")).toBeVisible();
});
