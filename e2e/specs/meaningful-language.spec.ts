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
        speak: () => {},
      },
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: SuccessfulUtterance,
    });
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
