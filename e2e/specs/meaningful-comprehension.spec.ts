import { expect, test } from "@playwright/test";
import { expectSingleHostReward } from "../helpers";

const ADAPTIVE = "/learn/kaelyn-adaptive";

test("an inference answer needs retained supporting sentence evidence", async ({ page }) => {
  await page.goto(`${ADAPTIVE}/reading/reading-r3-a1`);
  await page.getByRole("button", { name: "Continue to questions" }).click();

  const answer = page.getByRole("button", { name: "Worried and looking for its mother" });
  const readingOrder = await page.evaluate(() => {
    const question = [...document.querySelectorAll("p")].find(
      (element) => element.textContent === "How does the little whale most likely feel?",
    );
    const answerChoice = [...document.querySelectorAll("button")].find(
      (element) => element.textContent?.trim() === "Worried and looking for its mother",
    );
    const evidence = document.querySelector('[aria-label="Passage evidence sentences"]');
    if (!question || !answerChoice || !evidence) return null;
    return {
      answerBeforeEvidence: Boolean(
        answerChoice.compareDocumentPosition(evidence) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
      questionBeforeEvidence: Boolean(
        question.compareDocumentPosition(evidence) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    };
  });
  expect(readingOrder).toEqual({ answerBeforeEvidence: true, questionBeforeEvidence: true });

  await answer.click();
  const wrongEvidence = page.getByRole("button", {
    name: /Evidence sentence 1: The little whale swam in circles/,
  });
  await wrongEvidence.click();
  await page.getByRole("button", { name: "Check answer and evidence" }).click();
  await expect(answer).toHaveAttribute("aria-pressed", "true");
  await expect(wrongEvidence).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Your answer fits. Look for a sentence that proves it.")).toBeVisible();

  const correctEvidence = page.getByRole("button", {
    name: /Evidence sentence 3: Its mother was nowhere in sight/,
  });
  await correctEvidence.focus();
  await correctEvidence.press("Space");
  await page.getByRole("button", { name: "Check answer and evidence" }).click();

  await page.getByRole("button", { name: "Its mother is nowhere in sight and it calls and waits" }).click();
  await page.getByRole("button", { name: /Evidence sentence 4: It made a long, low call/ }).click();
  await page.getByRole("button", { name: "Check answer and evidence" }).click();

  await expectSingleHostReward(page);
});

test("structured retell keeps a wrong event order and supports keyboard placement", async ({ page }) => {
  await page.goto(`${ADAPTIVE}/reading/reading-r2-a1`);
  await page.getByRole("button", { name: "Continue to questions" }).click();

  await page.getByRole("button", { name: "They are trapped in the tomb" }).click();
  await page.getByRole("button", { name: /Evidence sentence 2: The door slid shut/ }).click();
  await page.getByRole("button", { name: "Check answer and evidence" }).click();

  await page.getByRole("button", { name: "They follow the painted birds to a door" }).click();
  await page.getByRole("button", { name: /Evidence sentence 5: They followed the birds/ }).click();
  await page.getByRole("button", { name: "Check answer and evidence" }).click();

  await page.getByRole("button", { name: "Add event They follow the painted birds." }).click();
  await page.getByRole("button", { name: "Add event Jack and Annie enter the tomb." }).click();
  await page.getByRole("button", { name: "Add event They find the way outside." }).click();
  await page.getByRole("button", { name: "Check event order" }).click();
  await expect(page.getByText("Keep your event order and try moving a card.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Your event order" }).getByRole("listitem")).toHaveCount(3);

  await page.getByRole("button", { name: "Start event order over" }).click();
  const first = page.getByRole("button", { name: "Add event Jack and Annie enter the tomb." });
  await first.focus();
  await first.press("Enter");
  await page.getByRole("button", { name: "Add event They follow the painted birds." }).press("Space");
  await page.getByRole("button", { name: "Add event They find the way outside." }).click();
  await page.getByRole("button", { name: "Check event order" }).click();

  await expectSingleHostReward(page);
});
