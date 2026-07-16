import { expect, test } from "@playwright/test";
import { expectSingleHostReward } from "../helpers";

const COMPOSE_JOURNAL = "/learn/kaelyn-adaptive/writing/writing-r2-a1";

test("compose keeps the caret stable, offers calm microphone fallback, and clears qualification", async ({
  page,
}) => {
  await page.goto(COMPOSE_JOURNAL);

  const idea = page.getByRole("textbox", { name: "Write your idea" });
  const done = page.getByRole("button", { name: "I'm done" });
  await expect(done).toBeDisabled();

  await idea.fill("The erupted.");
  await idea.evaluate((element) => {
    const textarea = element as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(4, 4);
  });
  await page.getByRole("button", { name: "Add magma at the caret or next blank" }).click();
  await expect(idea).toHaveValue("The magma erupted.");

  await expect(
    page.getByText(/Talk to write|microphone is not available|microphone needs a break/i).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear idea" }).click();
  await expect(idea).toHaveValue("");
  await expect(done).toBeDisabled();

  await page.getByRole("button", { name: "The volcano erupted because ______." }).click();
  await expect(idea).toHaveValue("The volcano erupted because ______.");
  await expect(done).toBeDisabled();

  await page.getByRole("button", { name: "Add pressure at the caret or next blank" }).click();
  await expect(idea).toHaveValue("The volcano erupted because pressure.");
  await expect(done).toBeEnabled();

  await idea.evaluate((element) => {
    const textarea = element as HTMLTextAreaElement;
    const start = textarea.value.indexOf("pressure");
    textarea.focus();
    textarea.setSelectionRange(start, start + "pressure".length);
  });
  await idea.press("Backspace");
  await expect(idea).toHaveValue("The volcano erupted because .");
  await expect(done).toBeDisabled();

  const clear = page.getByRole("button", { name: "Clear idea" });
  await expect(clear).toBeEnabled();
  await clear.click();
  await expect(idea).toHaveValue("");
  await expect(done).toBeDisabled();

  await page.getByRole("button", { name: "The volcano erupted because ______." }).click();
  await expect(done).toBeDisabled();
  await page.getByRole("button", { name: "Add pressure at the caret or next blank" }).click();
  await expect(done).toBeEnabled();

  await done.click();
  await expectSingleHostReward(page);
});
