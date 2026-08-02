import { type Locator, type Page, expect } from "@playwright/test";

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

/**
 * A STABLE, never-deleted learner under the seeded `e2e-parent` account (unlike
 * `E2E_LEARNER_PREFIX`'s per-run throwaway "E2E Kid <tag>" rows, which
 * parent.spec.ts creates and deletes within one test). The motivation suite
 * needs continuity — star balance, quest/sticker/interest state — across runs,
 * so it reuses one fixture learner instead of a fresh zero-state one each time.
 *
 * Deliberately does NOT start with "E2E Kid": scripts/e2e-cleanup.sh's sweep
 * predicate is `display_name LIKE 'E2E Kid%'`, scoped to the e2e-parent
 * account — this name must never match it, or the fixture (and the star/quest/
 * sticker/interest history riding on it) would be deleted out from under the
 * suite on the next cleanup run.
 */
export const E2E_PERSISTENT_LEARNER_NAME = "E2E Learner";

/**
 * Player completion must resolve to one host-owned reward. ActivityHost renders
 * link CTAs; a same-named button would reveal a stale Player reward phase.
 */
export async function expectSingleHostReward(page: Page): Promise<void> {
  const heading = page.getByRole("heading", {
    name: /Wow! Three stars!|You did it!|Great trying!/,
  });
  await expect(heading).toHaveCount(1, { timeout: 20_000 });
  await expect(heading).toBeFocused();
  await expect(page.getByRole("button", { name: "Keep going" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Keep going|Map/ }).first()).toBeVisible();
}

/**
 * Keep the neural route unavailable while making unrelated browser speech
 * succeed. This catches activity UIs that accidentally treat one shared
 * controller outcome as the status of a specific target-audio request.
 */
export async function installSelectiveBrowserSpeech(
  page: Page,
  unavailableTextPattern: string,
): Promise<void> {
  await page.addInitScript(({ pattern }) => {
    class SelectiveUtterance {
      lang = "";
      onend: ((event: SpeechSynthesisEvent) => void) | null = null;
      onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;
      pitch = 1;
      rate = 1;
      voice: SpeechSynthesisVoice | null = null;

      constructor(readonly text: string) {}
    }

    const unavailable = new RegExp(pattern);
    const voice = {
      default: true,
      lang: "en-US",
      localService: true,
      name: "Selective English",
      voiceURI: "selective-english",
    } as SpeechSynthesisVoice;
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: SelectiveUtterance,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        addEventListener: () => {},
        cancel: () => {},
        getVoices: () => [voice],
        removeEventListener: () => {},
        speak: (utterance: SelectiveUtterance) => {
          queueMicrotask(() => {
            if (unavailable.test(utterance.text)) {
              utterance.onerror?.(new Event("error") as SpeechSynthesisErrorEvent);
            } else {
              utterance.onend?.(new Event("end") as SpeechSynthesisEvent);
            }
          });
        },
      },
    });
  }, { pattern: unavailableTextPattern });
}

/** Exercise Pointer Events directly; native dragTo dispatches HTML drag events instead. */
export async function dragPointer(page: Page, source: Locator, target: Locator): Promise<void> {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error("Pointer drag endpoints are not rendered");

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
}

/**
 * The learner card link for exactly `name`.
 *
 * A card's accessible name is its heading PLUS the program line and the stat
 * pills ("E2E Learner Kaelyn's Adventure · 7 strands 0 solid …"), so
 * `getByRole("link", { name })` is a SUBSTRING match and `exact: true` cannot
 * be used to tighten it. Filtering the card anchor by its exact `h3` is the
 * only way to name one learner and mean it — otherwise a learner whose name
 * merely contains another's silently wins.
 */
export function learnerCardLink(page: Page, name: string): Locator {
  return page
    .locator('a[href^="/parent/learners/"]')
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
}

/**
 * Find-or-create the persistent motivation-suite learner on `/parent/learners`.
 * Idempotent: a second (or Nth) call across reruns finds the existing row and
 * does nothing. Creating a learner here auto-enrolls them in the adaptive
 * program (`createLearnerAction` → `ensureEnrollment(..., "kaelyn-adaptive")`),
 * so once created this learner can always reach `/learn/kaelyn-adaptive`.
 */
export async function ensurePersistentLearner(page: Page): Promise<void> {
  await page.goto("/parent/learners");
  // `count()` does NOT auto-wait. Counting straight after `goto` can read 0
  // while the list is still arriving, and this helper then "helpfully" creates
  // a learner that already exists — which is how the seeded account ended up
  // with two rows both named "E2E Learner" (2026-08-01). Two identical names
  // then make every downstream `.first()` pick between them arbitrarily, so the
  // suite silently asserts against whichever learner won. Anchor on the
  // always-present add form so the page is genuinely rendered before counting.
  //
  // Still a check-then-create, deliberately. Two SIMULTANEOUS suite invocations
  // against the same account could both observe zero and insert; a unique key or
  // seeded fixture id would close that. Not worth it here: playwright.config
  // pins `fullyParallel: false, workers: 1`, a retry re-enters this helper and
  // takes the find branch, and AddChildForm guards re-entrancy with
  // `if (pending) return` — so nothing the suite itself does can duplicate once
  // the count above actually waits.
  await expect(page.getByLabel("Child's name", { exact: true })).toBeVisible();
  if ((await learnerCardLink(page, E2E_PERSISTENT_LEARNER_NAME).count()) > 0) return;

  await addChild(page, E2E_PERSISTENT_LEARNER_NAME);
}

/**
 * Remove any grown-up PIN from the currently signed-in parent account, whether
 * the account is currently locked (recover via password) or unlocked (remove
 * via password). No-op when no PIN is set. Used by auth setup to guarantee a
 * PIN-free baseline — a parent-pin run that failed before its own cleanup must
 * not leave the shared seeded account gated for the next run's parent project.
 */
export async function clearParentPinIfPresent(page: Page, password: string): Promise<void> {
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

/**
 * Add a child on /parent/learners and return once the new learner is reliably
 * listed. After the "enrolled" confirmation it forces a fresh SSR of the list
 * (a hard navigation) instead of trusting AddChildForm's client
 * `router.refresh()`, which under parallel CI load can leave the new learner
 * link un-rendered past a find timeout — the source of the parent-project
 * flakiness. A fresh server render always includes the just-created learner.
 */
export async function addChild(page: Page, name: string): Promise<void> {
  await page.goto("/parent/learners");
  await page.getByLabel("Child's name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Add a child" }).click();
  await expect(page.getByRole("status")).toContainText(/enrolled/i);
  await page.goto("/parent/learners");
  await expect(learnerCardLink(page, name).first()).toBeVisible({ timeout: 30_000 });
}

/**
 * Delete a throwaway learner via the two-click confirm on their detail page.
 * Teardown counterpart to `addChild`; returns once the list has reloaded.
 */
export async function deleteLearner(page: Page, name: string): Promise<void> {
  await page.goto("/parent/learners");
  await learnerCardLink(page, name).first().click();
  await page.getByRole("button", { name: /Delete .*profile/ }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await page.waitForURL("**/parent/learners", { timeout: 30_000 });
}

/** Seed the account learner choice deterministically before entering kid routes. */
export async function selectAccountLearner(page: Page, displayName: string): Promise<void> {
  const href = await learnerCardLink(page, displayName).first().getAttribute("href");
  const learnerId = href?.match(/\/parent\/learners\/([^/?#]+)$/)?.[1];
  if (!learnerId) throw new Error(`Could not resolve learner id for ${displayName}`);
  await page.evaluate((id) => localStorage.setItem("ka:account-learner", id), learnerId);
}

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
