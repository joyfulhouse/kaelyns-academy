import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  snapshot: "server" as "server" | "live",
}));

vi.mock("react", async (importActual) => ({
  ...(await importActual<typeof import("react")>()),
  useSyncExternalStore: (
    _subscribe: unknown,
    getSnapshot: () => unknown,
    getServerSnapshot: () => unknown,
  ) => (store.snapshot === "server" ? getServerSnapshot() : getSnapshot()),
}));

import { useCoarsePointerOnly } from "./useCoarsePointerOnly";

describe("useCoarsePointerOnly", () => {
  beforeEach(() => {
    store.snapshot = "server";
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        matchMedia: vi.fn(() => ({
          addEventListener: vi.fn(),
          matches: false,
          removeEventListener: vi.fn(),
        })),
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("keeps the hydration snapshot unresolved until the media query is live", () => {
    expect(useCoarsePointerOnly()).toBeNull();

    store.snapshot = "live";
    expect(useCoarsePointerOnly()).toBe(true);
  });
});
