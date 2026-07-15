import { test as setup } from "@playwright/test";
import { clearParentPinIfPresent, creds, signIn } from "./helpers";

/**
 * Auth setup: sign in the two SEEDED accounts once and persist their session so
 * the parent/admin projects start authenticated. Runs before those projects
 * (see `dependencies` in playwright.config.ts). Saved state is gitignored.
 */

setup("authenticate as parent", async ({ page }) => {
  const { email, password } = creds.parent();
  await signIn(page, email, password);
  // Guarantee a PIN-free baseline so the parent project is never gated by a PIN
  // a prior parent-pin run left behind (its own cleanup runs after this).
  await clearParentPinIfPresent(page, password);
  await page.context().storageState({ path: "e2e/.auth/parent.json" });
});

setup("authenticate as admin", async ({ page }) => {
  const { email, password } = creds.admin();
  await signIn(page, email, password);
  await page.context().storageState({ path: "e2e/.auth/admin.json" });
});
