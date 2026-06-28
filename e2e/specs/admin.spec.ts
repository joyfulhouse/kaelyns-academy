import { test, expect } from "@playwright/test";
import { uniqueTag } from "../helpers";

/**
 * Admin curriculum lifecycle (runs as the SEEDED admin via the `admin` project's
 * storageState; role-gated server-side).
 *
 * Catalog safety: the lifecycle test creates a uniquely-slugged DRAFT and archives
 * it. It does NOT publish by default — publishing puts a program in the LIVE pilot
 * marketplace. Set E2E_ADMIN_PUBLISH=1 to also exercise publish→archive. There is
 * no program-delete action (only archive); archived drafts are swept from the DB
 * by scripts/e2e-cleanup.sh.
 */

test("admin reaches the studio and the program list", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByRole("heading", { name: "Programs", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create a program" })).toBeVisible();
});

test("create a draft program, open its editor, then archive it", async ({ page }) => {
  const tag = uniqueTag();
  const slug = `e2e-draft-${tag}`;
  const title = `E2E Draft ${tag}`;

  await page.goto("/admin");
  await page.getByLabel("Slug", { exact: true }).fill(slug);
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Create program" }).click();

  // Create redirects to the program detail page.
  await page.waitForURL(/\/admin\/programs\/[^/]+$/, { timeout: 30_000 });
  await expect(page.getByText(title)).toBeVisible();
  const programUrl = page.url();

  // The draft's editor surface loads without error.
  await page.goto(`${programUrl}/edit`);
  await expect(page).toHaveURL(/\/admin\/programs\/[^/]+\/edit$/);
  await expect(page.getByText(/something went wrong/i)).toHaveCount(0);

  // Back on the detail page, run the lifecycle. Publishing (live catalog) is
  // opt-in; archiving is always safe and removes the program from the catalog.
  // The publish step is wrapped so that archive ALWAYS runs — a published test
  // program must never be left live in the pilot marketplace on a failure.
  await page.goto(programUrl);
  try {
    if (process.env.E2E_ADMIN_PUBLISH === "1") {
      await page.getByRole("button", { name: "Publish" }).click();
      await expect(page.getByRole("status")).toContainText(/published/i);
    }
  } finally {
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await page.getByRole("button", { name: "Confirm archive" }).click();
  }
  await expect(page.getByRole("status")).toContainText(/archived/i);
});
