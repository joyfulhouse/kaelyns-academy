import { test, expect } from "@playwright/test";
import { E2E_PERSISTENT_LEARNER_NAME, ensurePersistentLearner } from "../helpers";

/**
 * Adventure 2.0 Phase A motivation journeys (Task 13): the star chip + daily
 * quest board on the learner map (spec §3.4/§4.1), the sticker shop's
 * insufficient-balance path (spec §3.7), the parent Interests card
 * (spec §4.3), and the admin quest template list (spec §6).
 *
 * Fixture: a STABLE, never-deleted learner (`E2E_PERSISTENT_LEARNER_NAME`,
 * see `../helpers`) under the seeded `e2e-parent` account. Unlike
 * parent.spec.ts's per-run "E2E Kid <tag>" throwaways, this suite needs
 * continuity across reruns (star balance, quest/sticker state), and it never
 * plays any authored activity — so the fixture's star balance stays 0
 * forever. That is what keeps the sticker-purchase assertion below
 * idempotent: every run attempts (and expects to fail) the same cheapest
 * purchase, never a successful one that would need undoing.
 *
 * SEEDED-STATE ASSUMPTION: the quest-board and sticker-catalog/admin-list
 * assertions require `scripts/seed-motivation.ts` to have already run against
 * the target DB (interests / sticker packs / quest templates). Against prod
 * that is a Task 14 ship prerequisite, run once right after the first
 * deploy. The `daily-three` ("complete_n") quest template never depends on
 * recommendations or emerging-skill state (see `selectDailyQuests` /
 * `buildDraft` in `src/lib/quests/logic.ts`), so it is guaranteed to be
 * assigned to ANY actively-enrolled learner once seeded — that is why
 * "Today's Adventures" is asserted unconditionally here rather than
 * tolerating the guest-mode single-pick fallback. If this spec is ever
 * pointed at an environment where seed-motivation has NOT run (e.g. a
 * from-scratch ephemeral DB that only runs seed-content.ts — see the CI gate
 * section of e2e/README.md), these assertions will fail until an equivalent
 * seed step is added there.
 */

const ADAPTIVE_PROGRAM_SLUG = "kaelyn-adaptive";

test("learner map shows the star chip + Today's Adventures, and the sticker shop refuses an insufficient-balance purchase", async ({
  page,
}) => {
  await ensurePersistentLearner(page);

  await page.goto(`/learn/${ADAPTIVE_PROGRAM_SLUG}`);
  await page.getByRole("button", { name: /Switch learner/i }).click();
  await page.getByRole("button", { name: E2E_PERSISTENT_LEARNER_NAME, exact: true }).click();

  // Star chip (spec §3.7): renders once the account-mode rewards state
  // resolves. The balance is matched only by shape (a number) — it may be
  // exactly 0 (see the file doc comment on why the fixture stays balance-poor).
  const starChip = page.getByRole("link", { name: /^\d+ stars\. Open your sticker book\.$/ });
  await expect(starChip).toBeVisible({ timeout: 20_000 });

  // Today's Adventures (spec §4.1) — see the SEEDED-STATE ASSUMPTION above.
  await expect(page.getByRole("heading", { name: "Today's Adventures" })).toBeVisible({
    timeout: 20_000,
  });

  await starChip.click();
  await expect(page).toHaveURL(new RegExp(`/learn/${ADAPTIVE_PROGRAM_SLUG}/stickers$`));
  await expect(page.getByRole("heading", { name: "Sticker Book", level: 1 })).toBeVisible({
    timeout: 20_000,
  });

  // Attempt the cheapest seeded sticker. The fixture learner never earns
  // stars, so this always resolves to the calm insufficient-balance message —
  // never a successful purchase, which is what keeps this idempotent.
  const cheapestSticker = page.getByRole("button", { name: /^Get .+ for \d+ stars$/ }).first();
  await expect(cheapestSticker).toBeVisible({ timeout: 20_000 });
  await cheapestSticker.click();
  await expect(page.getByRole("status")).toContainText(/not enough stars yet/i);
});

test("parent learner settings shows the Interests card", async ({ page }) => {
  await ensurePersistentLearner(page);

  await page.goto("/parent/learners");
  // .first(): the list-card link's accessible name CONTAINS the learner name
  // (plus its stats), so this is a substring match; if a stray same-named row
  // exists it would be ambiguous. The test only needs to reach a learner detail
  // page, so the first match is correct.
  await page.getByRole("link", { name: E2E_PERSISTENT_LEARNER_NAME }).first().click();
  await expect(page).toHaveURL(/\/parent\/learners\/[^/]+$/);

  await page
    .getByRole("navigation", { name: /^Manage/ })
    .getByRole("link", { name: "Settings" })
    .click();
  await expect(page).toHaveURL(/\/parent\/learners\/[^/]+\/settings$/);
  await expect(page.getByRole("heading", { name: "Interests" })).toBeVisible();
});

test.describe("admin", () => {
  // Overrides the `parent` project's default storageState for just this
  // block — see that project's comment in playwright.config.ts. Both
  // e2e/.auth/*.json files exist by the time any test here runs because the
  // project depends on `setup`, which signs in both seeded accounts.
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("admin quests page lists the seeded templates", async ({ page }) => {
    await page.goto("/admin/quests");
    await expect(page.getByRole("heading", { name: "Quests", level: 1 })).toBeVisible();

    // Slugs (not titles) are the stable identity here: the try_strand and
    // practice_skill templates' authored titles contain a raw, unsubstituted
    // "{focus}" placeholder (only resolved at daily assignment), so matching
    // on slug text avoids depending on that formatting detail.
    for (const slug of ["/daily-three", "/explore-strand", "/level-up-skill"]) {
      await expect(page.getByText(slug, { exact: true })).toBeVisible();
    }
  });
});
