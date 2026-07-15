import { expect, test, type Page } from "@playwright/test";
import {
  E2E_LEARNER_PREFIX,
  addChild,
  expectSingleHostReward,
  selectAccountLearner,
  uniqueTag,
} from "../helpers";

/**
 * Oral reading uses a known authored sight word. The public project proves the
 * guest deep-link is useful without microphone access. The parent project opts
 * a throwaway learner in, replaces browser recording with a deterministic
 * in-page fake, and mocks the API so no audio or AI call leaves the browser.
 */

const ACTIVITY = "/learn/kaelyn-adaptive/word-study/word-oral-the";
const SENTENCE_ACTIVITY = "/learn/kaelyn-adaptive/word-study/word-sentence-see-cat";
const DECODABLE_ACTIVITY =
  "/learn/kaelyn-adaptive/decodable-readers/decodable-short-a-cvc-01";

async function installControlledModelSpeech(
  page: Page,
  autoComplete = false,
): Promise<void> {
  await page.route("**/api/tts", async (route) => {
    await route.fulfill({ status: 503, body: "neural model unavailable in this journey" });
  });
  await page.addInitScript(({ completeAutomatically }) => {
    class ControlledUtterance {
      lang = "";
      onend: ((event: SpeechSynthesisEvent) => void) | null = null;
      onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;
      pitch = 1;
      rate = 1;
      voice: SpeechSynthesisVoice | null = null;

      constructor(readonly text: string) {}
    }
    const utterances: ControlledUtterance[] = [];
    const voice = {
      default: true,
      lang: "en-US",
      localService: true,
      name: "Controlled English",
      voiceURI: "controlled-english",
    } as SpeechSynthesisVoice;
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: ControlledUtterance,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        addEventListener: () => {},
        cancel: () => {},
        getVoices: () => [voice],
        removeEventListener: () => {},
        speak: (utterance: ControlledUtterance) => {
          utterances.push(utterance);
          if (completeAutomatically) {
            queueMicrotask(() =>
              utterance.onend?.(new Event("end") as SpeechSynthesisEvent),
            );
          }
        },
      },
    });
    const controls = window as Window & {
      modelSpeechCount?: () => number;
      finishModelSpeech?: (index: number) => void;
      failModelSpeech?: (index: number) => void;
    };
    controls.modelSpeechCount = () => utterances.length;
    controls.finishModelSpeech = (index) => {
      utterances[index]?.onend?.(new Event("end") as SpeechSynthesisEvent);
    };
    controls.failModelSpeech = (index) => {
      utterances[index]?.onerror?.(
        new Event("error") as SpeechSynthesisErrorEvent,
      );
    };
  }, { completeAutomatically: autoComplete });
}

test("a guest completes through the grown-up fallback and one host reward", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "public", "guest-only assertion");

  await installControlledModelSpeech(page, true);
  await context.clearPermissions();
  await page.goto(ACTIVITY);
  await expect(page.getByText("Listen, then read this word aloud.")).toBeVisible({
    timeout: 25_000,
  });
  await expect(page.getByText("the", { exact: true })).toBeVisible();
  await expect(page.getByText("Step 1: Listen to the model")).toBeVisible();
  await page.getByRole("button", { name: "Listen to the word the" }).click();
  await expect(page.getByText("The model finished. Now it is your turn.")).toBeVisible();

  // Guests land straight on the world map and deep-links remain guest mode.
  // The microphone is never offered; the deterministic grown-up path completes.
  await expect(page.getByRole("button", { name: "Read it aloud" })).toHaveCount(0);
  const grownUp = page.getByRole("button", {
    name: "A grown-up listened - I read it",
  });
  await expect(grownUp).toBeVisible();
  await grownUp.click();
  await expectSingleHostReward(page);
});

test("a guest cold read exposes no model audio before participation fallback", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "public", "guest-only assertion");

  await context.clearPermissions();
  await page.goto(DECODABLE_ACTIVITY);
  await expect(page.getByLabel("Reading passage")).toContainText(/The\s*fat\s*cat\s*sat\./, {
    timeout: 25_000,
  });
  await expect(page.getByRole("button", { name: "Listen to the sentence" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Read this aloud" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Read it aloud" })).toHaveCount(0);
  await page.getByRole("button", { name: "Keep going" }).click();
  await expectSingleHostReward(page);
});

test("modeled practice without TTS finishes as grown-up participation only", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "public", "guest-only assertion");
  await page.addInitScript(() => {
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: undefined,
    });
    Reflect.deleteProperty(window, "SpeechSynthesisUtterance");
  });

  await page.goto(ACTIVITY);
  await expect(page.getByText("The model audio is not available.")).toBeVisible({
    timeout: 25_000,
  });
  await expect(page.getByRole("button", { name: "Listen to the word the" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Read it aloud" })).toHaveCount(0);
  await page.getByRole("button", { name: "A grown-up read it with me" }).click();
  await expectSingleHostReward(page);
});

test("modeled practice unlocks only after the model finishes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "public", "guest-only assertion");
  await installControlledModelSpeech(page);
  await page.goto(ACTIVITY);

  const listen = page.getByRole("button", { name: "Listen to the word the" });
  await listen.click();
  await expect(page.getByText("Listening to the whole model…")).toBeVisible();
  await expect(page.getByText("Now it is your turn.", { exact: false })).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as Window & { modelSpeechCount?: () => number }).modelSpeechCount?.(),
      ),
    )
    .toBeGreaterThan(0);

  await page.evaluate(() => {
    const controls = window as Window & {
      modelSpeechCount?: () => number;
      finishModelSpeech?: (index: number) => void;
    };
    controls.finishModelSpeech?.((controls.modelSpeechCount?.() ?? 1) - 1);
  });
  await expect(page.getByText("The model finished. Now it is your turn.")).toBeVisible();
});

test("a model playback failure offers the adult model instead of unlocking", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "public", "guest-only assertion");
  await installControlledModelSpeech(page);
  await page.goto(ACTIVITY);

  await page.getByRole("button", { name: "Listen to the word the" }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as Window & { modelSpeechCount?: () => number }).modelSpeechCount?.(),
      ),
    )
    .toBeGreaterThan(0);
  await page.evaluate(() => {
    const controls = window as Window & {
      modelSpeechCount?: () => number;
      failModelSpeech?: (index: number) => void;
    };
    controls.failModelSpeech?.((controls.modelSpeechCount?.() ?? 1) - 1);
  });

  await expect(page.getByRole("heading", { name: "The model audio is not available." })).toBeVisible();
  await expect(page.getByText("Now it is your turn.", { exact: false })).toHaveCount(0);
});

test("an opted-in signed-in learner settles a check and gets one host reward", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "parent", "signed-in assertion");
  const learnerName = `${E2E_LEARNER_PREFIX} ${uniqueTag()}`;

  await installControlledModelSpeech(page, true);

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
      body: JSON.stringify({
        result: "unclear",
        verificationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    });
  });

  await addChild(page, learnerName);

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
    await page.getByRole("button", { name: "Listen to the word the" }).click();
    await page.getByRole("button", { name: "Read it aloud" }).click();
    const fallbackHeading = page.getByRole("heading", { name: "Read it to a grown-up." });
    await expect(fallbackHeading).toBeVisible();
    await expect(fallbackHeading).toBeFocused();
    await expect(
      page.getByRole("status").filter({ hasText: "The microphone is optional" }),
    ).toBeAttached();

    await context.grantPermissions(["microphone"]);
    await page.evaluate(() => localStorage.setItem("e2e-oral-mic", "allow"));
    await page.goto(ACTIVITY);
    await page.getByRole("button", { name: "Listen to the word the" }).click();
    const mic = page.getByRole("button", { name: "Read it aloud" });
    await expect(mic).toBeVisible({ timeout: 25_000 });
    await mic.click();
    await expect(page.getByRole("button", { name: "Stop listening" })).toBeVisible();
    await page.getByRole("button", { name: "Stop listening" }).click();
    const unclearHeading = page.getByRole("heading", { name: "I couldn't quite hear that" });
    await expect(unclearHeading).toBeVisible();
    await expect(unclearHeading).toBeFocused();
    await expect(
      page.getByRole("status").filter({ hasText: "Listen again, try once more" }),
    ).toBeAttached();
    await page.getByRole("button", { name: "A grown-up listened - I read it" }).click();
    await expectSingleHostReward(page);
  } finally {
    await context.clearPermissions();
    await page.goto("/parent/learners");
    await page.getByRole("link", { name: learnerName }).first().click();
    await page.getByRole("button", { name: /Delete .*profile/ }).click();
    await page.getByRole("button", { name: "Confirm delete" }).click();
    await page.waitForURL("**/parent/learners", { timeout: 30_000 });
  }
});

test("sentence reading keeps mic denial safe and finishes through one host reward", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "parent", "signed-in assertion");
  const learnerName = `${E2E_LEARNER_PREFIX} ${uniqueTag()}`;

  await installControlledModelSpeech(page, true);

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
      body: JSON.stringify({
        result: "unclear",
        words: [
          { state: "unclear" },
          ...Array.from({ length: 4 }, () => ({ state: "correct" })),
        ],
        wcpm: 42,
        verificationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    });
  });

  await addChild(page, learnerName);

  try {
    await page.getByRole("link", { name: learnerName }).first().click();
    await page
      .getByRole("navigation", { name: /^Manage/ })
      .getByRole("link", { name: "Settings" })
      .click();
    const oralReading = page.getByRole("switch", { name: "Oral reading check" });
    await oralReading.click();
    await page
      .locator("section")
      .filter({ has: oralReading })
      .getByRole("button", { name: "Save changes" })
      .click();
    await expect(page.getByText("Settings saved.")).toBeVisible();

    await page.goto("/parent/learners");
    await selectAccountLearner(page, learnerName);
    await context.clearPermissions();
    await page.evaluate(() => localStorage.removeItem("e2e-oral-mic"));
    await page.goto(SENTENCE_ACTIVITY);
    await expect(page.getByLabel("Reading passage")).toBeVisible({
      timeout: 25_000,
    });
    await page.getByRole("button", { name: "Listen to the sentence" }).click();
    await page.getByRole("button", { name: "Read it aloud" }).click();
    await expect(page.getByText("Read it to a grown-up.")).toBeVisible();

    await context.grantPermissions(["microphone"]);
    await page.evaluate(() => localStorage.setItem("e2e-oral-mic", "allow"));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(SENTENCE_ACTIVITY);
    await page.getByRole("button", { name: "Listen to the sentence" }).click();
    const mic = page.getByRole("button", { name: "Read it aloud" });
    await expect(mic).toBeVisible({ timeout: 25_000 });
    await mic.click();
    const checked = page.waitForResponse("**/api/oral-reading");
    await page.getByRole("button", { name: "Stop listening" }).click();
    await checked;
    await expect(page.locator('[data-word-state="unclear"]')).toHaveCount(1);
    await expect(page.locator('[data-word-state="correct"]')).toHaveCount(4);
    const sentenceUnclearHeading = page.getByRole("heading", {
      name: "Let's try the honey words once more",
    });
    await expect(sentenceUnclearHeading).toBeVisible();
    await expect(sentenceUnclearHeading).toBeFocused();
    await expect(
      page.getByRole("status").filter({ hasText: "Tap a honey word to hear it" }),
    ).toBeAttached();
    await page.getByRole("button", { name: "A grown-up listened - I read it" }).click();
    await expectSingleHostReward(page);
  } finally {
    await context.clearPermissions();
    await page.goto("/parent/learners");
    await page.getByRole("link", { name: learnerName }).first().click();
    await page.getByRole("button", { name: /Delete .*profile/ }).click();
    await page.getByRole("button", { name: "Confirm delete" }).click();
    await page.waitForURL("**/parent/learners", { timeout: 30_000 });
  }
});

test("a decodable reader finishes through one linked host reward", async ({
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
        getUserMedia: async () => stream,
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
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "unavailable" }),
    });
  });

  await addChild(page, learnerName);

  try {
    await page.getByRole("link", { name: learnerName }).first().click();
    await page
      .getByRole("navigation", { name: /^Manage/ })
      .getByRole("link", { name: "Settings" })
      .click();
    const oralReading = page.getByRole("switch", { name: "Oral reading check" });
    await oralReading.click();
    await page
      .locator("section")
      .filter({ has: oralReading })
      .getByRole("button", { name: "Save changes" })
      .click();
    await expect(page.getByText("Settings saved.")).toBeVisible();

    await page.goto("/parent/learners");
    await selectAccountLearner(page, learnerName);
    await context.grantPermissions(["microphone"]);
    await page.goto(DECODABLE_ACTIVITY);

    const passage = page.getByLabel("Reading passage");
    // Words render as separate karaoke spans, so textContent has no spaces.
    await expect(passage).toContainText(/The\s*fat\s*cat\s*sat\./, {
      timeout: 25_000,
    });
    await expect(page.getByRole("button", { name: "Listen to the sentence" })).toHaveCount(0);
    await page.getByRole("button", { name: "Read it aloud" }).click();
    await page.getByRole("button", { name: "Stop listening" }).click();
    await expect(page.getByText("Read it to a grown-up.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Listen to the sentence" })).toHaveCount(0);
    await page.getByRole("button", { name: "A grown-up listened - I read it" }).click();
    await expectSingleHostReward(page);
  } finally {
    await context.clearPermissions();
    await page.goto("/parent/learners");
    await page.getByRole("link", { name: learnerName }).first().click();
    await page.getByRole("button", { name: /Delete .*profile/ }).click();
    await page.getByRole("button", { name: "Confirm delete" }).click();
    await page.waitForURL("**/parent/learners", { timeout: 30_000 });
  }
});
