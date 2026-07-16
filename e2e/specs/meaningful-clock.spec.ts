import { expect, test } from "@playwright/test";
import { expectSingleHostReward } from "../helpers";

const ACTIVITY =
  "/learn/kaelyn-adaptive/life-skills-math/lsm-time-set-2";

test("set mode manipulates one coupled analog time with pointer, keyboard, and tap", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(ACTIVITY);

  const clock = page.getByRole("group", { name: /interactive clock showing 12:00/i });
  await expect(clock).toBeVisible({ timeout: 25_000 });

  const minuteHand = page.getByRole("slider", { name: "Minute hand" });
  const hourHand = page.getByRole("slider", { name: "Hour hand" });
  const check = page.getByRole("button", { name: "Check it" });
  await expect(check).toBeDisabled();
  await expect(page.getByRole("button", { name: /by 30 minutes/i })).toHaveCount(0);

  const minuteHitTarget = page.getByTestId("minute-hand-hit-target");
  const hitWidth = await minuteHitTarget.evaluate((line) => {
    const strokeWidth = Number(line.getAttribute("stroke-width"));
    const scale = (line as SVGGraphicsElement).getScreenCTM()?.a ?? 0;
    return strokeWidth * scale;
  });
  expect(hitWidth).toBeGreaterThanOrEqual(44);
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
  await expect(check).toBeEnabled();

  await minuteHand.focus();
  await minuteHand.press("ArrowRight");
  await expect(page.getByText("Current time: 1:00")).toBeVisible();
  await minuteHand.press("ArrowLeft");
  await expect(page.getByText("Current time: 12:30")).toBeVisible();

  await minuteHand.click();
  await expect(page.getByText("Current time: 1:00")).toBeVisible();
  await minuteHand.press("ArrowLeft");
  await expect(page.getByText("Current time: 12:30")).toBeVisible();

  await check.click();
  await expect(page.getByText("That time is not quite right. Keep the hands and try again.")).toBeVisible();
  await expect(page.getByText("Current time: 12:30")).toBeVisible();

  await expect(minuteHand).toHaveAttribute("aria-disabled", "false");
  await minuteHand.press("ArrowLeft");
  await minuteHand.press("ArrowLeft");
  await expect(page.getByText("Current time: 11:30")).toBeVisible();
  await check.click();

  await expectSingleHostReward(page);
});

test("read mode names the analog task without announcing the digital answer", async ({
  page,
}) => {
  await page.goto("/learn/kaelyn-adaptive/life-skills-math/lsm-time-read-1");

  await expect(
    page.getByRole("img", {
      name: "Analog clock face. Read the hour and minute hands, then choose the matching digital time.",
    }),
  ).toBeVisible({ timeout: 25_000 });
  await expect(page.getByRole("img", { name: /3:00/ })).toHaveCount(0);
});
