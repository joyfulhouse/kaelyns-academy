import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { addChild, signUp, uniqueTag } from "../helpers";

const PIN = "8642";
const PASSWORD = "e2e-pin-parent-pw-8642";
const LEARNER = "Handoff Kid";

// Fully isolated: each test signs up its OWN throwaway parent account
// (e2e-throwaway+<tag>@kaelyns.test, swept by scripts/e2e-cleanup.sh; learners
// cascade with the account). It never touches the shared seeded parent, so a
// PIN can never leak into the parent project's specs.
//
// Credential-bearing (signs up + sets a PIN), so artifacts are disabled — never
// persist fill values or captures, even on local retries.
test.use({ trace: "off", video: "off", screenshot: "off", storageState: { cookies: [], origins: [] } });

test.describe.serial("shared-device handoff and grown-up PIN", () => {
  test("set PIN → challenge → wrong rejected → correct unlocks", async ({
    browser,
    page,
  }, testInfo) => {
    await freshPinParent(page);
    let lockedContext: BrowserContext | null = null;

    try {
      await page.goto("/parent/settings#pin");
      await page.getByLabel("PIN", { exact: true }).fill(PIN);
      await page.getByLabel("Confirm PIN", { exact: true }).fill(PIN);
      await page.getByRole("button", { name: "Set PIN", exact: true }).click();
      await expect(page.getByRole("status")).toContainText("PIN saved");

      // A second browser context that keeps the session but drops the unlock
      // cookie — the shared-device "locked" state.
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
      // Scope to the challenge's own error text — a bare getByRole("alert") also
      // matches Next's __next-route-announcer__ live region (strict-mode).
      await expect(lockedPage.getByText("didn’t match")).toBeVisible();

      await lockedPage.getByLabel("Enter your grown-up PIN", { exact: true }).fill(PIN);
      await lockedPage.getByRole("button", { name: "Unlock", exact: true }).click();
      // Deterministic: a fresh SSR of /parent carrying the just-set unlock cookie
      // renders the dashboard. The in-place client router.refresh() render is
      // flaky under parallel CI load.
      await lockedPage.goto("/parent");
      await expect(
        lockedPage.getByRole("heading", { name: /How .* is doing|Welcome/ }),
      ).toBeVisible();
    } finally {
      await lockedContext?.close();
    }
  });

  test("handoff selects the learner and lands on their map without the picker", async ({
    page,
  }) => {
    await freshPinParent(page);
    const learnerId = await startHandoff(page);

    await expect(page).toHaveURL(
      new RegExp(`/learn/kaelyn-adaptive\\?handoff=${encodeURIComponent(learnerId)}$`),
    );
    expect(page.url()).not.toContain(encodeURIComponent(LEARNER));
    expect(await page.title()).not.toContain(LEARNER);

    await expect(page.getByRole("heading", { name: `Passing to ${LEARNER}` })).toBeVisible();
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
    await freshPinParent(page);
    const learnerId = await startHandoff(page);

    await expect(
      page.getByRole("heading", { name: `Passing to ${LEARNER}` }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Lock the grown-up area first?" }).click();
    await expect(page).toHaveURL(/\/parent\/settings#pin$/);
    await page.getByLabel("PIN", { exact: true }).fill(PIN);
    await page.getByLabel("Confirm PIN", { exact: true }).fill(PIN);
    await page.getByRole("button", { name: "Set PIN", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("PIN saved");

    await page.goBack();
    await expect(
      page.getByRole("heading", { name: `Passing to ${LEARNER}` }),
    ).toBeVisible();
    await page.getByRole("button", { name: "GO!", exact: true }).click();

    await expect(page).toHaveURL("/learn/kaelyn-adaptive");
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("ka:account-learner")))
      .toBe(learnerId);

    // GO re-locked the grown-up area: a fresh /parent challenges again.
    await page.goto("/parent");
    await expect(
      page.getByRole("heading", { name: "Grown-up area", exact: true }),
    ).toBeVisible();
  });
});

/** Sign up a throwaway, fully-isolated parent account for this test. */
async function freshPinParent(page: Page): Promise<void> {
  await signUp(page, "E2E PIN Parent", `e2e-throwaway+${uniqueTag()}@kaelyns.test`, PASSWORD);
}

/** Create the handoff learner, tap its handoff button, and return its id. */
async function startHandoff(page: Page): Promise<string> {
  await addChild(page, LEARNER);

  const learnerLink = page
    .locator('a[href^="/parent/learners/"]')
    .filter({ hasText: LEARNER })
    .first();
  const href = await learnerLink.getAttribute("href");
  const learnerId = href?.match(/\/parent\/learners\/([^/?#]+)$/)?.[1];
  if (!learnerId) throw new Error("Could not resolve the handoff learner id.");

  await page.getByRole("button", { name: `Hand the device to ${LEARNER}` }).first().click();
  return learnerId;
}
