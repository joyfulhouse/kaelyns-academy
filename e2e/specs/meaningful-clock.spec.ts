import { expect, test } from "@playwright/test";

const ACTIVITY =
  "/learn/kaelyn-adaptive/life-skills-math/lsm-time-set-2";

test("set mode manipulates one coupled analog time with pointer, keyboard, and tap", async ({
  page,
}) => {
  await page.goto(ACTIVITY);

  const clock = page.getByRole("group", { name: /interactive clock showing 12:00/i });
  await expect(clock).toBeVisible({ timeout: 25_000 });

  const minuteHand = page.getByRole("slider", { name: "Minute hand" });
  const hourHand = page.getByRole("slider", { name: "Hour hand" });
  const clockBox = await clock.boundingBox();
  const minuteBox = await minuteHand.boundingBox();
  expect(clockBox).not.toBeNull();
  expect(minuteBox).not.toBeNull();
  if (!clockBox || !minuteBox) return;

  await page.mouse.move(minuteBox.x + minuteBox.width / 2, minuteBox.y + 4);
  await page.mouse.down();
  await page.mouse.move(clockBox.x + clockBox.width / 2, clockBox.y + clockBox.height * 0.88, {
    steps: 8,
  });
  await page.mouse.up();

  await expect(page.getByText("Current time: 12:30")).toBeVisible();
  await expect(hourHand).toHaveAttribute("data-angle", "15");

  await minuteHand.focus();
  await minuteHand.press("ArrowRight");
  await expect(page.getByText("Current time: 1:00")).toBeVisible();
  await minuteHand.press("ArrowLeft");
  await expect(page.getByText("Current time: 12:30")).toBeVisible();

  await page.getByRole("button", { name: "Earlier by 30 minutes" }).click();
  await expect(page.getByText("Current time: 12:00")).toBeVisible();
  await page.getByRole("button", { name: "Later by 30 minutes" }).click();
  await expect(page.getByText("Current time: 12:30")).toBeVisible();

  await page.getByRole("button", { name: "Check it" }).click();
  await expect(page.getByText("That time is not quite right. Keep the hands and try again.")).toBeVisible();
  await expect(page.getByText("Current time: 12:30")).toBeVisible();

  await page.getByRole("button", { name: "Earlier by 30 minutes" }).click();
  await page.getByRole("button", { name: "Earlier by 30 minutes" }).click();
  await expect(page.getByText("Current time: 11:30")).toBeVisible();
  await page.getByRole("button", { name: "Check it" }).click();

  await expect(page.getByRole("button", { name: "Keep going" })).toHaveCount(1);
});
