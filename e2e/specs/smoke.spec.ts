import { test, expect } from "@playwright/test";
import { expectRedirectToSignIn } from "../helpers";

/**
 * Smoke: public surfaces render, the health canary is green, and gated routes
 * bounce to sign-in. No auth state, no writes.
 */

test("marketing home renders the hero + sign-in entry", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Kaelyn's Academy/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/ready/i);
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Start exploring" }).first()).toBeVisible();
});

test("sign-in page renders the form", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create one" })).toBeVisible();
});

test("sign-up page renders the form", async ({ page }) => {
  await page.goto("/sign-up");
  await expect(page.getByLabel("Your name", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
});

test("health canary returns 200", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
});

test("sitemap and robots are served", async ({ request }) => {
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toMatch(/Disallow/i);
});

test("guest learner surface shows the world picker", async ({ page }) => {
  await page.goto("/learn");
  await expect(page.getByRole("heading", { name: "Pick a world" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("link", { name: /Kaelyn's Adaptive Curriculum/ })).toBeVisible();
});

test("gated routes redirect to sign-in when unauthenticated", async ({ page }) => {
  await expectRedirectToSignIn(page, "/parent");
  await expectRedirectToSignIn(page, "/admin");
});
