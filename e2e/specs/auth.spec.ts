import { test, expect } from "@playwright/test";
import {
  creds,
  deleteCurrentAccount,
  signUp,
  uniqueTag,
  E2E_THROWAWAY_EMAIL_PREFIX,
} from "../helpers";

/**
 * Auth journeys (signed-out project). Bad-credential handling, plus a full
 * sign-up → land-on-dashboard → COPPA account-delete round trip on a per-run
 * THROWAWAY account, so the test cleans up the prod row it created.
 */

test("rejects wrong credentials with an inline error", async ({ page }) => {
  const { email } = creds.parent();
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("definitely-not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in/);
});

test("sign up, land on the dashboard, then delete the account", async ({ page }) => {
  const tag = uniqueTag();
  const email = `${E2E_THROWAWAY_EMAIL_PREFIX}${tag}@kaelyns.test`;
  const password = `E2e-throwaway-${tag}!A`;

  await signUp(page, "E2E Throwaway", email, password);
  await expect(page).toHaveURL(/\/parent/);

  // §8 COPPA self-service delete (also tears down the row this test created).
  await deleteCurrentAccount(page, email, password);
  await expect(page).toHaveURL(/\/goodbye/);
});
