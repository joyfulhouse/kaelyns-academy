import { expect, test, type Page } from "@playwright/test";
import { expectSingleHostReward } from "../helpers";

const LANGUAGE = "/learn/world-languages/zhuyin";
const SYMBOLS = `${LANGUAGE}/zhuyin-l1-a1`;
const LISTEN = `${LANGUAGE}/zhuyin-l1-a2`;

async function installSuccessfulAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    class SuccessfulAudio extends EventTarget {
      onerror: ((event: Event) => void) | null = null;
      onended: ((event: Event) => void) | null = null;

      play(): Promise<void> {
        queueMicrotask(() => this.onended?.(new Event("ended")));
        return Promise.resolve();
      }

      pause(): void {}
    }

    Object.defineProperty(window, "Audio", {
      configurable: true,
      value: SuccessfulAudio,
    });
    class SuccessfulUtterance {
      lang = "";
      onend: ((event: SpeechSynthesisEvent) => void) | null = null;
      onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;
      pitch = 1;
      rate = 1;
      voice: SpeechSynthesisVoice | null = null;

      constructor(readonly text: string) {}
    }
    const targetVoice = {
      default: true,
      lang: "zh-TW",
      localService: true,
      name: "E2E Mandarin",
      voiceURI: "e2e-mandarin",
    } as SpeechSynthesisVoice;
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        addEventListener: () => {},
        cancel: () => {},
        getVoices: () => [targetVoice],
        removeEventListener: () => {},
        speak: (utterance: SuccessfulUtterance) => {
          queueMicrotask(() =>
            utterance.onend?.(new Event("end") as SpeechSynthesisEvent),
          );
        },
      },
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: SuccessfulUtterance,
    });
  });
}

async function installControlledSpeechFallback(page: Page): Promise<void> {
  await page.route("**/api/tts", async (route) => {
    await route.fulfill({ status: 503, body: "model unavailable in this journey" });
  });
  await page.addInitScript(() => {
    class MissingAudio extends EventTarget {
      onerror: ((event: Event) => void) | null = null;
      onended: ((event: Event) => void) | null = null;

      play(): Promise<void> {
        return Promise.reject(new Error("Clip unavailable in this journey"));
      }

      pause(): void {}
    }

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
    const targetVoice = {
      default: true,
      lang: "zh-TW",
      localService: true,
      name: "Controlled Mandarin",
      voiceURI: "controlled-mandarin",
    } as SpeechSynthesisVoice;
    Object.defineProperty(window, "Audio", { configurable: true, value: MissingAudio });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: ControlledUtterance,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        addEventListener: () => {},
        cancel: () => {},
        getVoices: () => [targetVoice],
        removeEventListener: () => {},
        speak: (utterance: ControlledUtterance) => utterances.push(utterance),
      },
    });

    const controls = window as Window & {
      lessonSpeechCount?: () => number;
      finishLessonSpeech?: (index: number) => void;
      failLessonSpeech?: (index: number) => void;
    };
    controls.lessonSpeechCount = () => utterances.length;
    controls.finishLessonSpeech = (index) => {
      utterances[index]?.onend?.(new Event("end") as SpeechSynthesisEvent);
    };
    controls.failLessonSpeech = (index) => {
      utterances[index]?.onerror?.(
        new Event("error") as SpeechSynthesisErrorEvent,
      );
    };
  });
}

async function installUnavailableAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    class UnavailableAudio extends EventTarget {
      onerror: ((event: Event) => void) | null = null;
      onended: ((event: Event) => void) | null = null;

      play(): Promise<void> {
        return Promise.reject(new Error("Audio unavailable in this journey"));
      }

      pause(): void {}
    }

    Object.defineProperty(window, "Audio", {
      configurable: true,
      value: UnavailableAudio,
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: undefined,
    });
  });
}

test("listening retains a wrong choice, reveals help on request, and finishes after corrections", async ({
  page,
}) => {
  await installSuccessfulAudio(page);
  await page.goto(LISTEN);

  const wrong = page.getByRole("button", { name: "ㄆ", exact: true });
  await expect(wrong).toBeEnabled({ timeout: 25_000 });
  await expect(page.getByText("b", { exact: true })).toHaveCount(0);
  await wrong.click();
  await expect(page.getByText("Listen once more, then choose again.")).toBeVisible();
  await expect(wrong).toBeEnabled();

  await page.getByRole("button", { name: "Show sound help" }).click();
  await expect(page.getByText("b", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "ㄅ, b", exact: true }).click();
  await page.getByRole("button", { name: "Next sound" }).click();

  for (const answer of ["ㄆ", "ㄈ", "ㄉ", "ㄋ"]) {
    const choice = page.getByRole("button", { name: answer, exact: true });
    await expect(choice).toBeEnabled();
    await choice.click();
    const action = page.getByRole("button", {
      name: answer === "ㄋ" ? "Finish" : "Next sound",
    });
    await action.click();
  }

  await expectSingleHostReward(page);
});

test("unavailable prompt audio stays retryable and cannot complete the round", async ({ page }) => {
  await installUnavailableAudio(page);
  await page.goto(LISTEN);

  await expect(page.getByText("The sound is resting.", { exact: false })).toBeVisible({
    timeout: 25_000,
  });
  const firstChoice = page.getByRole("button", { name: "ㄅ", exact: true });
  await expect(firstChoice).toBeDisabled();
  await page.getByRole("button", { name: "Try sound again" }).click();
  await expect(firstChoice).toBeDisabled();
  await expect(page.getByRole("button", { name: "Finish" })).toHaveCount(0);
});

test("listening choices unlock only after fallback speech actually finishes", async ({ page }) => {
  await installControlledSpeechFallback(page);
  await page.goto(LISTEN);

  const firstChoice = page.getByRole("button", { name: "ㄅ", exact: true });
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as Window & { lessonSpeechCount?: () => number }).lessonSpeechCount?.(),
      ),
    )
    .toBeGreaterThan(0);
  await expect(page.getByText("The sound is resting.", { exact: false })).toHaveCount(0);
  await expect(firstChoice).toBeDisabled();

  await page.evaluate(() => {
    const controls = window as Window & {
      lessonSpeechCount?: () => number;
      finishLessonSpeech?: (index: number) => void;
    };
    const count = controls.lessonSpeechCount?.() ?? 0;
    controls.finishLessonSpeech?.(count - 1);
  });
  await expect(firstChoice).toBeEnabled();
});

test("symbol introduction guides every spoken batch before forgiving verification", async ({
  page,
}) => {
  await installSuccessfulAudio(page);
  await page.goto(SYMBOLS);

  const nextBatch = page.getByRole("button", { name: "Meet next sounds" });
  await expect(nextBatch).toBeDisabled();
  await expect(page.getByRole("button", { name: /ㄅ, dad.*Hear this sound/ })).toBeVisible({
    timeout: 25_000,
  });
  await expect(page.getByRole("button", { name: /ㄉ, big.*Hear this sound/ })).toHaveCount(0);
  await expect(page.getByText("b", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Show sound help" }).click();
  await expect(page.getByText("b", { exact: true })).toBeVisible();
  const firstSymbol = page.getByRole("button", { name: /ㄅ, dad.*Hear this sound/ });
  const exampleButton = page.getByRole("button", { name: "Hear example ㄅㄚˋ" });
  const exampleBox = await exampleButton.boundingBox();
  expect(exampleBox).not.toBeNull();
  if (exampleBox) {
    expect(exampleBox.width).toBeGreaterThanOrEqual(44);
    expect(exampleBox.height).toBeGreaterThanOrEqual(44);
  }
  await exampleButton.focus();
  await page.keyboard.press("Enter");
  await expect(firstSymbol).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Example heard", { exact: true })).toBeVisible();
  for (const symbol of ["ㄆ", "ㄇ", "ㄈ"]) {
    await page.getByRole("button", { name: new RegExp(`^${symbol},`) }).click();
  }
  await expect(nextBatch).toBeEnabled();
  await nextBatch.click();

  await expect(page.getByRole("button", { name: /ㄉ, big.*Hear this sound/ })).toBeVisible();
  await expect(page.getByText("d", { exact: true })).toHaveCount(0);
  const ready = page.getByRole("button", { name: "I’m ready" });
  await expect(ready).toBeDisabled();
  for (const symbol of ["ㄉ", "ㄊ", "ㄋ", "ㄌ"]) {
    await page.getByRole("button", { name: new RegExp(`^${symbol},`) }).click();
  }
  await expect(ready).toBeEnabled();
  await ready.click();

  await expect(page.getByText("Which one says “b”, like in bà (dad)?")).toBeVisible();
  const wrong = page.getByRole("button", { name: "ㄆ", exact: true });
  await wrong.click();
  await expect(page.getByText("Look and listen once more, then choose again.")).toBeVisible();
  await expect(wrong).toBeEnabled();
  await page.getByRole("button", { name: "ㄅ", exact: true }).click();
  await page.getByRole("button", { name: "Next question" }).click();

  for (const answer of ["ㄇ", "ㄌ"]) {
    await page.getByRole("button", { name: answer, exact: true }).click();
    await page
      .getByRole("button", { name: answer === "ㄌ" ? "Finish" : "Next question" })
      .click();
  }

  await expectSingleHostReward(page);
});

test("unavailable symbol audio does not claim a genuine exposure", async ({ page }) => {
  await installUnavailableAudio(page);
  await page.goto(SYMBOLS);

  const symbol = page.getByRole("button", { name: /ㄅ, dad.*Hear this sound/ });
  const nextBatch = page.getByRole("button", { name: "Meet next sounds" });
  await expect(symbol).toHaveAttribute("aria-pressed", "false", { timeout: 25_000 });
  await symbol.click();

  await expect(page.getByText("The sound is resting.", { exact: false })).toBeVisible();
  await expect(symbol).toHaveAttribute("aria-pressed", "false");
  await expect(nextBatch).toBeDisabled();
  await page.getByRole("button", { name: "Try sound again" }).click();
  await expect(symbol).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText(/^(?:Sound|Example) heard$/)).toHaveCount(0);
});

test("cancelled symbol speech never counts as exposure", async ({ page }) => {
  await installControlledSpeechFallback(page);
  await page.goto(SYMBOLS);

  const first = page.getByRole("button", { name: /ㄅ, dad.*Hear this sound/ });
  const second = page.getByRole("button", { name: /ㄆ, grandma.*Hear this sound/ });
  await expect(first).toBeVisible({ timeout: 25_000 });

  await first.click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as Window & { lessonSpeechCount?: () => number }).lessonSpeechCount?.(),
      ),
    )
    .toBeGreaterThan(0);
  const firstRequest = await page.evaluate(() =>
    ((window as Window & { lessonSpeechCount?: () => number }).lessonSpeechCount?.() ?? 1) - 1,
  );
  await expect(first).toHaveAttribute("aria-pressed", "false");

  await second.click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as Window & { lessonSpeechCount?: () => number }).lessonSpeechCount?.(),
      ),
    )
    .toBeGreaterThan(firstRequest + 1);
  const secondRequest = await page.evaluate(() =>
    ((window as Window & { lessonSpeechCount?: () => number }).lessonSpeechCount?.() ?? 1) - 1,
  );

  await page.evaluate((index) => {
    (window as Window & { finishLessonSpeech?: (request: number) => void })
      .finishLessonSpeech?.(index);
  }, firstRequest);
  await expect(first).toHaveAttribute("aria-pressed", "false");
  await expect(second).toHaveAttribute("aria-pressed", "false");

  await page.evaluate((index) => {
    (window as Window & { finishLessonSpeech?: (request: number) => void })
      .finishLessonSpeech?.(index);
  }, secondRequest);
  await expect(second).toHaveAttribute("aria-pressed", "true");
  await expect(first).toHaveAttribute("aria-pressed", "false");
});
