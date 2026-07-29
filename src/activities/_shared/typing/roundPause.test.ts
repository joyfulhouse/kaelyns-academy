import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  snapshot: "server" as "server" | "live",
  subscribe: null as null | ((onChange: () => void) => () => void),
}));

vi.mock("react", async (importActual) => ({
  ...(await importActual<typeof import("react")>()),
  useSyncExternalStore: (
    subscribe: (onChange: () => void) => () => void,
    getSnapshot: () => unknown,
    getServerSnapshot: () => unknown,
  ) => {
    store.subscribe = subscribe;
    return store.snapshot === "server" ? getServerSnapshot() : getSnapshot();
  },
}));

import { roundIsPaused, useRoundPaused } from "./roundPause";

const documentListeners = {
  add: vi.fn(),
  remove: vi.fn(),
};
const windowListeners = {
  add: vi.fn(),
  remove: vi.fn(),
};

describe("useRoundPaused", () => {
  beforeEach(() => {
    store.snapshot = "server";
    store.subscribe = null;
    vi.clearAllMocks();
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        addEventListener: documentListeners.add,
        hasFocus: () => false,
        hidden: true,
        removeEventListener: documentListeners.remove,
      },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        addEventListener: windowListeners.add,
        removeEventListener: windowListeners.remove,
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "document");
    Reflect.deleteProperty(globalThis, "window");
  });

  it("uses a stable playing snapshot for SSR and the live browser state after hydration", () => {
    expect(useRoundPaused()).toBe(false);

    store.snapshot = "live";
    expect(useRoundPaused()).toBe(true);
  });

  it("subscribes the store to visibility and focus changes", () => {
    useRoundPaused();
    const onChange = vi.fn();
    const unsubscribe = store.subscribe?.(onChange);

    expect(documentListeners.add).toHaveBeenCalledWith("visibilitychange", onChange);
    expect(windowListeners.add).toHaveBeenCalledWith("blur", onChange);
    expect(windowListeners.add).toHaveBeenCalledWith("focus", onChange);

    unsubscribe?.();
    expect(documentListeners.remove).toHaveBeenCalledWith("visibilitychange", onChange);
    expect(windowListeners.remove).toHaveBeenCalledWith("blur", onChange);
    expect(windowListeners.remove).toHaveBeenCalledWith("focus", onChange);
  });
});

describe("roundPause state", () => {
  it("pauses for a hidden document or blurred window and resumes only when both recover", () => {
    expect(roundIsPaused(false, true)).toBe(false);
    expect(roundIsPaused(true, true)).toBe(true);
    expect(roundIsPaused(false, false)).toBe(true);
    expect(roundIsPaused(true, false)).toBe(true);
  });
});
