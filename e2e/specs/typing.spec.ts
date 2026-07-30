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
const WORD_WRITE = "/learn/keyboard-club/home-base/home-write"; // items ["sad","dad","ask","fall","salad"]
const ROCKET_RACE = "/learn/keyboard-club/home-base/home-race"; // words ["ask","sad","dad","fall","flask","salad"], pacerWpm 8
// Star Echo lives in unit 4 (Big Letters), which the world map shows as
// LOCKED for a fresh guest (no completions yet in home-base). That lock is a
// StudioHome-only affordance over `computeUnlockedIds` — the activity route
// itself (ActivityHost → resolvePlayableActivity) has no progress/lock check
// for guest mode, so this deep link is genuinely playable, not a workaround.
// Confirmed live against the gate server: 200, gate opens, flash/recall/
// completion all behave identically with and without reduced motion.
const STAR_ECHO = "/learn/keyboard-club/big-letters/big-echo-caps"; // sequences ["Fj","Dk","Sl"], flashMs 1400

/**
 * Open the keyboard gate. The gate proves a physical keyboard by listening for a
 * real keydown at `window`, so the press must come AFTER hydration has attached
 * that listener — pressing immediately after `goto` can land before React
 * hydrates, and the gate stays shut. Waiting for the gate's own heading first is
 * a genuine synchronization requirement, not a workaround: it asserts the gate
 * is truly showing before proving the keyboard against it.
 *
 * The gate arms the game rather than merely hiding an already-mounted Player.
 * `TypingStage` consumes the proof keydown while the inner round is unmounted;
 * the round mounts on a later render once the gate is open, so that keydown
 * cannot affect it. Key Camp therefore starts at prompt 1 of 6 with target "f".
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

  // TypingStage consumes this proof keydown to arm the game. KeysRound mounts
  // only after the gate opens, so the proof press cannot reach the drill or
  // advance its first "f" target.
  await page.keyboard.press("f");
  await expect(page.locator('[data-key="f"]')).toBeVisible();
});

test("Key Camp advances only on the right key and never punishes a wrong one", async ({
  page,
}) => {
  await openGate(page, KEY_CAMP);

  // The gate arms the game before KeysRound mounts, so its proof press cannot
  // affect the round: this is prompt 1 of 6, with "f" as the live target.
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

test("Key Camp keeps accepting typing after the shell speaker is tapped", async ({
  page,
}) => {
  await openGate(page, KEY_CAMP);

  const progress = page.getByText(/^\d+ of 6$/);
  const before = await progress.textContent();
  const target = page.locator('[data-target="true"]');
  const current = await target.getAttribute("data-key");
  expect(current).not.toBeNull();

  await page.getByRole("button", { name: "Read this aloud" }).click();

  // No guest-reachable activity has a Space target, so the trap's key can't be
  // exercised end-to-end here. Instead, pin the browser behaviour the fix rests
  // on: a pointer-tapped button takes focus WITHOUT matching :focus-visible,
  // which is precisely the state in which useTypingKeys must keep delivering
  // gameplay keys (the Space path itself is unit-tested against this state).
  const speakerFocus = await page.evaluate(() => {
    const el = document.activeElement;
    return {
      isSpeaker: el instanceof HTMLElement && el.getAttribute("aria-label") === "Read this aloud",
      focusVisible: el instanceof HTMLElement && el.matches(":focus-visible"),
    };
  });
  expect(speakerFocus.isSpeaker).toBe(true);
  expect(speakerFocus.focusVisible).toBe(false);

  await page.keyboard.press(current!);

  await expect(progress).not.toHaveText(before!);
});

test("Key Camp completes the whole drill and reports a finish", async ({ page }) => {
  // TypingStage consumes the gate's proof press before KeysRound mounts, so the
  // round is freshly armed at prompt 1. These six presses complete its six
  // prompts in authored order.
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

  // TypingStage consumes the proof keydown before CatchRound mounts, so that
  // press cannot pop a star; the old config.pool[0] coupling is now moot.
  // Reading the count before and after remains the more robust assertion shape:
  // it verifies exactly one catch without assuming a particular initial count.
  const caught = page.getByText(/^Caught \d+$/);
  const before = Number((await caught.textContent())?.match(/\d+/)?.[0] ?? "0");

  const star = page.locator("[data-falling]").first();
  await expect(star).toBeVisible({ timeout: 15_000 });
  const letter = await star.getAttribute("data-falling");
  expect(letter).not.toBeNull();

  await page.keyboard.press(letter!);
  await expect(caught).toHaveText(`Caught ${before + 1}`);
});

test("Word Write advances letter by letter and forgives a wrong key", async ({ page }) => {
  await openGate(page, WORD_WRITE);

  // First item is "sad" (authored order). A wrong key still lands in the
  // buffer (WordTiles renders it) rather than being silently swallowed; a
  // backspace un-diverges the word with no penalty (pressWordBackspace),
  // and finishing the remaining letters completes the word normally.
  await page.keyboard.type("s");
  await page.keyboard.type("x"); // wrong — enters the buffer, diverges the word
  await page.keyboard.press("Backspace"); // correction, no punishment
  await page.keyboard.type("ad");

  // Word 1 done → ProgressHint advances from "1 of 5" to "2 of 5".
  await expect(page.getByText(/2 of 5/)).toBeVisible();
});

test("Rocket Race hops the rocket forward as words finish", async ({ page }) => {
  await openGate(page, ROCKET_RACE);

  // First word is "ask" (authored order).
  await page.keyboard.type("ask");

  // ProgressHint reads "word N of 6" (RaceRound), advancing once the word
  // completes.
  await expect(page.getByText(/word 2 of 6/)).toBeVisible();

  // Assert the track in a MOTION-MODE-AGNOSTIC way: this suite runs with
  // `reducedMotion: "reduce"` under CI (playwright.config.ts) and without it
  // locally, and the two paths render different elements — the animated track
  // carries the rocket and pace comet, the reduced-motion path a static
  // "N of M words" line. `[data-race-track]` exists in both, so this pins that
  // the round rendered its progress surface without pinning one motion mode.
  // (The rocket's hop-per-completed-word geometry is unit-tested; the "word 2
  // of 6" assertion above is what proves the hop wired up end to end.)
  await expect(page.locator("[data-race-track]")).toBeVisible();
});

test("Star Echo flashes the sequence, then hides it during recall", async ({ page }) => {
  await openGate(page, STAR_ECHO);

  // Flash phase: the first authored sequence ("Fj") is shown as tiles.
  const expectedTiles = page.locator("[data-expected-position]");
  await expect(expectedTiles).toHaveCount(2);
  await expect(expectedTiles.nth(0)).toHaveText("F");
  await expect(expectedTiles.nth(1)).toHaveText("j");

  const progress = page.getByText(/^\d+ of 3$/);
  const before = await progress.textContent();

  // Recall phase: `tickEcho` flips flash → recall once flashMs (1400) elapses,
  // at which point the Player swaps `ExpectedTiles` for an eye icon + typed
  // buffer — that swap, not a fixed wait, is the actual exercise: the drill
  // is memory recall, so the sequence must be gone from the DOM once typing
  // is expected, not merely visually hidden. `pressEchoKey` also ignores
  // keystrokes during flash, so this can't be a race against phase timing.
  //
  // The flash clock itself doesn't open until the instruction utterance
  // settles (ITEM 1) — worst case that's `INSTRUCTION_HARD_CEILING_MS`
  // (4000ms, Player.tsx), a real backstop for a headless-Chromium speech
  // engine that never fires `onend`/`onerror` at all, not a hypothetical
  // one: this exact gap hung this assertion under `CI=1` before the ceiling
  // was added. On top of that, the flash -> recall transition itself now
  // also waits for the sequence's OWN essential-content speech to settle
  // (`SEQUENCE_SPEECH_HARD_CEILING_MS`, 3000ms) rather than truncating it —
  // a blind child's only channel for the sequence must not be cut short by
  // a visual-only `flashMs`. Budget = instruction ceiling + sequence
  // ceiling + flashMs + margin.
  await expect(expectedTiles).toHaveCount(0, { timeout: 12_000 });

  // "F" is capital in the authored sequence — matchesTypingTarget requires
  // shiftKey, so reaching for Shift is part of what's being exercised, not
  // an artifact of the test.
  await page.keyboard.press("Shift+F");
  await page.keyboard.press("j");
  await expect(progress).not.toHaveText(before!);
});

/**
 * A "records only expected-character data" spec (per the §8 payload note in
 * the Task 8 brief) was investigated and dropped: guest completions never
 * expose the raw response. `ActivityHost` → `useLearnerState.record` resolves
 * a guest session to the "guest" destination, which calls
 * `parseAndScoreActivity` and keeps only the derived `ActivityScore`
 * (`stars` + coarse per-skill outcome) in two `ka:`-prefixed localStorage
 * keys (`ka:progress:*`, `ka:skillstate:*`); the parsed response — where
 * `items[].missedExpected` lives — is discarded once scored, and there is no
 * network request to intercept either (recordAttemptAction, the one call
 * that would round-trip the raw response, is only reachable on the
 * "account" destination). Asserting `missedExpected` provenance for a guest
 * run would therefore only be possible with test-only instrumentation added
 * to the Player itself, which the brief's own guidance says to avoid — so
 * this spec is left unwritten rather than asserting something vacuous.
 */
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
