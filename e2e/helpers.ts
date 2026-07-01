import { type Page, expect } from "@playwright/test";

/**
 * Shared E2E helpers. Credentials come from env (Bun auto-loads .env.local):
 * the two SEEDED accounts plus per-run throwaway accounts created by the auth spec.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env ${name}. Set it in .env.local — see e2e/README.md.`);
  }
  return value;
}

export const creds = {
  parent: () => ({
    email: requireEnv("E2E_PARENT_EMAIL"),
    password: requireEnv("E2E_PARENT_PASSWORD"),
  }),
  admin: () => ({
    email: requireEnv("E2E_ADMIN_EMAIL"),
    password: requireEnv("E2E_ADMIN_PASSWORD"),
  }),
};

/**
 * Per-run unique token. These specs hit a shared live DB, so every created
 * artifact (learner name, throwaway email, draft slug) is tagged unique to keep
 * parallel/rerun safety and make teardown sweeps unambiguous.
 */
export function uniqueTag(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Recognisable prefixes so a DB sweep can find anything a failed run leaves behind. */
export const E2E_LEARNER_PREFIX = "E2E Kid";
export const E2E_THROWAWAY_EMAIL_PREFIX = "e2e-throwaway+";

export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/parent", { timeout: 30_000 });
}

export async function signUp(
  page: Page,
  name: string,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/sign-up");
  await page.getByLabel("Your name", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/parent", { timeout: 30_000 });
}

/** Permanently delete the currently signed-in account via the §8 re-auth flow. */
export async function deleteCurrentAccount(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/parent/settings");
  await page.getByRole("button", { name: "Delete account" }).click();
  await page.getByLabel("Your account email", { exact: true }).fill(email);
  await page.getByLabel("Your password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Permanently delete" }).click();
  await page.waitForURL("**/goodbye", { timeout: 30_000 });
}

/** Assert a route requires auth: an unauthenticated visit lands on /sign-in. */
export async function expectRedirectToSignIn(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForURL("**/sign-in", { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
}
