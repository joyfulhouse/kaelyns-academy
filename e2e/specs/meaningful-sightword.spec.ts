import { expect, test } from "@playwright/test";
import { expectSingleHostReward } from "../helpers";

const ACTIVITY = "/learn/kaelyn-adaptive/word-study/word-sight-find";

test("spoken sight-word rounds retain a wrong card and advance only on the target", async ({
  page,
}) => {
  await page.goto(ACTIVITY);

  await expect(page.getByText("Target word: the")).toBeVisible({ timeout: 25_000 });
  const wrong = page.getByRole("button", { name: "then" });
  await wrong.click();
  await expect(wrong).toBeVisible();
  await expect(wrong).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Keep that card here. Listen once more and try again.")).toBeVisible();

  await page.getByRole("button", { name: "Hear target the" }).click();
  const target = page.getByRole("button", { name: "the", exact: true });
  await target.focus();
  await target.press("Enter");

  await expect(page.getByText("Target word: and")).toBeVisible();
  const nextTarget = page.getByRole("button", { name: "and", exact: true });
  await nextTarget.focus();
  await nextTarget.press("Space");

  await expect(page.getByText("Target word: said")).toBeVisible();
  await page.getByRole("button", { name: "said", exact: true }).click();

  await expectSingleHostReward(page);
});
