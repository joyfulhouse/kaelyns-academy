import { expect, test, type Page } from "@playwright/test";
import { expectSingleHostReward } from "../helpers";

const LANGUAGE = "/learn/world-languages/zhuyin";
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
