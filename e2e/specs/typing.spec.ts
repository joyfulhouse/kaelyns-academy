import { expect, test, type Page } from "@playwright/test";
import { expectSingleHostReward } from "../helpers";

/**
 * Keyboard Club — guest mode, no account, no DB writes (guest progress is
 * localStorage-only, same posture as science.spec.ts / life-skills-math.spec.ts).
 *
 * Typing is the one place the vitest `node` environment cannot reach at all
 * (no DOM, no real keydown events), so these specs are the only coverage for:
 * the gate opening on a genuine keypress, the interval/pause wiring behind
 * Star Catch, and the touch-only block. `page.keyboard.press` drives a real
 * `keydown`, which is exactly what `useTypingKeys` listens for at `window`.
 *
 * Home Base / "Meet the Home Row" (order 1) is unlocked for a fresh guest, so
 * these deep-link straight to authored activities rather than clicking through
 * the world map.
 */

const KEY_CAMP = "/learn/keyboard-club/home-base/home-fj"; // keys ["f","j"], reps 3 → 6 prompts
const STAR_CATCH = "/learn/keyboard-club/home-base/home-catch-gentle"; // pool a-s-d-f-j-k-l, gentle (8s fall)

/**
 * Open the keyboard gate. The gate proves a physical keyboard by listening for a
 * real keydown at `window`, so the press must come AFTER hydration has attached
 * that listener — pressing immediately after `goto` can land before React
 * hydrates, and the gate stays shut. Waiting for the gate's own heading first is
 * a genuine synchronization requirement, not a workaround: it asserts the gate
 * is truly showing before proving the keyboard against it.
 *
 * The proof keypress is NOT absorbed by the gate — the Player is already
 * mounted underneath it, so this keydown reaches the drill too. For Key Camp
 * that means the gate's proof key ("f") also satisfies the drill's first
 * target whenever the drill's first key happens to be "f" (e.g. home-fj).
 * Callers must not assume which prompt the drill is on right after
 * `openGate()` returns — read the live target from the DOM instead.
 */
async function openGate(page: Page, url: string) {
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: "Press the F key to start" }),
  ).toBeVisible({ timeout: 25_000 });
  await page.keyboard.press("f");
}

test("the gate asks for a real keypress before revealing the drill", async ({ page }) => {
  await page.goto(KEY_CAMP);

  // Blocked-by-default screen: named for the proof key, no drill DOM yet.
  await expect(
    page.getByRole("heading", { name: "Press the F key to start" }),
  ).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('[data-key="f"]')).toHaveCount(0);

  // This keydown is not absorbed by the gate — the Player is already mounted
  // underneath it, so the same press both proves the keyboard and reaches the
  // drill (Key Camp's first target here is also "f").
  await page.keyboard.press("f");
  await expect(page.locator('[data-key="f"]')).toBeVisible();
});

test("Key Camp advances only on the right key and never punishes a wrong one", async ({
  page,
}) => {
  await openGate(page, KEY_CAMP);

  // The gate's proof key also reaches the drill (see openGate's doc comment),
  // so don't assume which prompt we land on — read the live target instead.
  const target = page.locator('[data-target="true"]');
  await expect(target).toBeVisible();
  const current = await target.getAttribute("data-key");
  expect(current).not.toBeNull();

  const progress = page.getByText(/^\d+ of 6$/);
  const before = await progress.textContent();

  // A wrong key holds position — no penalty, no advance. Key Camp only has
  // two keys (f, j), so whichever one isn't the current target is a safe,
  // deliberately-wrong press.
  const wrong = current === "f" ? "j" : "f";
  await page.keyboard.press(wrong);
  await expect(progress).toHaveText(before!);
  await expect(target).toHaveAttribute("data-key", current!);

  // The correct key advances both the progress counter and the target.
  await page.keyboard.press(current!);
  await expect(progress).not.toHaveText(before!);
  await expect(target).not.toHaveAttribute("data-key", current!);
});

test("Key Camp completes the whole drill and reports a finish", async ({ page }) => {
  // The gate's proof press ("f") also reaches the drill and satisfies its
  // first target, so this loop presses one more key than there are remaining
  // prompts — the invariant proven above (a wrong key holds position, no
  // penalty) is what makes that leading "f" harmless here too.
  await openGate(page, KEY_CAMP);

  for (const key of ["f", "j", "f", "j", "f", "j"]) {
    await page.keyboard.press(key);
  }

  // ActivityHost's own reward screen (a heading + link CTAs), not a Player-level
  // "again/next" button — expectSingleHostReward also guards against a stale
  // Player reward phase bleeding through underneath the host's.
  await expectSingleHostReward(page);
});

test("Star Catch pops a falling star when its letter is typed", async ({ page }) => {
  await openGate(page, STAR_CATCH);

  const star = page.locator("[data-falling]").first();
  await expect(star).toBeVisible({ timeout: 15_000 });
  const letter = await star.getAttribute("data-falling");
  expect(letter).not.toBeNull();

  await page.keyboard.press(letter!);
  await expect(page.getByText("Caught 1")).toBeVisible();
});

test("a touch-only device is told to come back on a computer", async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 820, height: 1180 },
  });
  const page = await context.newPage();
  await page.goto(KEY_CAMP);

  await expect(page.getByRole("heading", { name: "Typing needs a keyboard" })).toBeVisible({
    timeout: 25_000,
  });
  await expect(page.locator('[data-key="f"]')).toHaveCount(0);

  await context.close();
});
