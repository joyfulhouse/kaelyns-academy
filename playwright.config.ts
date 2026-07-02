import { readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Load .env.local into process.env (Bun's auto-load doesn't reliably reach
// Playwright's worker processes, and this config module re-runs in each worker).
// Existing env wins, so CI can inject E2E_* directly without a file.
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
} catch {
  // .env.local is optional — env may be provided directly (e.g. in CI).
}

/**
 * E2E config for Kaelyn's Academy.
 *
 * TARGET: live production by default (`E2E_BASE_URL` overrides, e.g. a local
 * dev server). The suite is written to be a responsible citizen of the pilot
 * DB — specs create per-run, uniquely-tagged data and tear it down, never call
 * the paid AI gateway, and gate any live-catalog mutation behind an env flag.
 *
 * Auth model (Playwright project dependencies):
 *   - `setup` signs in the two SEEDED accounts (parent + admin) once and saves
 *     their storageState under e2e/.auth/ (gitignored — never commit sessions).
 *   - `parent` / `admin` projects reuse that state; `public` runs signed-out.
 *
 * Seeded creds come from env (Bun auto-loads .env.local): E2E_PARENT_EMAIL,
 * E2E_PARENT_PASSWORD, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD. See e2e/README.md.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? "https://kaelyns.academy";

// These specs WRITE to the target DB (sign-up, learner/program create+delete).
// Hitting production must be a deliberate act, never an accidental bare run or a
// CI job: targeting kaelyns.academy requires an explicit E2E_ALLOW_PROD=1.
const targetHost = new URL(BASE_URL).hostname;
const isProd = /(^|\.)kaelyns\.academy$/i.test(targetHost);
if (isProd && process.env.CI) {
  // Fail closed in CI: an automated job must never write to the pilot prod DB,
  // even if E2E_ALLOW_PROD leaked into the environment. Point CI at a disposable
  // target via E2E_BASE_URL.
  throw new Error(`Refusing to run E2E against production (${BASE_URL}) in CI.`);
}
if (isProd && process.env.E2E_ALLOW_PROD !== "1") {
  throw new Error(
    `E2E target is PRODUCTION (${BASE_URL}) and these specs mutate the database ` +
      `(sign-up, learner/program create + delete). Point E2E_BASE_URL at a local/staging ` +
      `server, or set E2E_ALLOW_PROD=1 to confirm you intend to write to prod.`,
  );
}

// Artifacts that may capture typed credentials are OFF for the setup project (it
// signs in the long-lived seeded accounts) and for any prod run — see `use` below.
const credSafeArtifacts = { trace: "off", screenshot: "off", video: "off" } as const;

export default defineConfig({
  testDir: "e2e",
  // Live prod is shared mutable state across seeded accounts — run serially so a
  // learner created in one spec can't race a teardown in another.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    // Against PROD, capture NO artifacts: the setup project types the long-lived
    // seeded parent/admin passwords, and Playwright records fill values + page
    // captures in traces/videos — which could leak those creds via test-results/
    // or a CI upload. Local/staging targets keep full artifacts for debugging.
    trace: isProd ? "off" : "on-first-retry",
    screenshot: isProd ? "off" : "only-on-failure",
    video: isProd ? "off" : "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/, use: { ...credSafeArtifacts } },
    {
      name: "public",
      testMatch: /specs\/(smoke|auth|learner)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "parent",
      // motivation.spec.ts lives here too: it's parent-authenticated by
      // default and locally overrides to the admin storageState (via
      // `test.use`) for its one admin-only assertion — see that file's doc
      // comment. Both e2e/.auth/*.json files are guaranteed to exist because
      // this project depends on `setup`, which signs in both seeded accounts.
      testMatch: /specs\/(parent|motivation)\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/parent.json" },
    },
    {
      name: "admin",
      testMatch: /specs\/admin\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/admin.json" },
    },
  ],
});
