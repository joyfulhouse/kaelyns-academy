import { expect, type Page } from "@playwright/test";

export async function expectSingleHostReward(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { name: /Wow! Three stars!|You did it!|Great trying!/ }),
  ).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Map" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Keep going" })).toHaveCount(0);
}
