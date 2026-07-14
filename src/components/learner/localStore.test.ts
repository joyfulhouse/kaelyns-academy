import { afterEach, describe, expect, it, vi } from "vitest";
import { writeKey } from "./localStore";

afterEach(() => vi.unstubAllGlobals());

describe("writeKey", () => {
  it("surfaces localStorage write failures", () => {
    vi.stubGlobal("window", {
      localStorage: {
        setItem: () => {
          throw new Error("storage unavailable");
        },
      },
    });

    expect(writeKey("ka:account-learner", "learner-1")).toBe(false);
  });
});
