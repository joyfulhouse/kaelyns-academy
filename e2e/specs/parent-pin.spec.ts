import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import {
  E2E_PERSISTENT_LEARNER_NAME,
  creds,
  ensurePersistentLearner,
} from "../helpers";

const PIN = "8642";

// This spec re-enters the long-lived seeded parent password during cleanup.
// Never persist fill values or page captures for it, even on local retries.
test.use({ trace: "off", video: "off", screenshot: "off" });

test.describe.serial("shared-device handoff and grown-up PIN", () => {
  test("set PIN → challenge → wrong rejected → correct unlocks → password cleanup", async ({
    browser,
    page,
  }, testInfo) => {
    const { password } = creds.parent();
    await clearPinIfPresent(page, password);
    let lockedContext: BrowserContext | null = null;

    try {
      await page.goto("/parent/settings#pin");
      await page.getByLabel("PIN", { exact: true }).fill(PIN);
      await page.getByLabel("Confirm PIN", { exact: true }).fill(PIN);
      await page.getByRole("button", { name: "Set PIN", exact: true }).click();
      await expect(page.getByRole("status")).toContainText("PIN saved");

      const lockedState = await page.context().storageState();
      lockedState.cookies = lockedState.cookies.filter(
        (cookie) => cookie.name !== "ka-parent-unlock",
      );
      lockedContext = await browser.newContext({
        baseURL: testInfo.project.use.baseURL,
        storageState: lockedState,
      });
      const lockedPage = await lockedContext.newPage();

      await lockedPage.goto("/parent");
      await expect(
        lockedPage.getByRole("heading", { name: "Grown-up area", exact: true }),
      ).toBeVisible();

      await lockedPage.getByLabel("Enter your grown-up PIN", { exact: true }).fill("1111");
      await lockedPage.getByRole("button", { name: "Unlock", exact: true }).click();
      // Scope to the challenge's own error text — a bare getByRole("alert")
      // also matches Next's __next-route-announcer__ live region (strict-mode
      // violation).
      await expect(lockedPage.getByText("didn’t match")).toBeVisible();

      await lockedPage.getByLabel("Enter your grown-up PIN", { exact: true }).fill(PIN);
      await lockedPage.getByRole("button", { name: "Unlock", exact: true }).click();
      await expect(
        lockedPage.getByRole("heading", { name: /How .* is doing|Welcome/ }),
      ).toBeVisible();

      await ensurePersistentLearner(page);
      await page.goto("/parent/learners");
      await page
        .getByRole("button", { name: `Hand the device to ${E2E_PERSISTENT_LEARNER_NAME}` })
        .click();
      await expect(page).toHaveURL(/\/learn\/kaelyn-adaptive\?handoff=/);

      await page.goto("/parent");
      await expect(
        page.getByRole("heading", { name: "Grown-up area", exact: true }),
      ).toBeVisible();
    } finally {
      await lockedContext?.close();
      await clearPinIfPresent(page, password);
    }
  });

  test("handoff selects the learner and lands on their map without the picker", async ({ page }) => {
    await ensurePersistentLearner(page);
    await page.goto("/parent/learners");

    const learnerLink = page
      .locator('a[href^="/parent/learners/"]')
      .filter({ hasText: E2E_PERSISTENT_LEARNER_NAME })
      .first();
    const href = await learnerLink.getAttribute("href");
    const learnerId = href?.match(/\/parent\/learners\/([^/?#]+)$/)?.[1];
    if (!learnerId) throw new Error("Could not resolve the persistent learner id.");

    await page
      .getByRole("button", { name: `Hand the device to ${E2E_PERSISTENT_LEARNER_NAME}` })
      .click();

    await expect(page).toHaveURL(
      new RegExp(`/learn/kaelyn-adaptive\\?handoff=${encodeURIComponent(learnerId)}$`),
    );
    expect(page.url()).not.toContain(encodeURIComponent(E2E_PERSISTENT_LEARNER_NAME));
    expect(await page.title()).not.toContain(E2E_PERSISTENT_LEARNER_NAME);

    await expect(
      page.getByRole("heading", { name: `Passing to ${E2E_PERSISTENT_LEARNER_NAME}` }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Lock the grown-up area first?" })).toBeVisible();
    await page.getByRole("button", { name: "GO!", exact: true }).click();

    await expect(page).toHaveURL(/\/learn\/kaelyn-adaptive$/);
    await expect(
      page.getByRole("heading", { name: "Kaelyn's Adaptive Curriculum", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Who is learning today?", { exact: true })).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("ka:account-learner")))
      .toBe(learnerId);
  });

  test("first-PIN nudge relocks the parent area when GO is pressed", async ({ page }) => {
    const { password } = creds.parent();
    await clearPinIfPresent(page, password);

    try {
      const learnerId = await startPersistentLearnerHandoff(page);
      await expect(
        page.getByRole("heading", { name: `Passing to ${E2E_PERSISTENT_LEARNER_NAME}` }),
      ).toBeVisible();

      await page.getByRole("link", { name: "Lock the grown-up area first?" }).click();
      await expect(page).toHaveURL(/\/parent\/settings#pin$/);
      await page.getByLabel("PIN", { exact: true }).fill(PIN);
      await page.getByLabel("Confirm PIN", { exact: true }).fill(PIN);
      await page.getByRole("button", { name: "Set PIN", exact: true }).click();
      await expect(page.getByRole("status")).toContainText("PIN saved");

      await page.goBack();
      await expect(
        page.getByRole("heading", { name: `Passing to ${E2E_PERSISTENT_LEARNER_NAME}` }),
      ).toBeVisible();
      await page.getByRole("button", { name: "GO!", exact: true }).click();

      await expect(page).toHaveURL("/learn/kaelyn-adaptive");
      await expect
        .poll(() => page.evaluate(() => localStorage.getItem("ka:account-learner")))
        .toBe(learnerId);

      await page.goto("/parent");
      await expect(
        page.getByRole("heading", { name: "Grown-up area", exact: true }),
      ).toBeVisible();
    } finally {
      await clearPinIfPresent(page, password);
    }
  });
});

async function startPersistentLearnerHandoff(page: Page): Promise<string> {
  await ensurePersistentLearner(page);
  await page.goto("/parent/learners");

  const learnerLink = page
    .locator('a[href^="/parent/learners/"]')
    .filter({ hasText: E2E_PERSISTENT_LEARNER_NAME })
    .first();
  const href = await learnerLink.getAttribute("href");
  const learnerId = href?.match(/\/parent\/learners\/([^/?#]+)$/)?.[1];
  if (!learnerId) throw new Error("Could not resolve the persistent learner id.");

  await page
    .getByRole("button", { name: `Hand the device to ${E2E_PERSISTENT_LEARNER_NAME}` })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/learn/kaelyn-adaptive\\?handoff=${encodeURIComponent(learnerId)}$`),
  );
  return learnerId;
}

async function clearPinIfPresent(page: Page, password: string): Promise<void> {
  await page.goto("/parent/settings#pin");

  const challenge = page.getByRole("heading", { name: "Grown-up area", exact: true });
  if (await challenge.isVisible()) {
    await page.getByRole("button", { name: "Forgot PIN?", exact: true }).click();
    await page.getByLabel("Account password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Remove PIN", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("PIN removed");
    return;
  }

  const remove = page.getByRole("button", { name: "Remove PIN", exact: true });
  if ((await remove.count()) === 0) return;

  await page.getByLabel("Account password", { exact: true }).fill(password);
  await remove.click();
  await expect(page.getByRole("button", { name: "Set PIN", exact: true })).toBeVisible();
}
