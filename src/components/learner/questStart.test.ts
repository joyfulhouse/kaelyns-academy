import { describe, expect, it, vi } from "vitest";

const { captureNonCritical } = vi.hoisted(() => ({ captureNonCritical: vi.fn() }));
vi.mock("@/lib/capture", () => ({ captureNonCritical }));

import { activateOfferedQuest } from "./questStart";

describe("activateOfferedQuest", () => {
  it("refuses to activate an offered quest without a playable destination", async () => {
    const activate = vi.fn();
    const navigate = vi.fn();

    await expect(
      activateOfferedQuest({ id: "quest-1", href: null, activate, navigate }),
    ).resolves.toBe(false);

    expect(activate).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("reports a failed activation and does not navigate", async () => {
    const error = new Error("activation unavailable");
    const navigate = vi.fn();

    await expect(
      activateOfferedQuest({
        id: "quest-1",
        href: "/learn/program/unit/activity",
        activate: vi.fn().mockRejectedValue(error),
        navigate,
      }),
    ).resolves.toBe(false);

    expect(captureNonCritical).toHaveBeenCalledWith("Quest activation failed", error);
    expect(navigate).not.toHaveBeenCalled();
  });
});
