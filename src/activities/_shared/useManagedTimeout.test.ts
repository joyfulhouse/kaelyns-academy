import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createManagedTimeout } from "./useManagedTimeout";

describe("createManagedTimeout", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("set schedules the callback after the delay", () => {
    const timer = createManagedTimeout();
    const cb = vi.fn();
    timer.set(cb, 900);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(899);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("clear cancels a pending callback (the unmount-cleanup path)", () => {
    const timer = createManagedTimeout();
    const cb = vi.fn();
    timer.set(cb, 900);
    timer.clear();
    vi.advanceTimersByTime(2000);
    expect(cb).not.toHaveBeenCalled();
  });

  it("set replaces a previously scheduled callback", () => {
    const timer = createManagedTimeout();
    const first = vi.fn();
    const second = vi.fn();
    timer.set(first, 500);
    timer.set(second, 500);
    vi.advanceTimersByTime(500);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("clear after the callback has fired is a safe no-op", () => {
    const timer = createManagedTimeout();
    const cb = vi.fn();
    timer.set(cb, 100);
    vi.advanceTimersByTime(100);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(() => timer.clear()).not.toThrow();
  });
});
