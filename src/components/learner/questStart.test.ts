import { describe, expect, it, vi } from "vitest";

const { captureNonCritical } = vi.hoisted(() => ({ captureNonCritical: vi.fn() }));
vi.mock("@/lib/capture", () => ({ captureNonCritical }));

import { activateOfferedQuest } from "./questStart";

describe("activateOfferedQuest", () => {
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
