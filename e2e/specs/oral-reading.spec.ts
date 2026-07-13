import { expect, test } from "@playwright/test";
import { E2E_LEARNER_PREFIX, selectAccountLearner, uniqueTag } from "../helpers";

/**
 * Oral reading uses a known authored sight word. The public project proves the
 * guest deep-link is useful without microphone access. The parent project opts
 * a throwaway learner in, replaces browser recording with a deterministic
 * in-page fake, and mocks the API so no audio or AI call leaves the browser.
 */

const ACTIVITY = "/learn/kaelyn-adaptive/word-study/word-oral-the";
test("a guest hears the model and completes through the grown-up fallback", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "public", "guest-only assertion");

  await context.clearPermissions();
  await page.goto(ACTIVITY);
  await expect(page.getByText("Listen, then read this word aloud.")).toBeVisible({
    timeout: 25_000,
  });
  await expect(page.getByText("the", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hear the again" })).toBeVisible();

  // Guests land straight on the world map and deep-links remain guest mode.
  // The microphone is never offered; the deterministic grown-up path completes.
  await expect(page.getByRole("button", { name: "Read it aloud" })).toHaveCount(0);
  const grownUp = page.getByRole("button", {
    name: "A grown-up listened - I read it",
  });
  await expect(grownUp).toBeVisible();
  await grownUp.click();
  await expect(page.getByText("You did it!", { exact: true })).toBeVisible();
  // Reward-screen CTAs are LINKS (Button href renders an anchor — see #57);
  // which one shows depends on whether a next activity exists, so accept
  // either forward path.
  await expect(page.getByRole("link", { name: /Keep going|Map/ }).first()).toBeVisible();
});

test("an opted-in signed-in learner gets a matched result", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "parent", "signed-in assertion");
  const learnerName = `${E2E_LEARNER_PREFIX} ${uniqueTag()}`;

  await page.addInitScript(() => {
    const stream = {
      getTracks: () => [{ stop: () => undefined }],
    };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          if (localStorage.getItem("e2e-oral-mic") !== "allow") {
            throw new DOMException("Microphone denied for test", "NotAllowedError");
          }
          return stream;
        },
      },
    });

    class FakeMediaRecorder extends EventTarget {
      static isTypeSupported(): boolean {
        return true;
      }

      state: RecordingState = "inactive";
      readonly mimeType = "audio/webm";

      start(): void {
        this.state = "recording";
      }

      stop(): void {
        if (this.state !== "recording") return;
        this.state = "inactive";
        this.dispatchEvent(
          new BlobEvent("dataavailable", {
            data: new Blob([new Uint8Array([1, 2, 3])], { type: this.mimeType }),
          }),
        );
        this.dispatchEvent(new Event("stop"));
      }
    }

    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      value: FakeMediaRecorder,
    });
  });
  await page.route("**/api/oral-reading", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ result: "matched" }),
    });
  });

  await page.goto("/parent/learners");
  await page.getByLabel("Child's name", { exact: true }).fill(learnerName);
  await page.getByRole("button", { name: "Add a child" }).click();
  await expect(page.getByRole("status")).toContainText(/enrolled/i);

  try {
    await page.getByRole("link", { name: learnerName }).first().click();
    await page
      .getByRole("navigation", { name: /^Manage/ })
      .getByRole("link", { name: "Settings" })
      .click();
    const oralReading = page.getByRole("switch", { name: "Oral reading check" });
    await expect(oralReading).not.toBeChecked();
    await oralReading.click();
    // The settings page has one "Save changes" per section (Learning & AI,
    // Interests) — scope to the section that owns the oral-reading switch.
    await page
      .locator("section")
      .filter({ has: page.getByRole("switch", { name: "Oral reading check" }) })
      .getByRole("button", { name: "Save changes" })
      .click();
    await expect(page.getByText("Settings saved.")).toBeVisible();

    await page.goto("/parent/learners");
    await selectAccountLearner(page, learnerName);
    await context.clearPermissions();
    await page.goto(ACTIVITY);
    await page.getByRole("button", { name: "Read it aloud" }).click();
    await expect(page.getByText("Read it to a grown-up.")).toBeVisible();

    await context.grantPermissions(["microphone"]);
    await page.evaluate(() => localStorage.setItem("e2e-oral-mic", "allow"));
    await page.goto(ACTIVITY);
    const mic = page.getByRole("button", { name: "Read it aloud" });
    await expect(mic).toBeVisible({ timeout: 25_000 });
    await mic.click();
    await expect(page.getByRole("button", { name: "Stop listening" })).toBeVisible();
    await page.getByRole("button", { name: "Stop listening" }).click();
    await expect(page.getByText("You read it!", { exact: true })).toBeVisible();
  } finally {
    await context.clearPermissions();
    await page.goto("/parent/learners");
    await page.getByRole("link", { name: learnerName }).first().click();
    await page.getByRole("button", { name: /Delete .*profile/ }).click();
    await page.getByRole("button", { name: "Confirm delete" }).click();
    await page.waitForURL("**/parent/learners", { timeout: 30_000 });
  }
});
