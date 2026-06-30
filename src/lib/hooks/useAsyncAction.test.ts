import { describe, expect, it, vi } from "vitest";
import { resolveActionError } from "./useAsyncAction";

// resolveActionError is the pure decision core of useAsyncAction: it is what
// every adopting form ultimately shows on failure, so the precedence MUST be
// exact. The contract: an explicit errorMessage() mapper wins; else the result's
// own message; else the caller's fallbackMessage; else a generic fallback. A
// thrown action (result === undefined) skips the mapper + the result message and
// goes straight to the fallback — the mapper is never invoked without a result.

type DemoResult =
  | { ok: true; value: number }
  | { ok: false; reason: "forbidden" | "invalid"; message?: string };

describe("resolveActionError", () => {
  it("uses the errorMessage() mapper when provided (reason-specific copy)", () => {
    const msg = resolveActionError<DemoResult>(
      { ok: false, reason: "forbidden", message: "raw" },
      {
        errorMessage: (r) =>
          r.reason === "forbidden" ? "Admins only." : (r.message ?? "Invalid."),
        fallbackMessage: "fallback",
      },
    );
    expect(msg).toBe("Admins only.");
  });

  it("falls back to the result's own message when no mapper is given", () => {
    const msg = resolveActionError<DemoResult>(
      { ok: false, reason: "invalid", message: "Slug already exists." },
      { fallbackMessage: "fallback" },
    );
    expect(msg).toBe("Slug already exists.");
  });

  it("uses fallbackMessage when an ok:false result carries no message", () => {
    const msg = resolveActionError<DemoResult>(
      { ok: false, reason: "invalid" },
      { fallbackMessage: "Could not save. Please try again." },
    );
    expect(msg).toBe("Could not save. Please try again.");
  });

  it("uses the generic fallback when there is no message and no fallbackMessage", () => {
    const msg = resolveActionError<DemoResult>({ ok: false, reason: "invalid" });
    expect(msg).toBe("Something went wrong. Please try again.");
  });

  it("returns fallbackMessage for a thrown action (result === undefined)", () => {
    const msg = resolveActionError<DemoResult>(undefined, {
      fallbackMessage: "We could not add the learner right now.",
    });
    expect(msg).toBe("We could not add the learner right now.");
  });

  it("returns the generic fallback for a throw with no fallbackMessage", () => {
    const msg = resolveActionError<DemoResult>(undefined);
    expect(msg).toBe("Something went wrong. Please try again.");
  });

  it("never invokes the mapper on a throw (no result to map)", () => {
    const errorMessage = vi.fn(() => "mapped");
    const msg = resolveActionError<DemoResult>(undefined, {
      errorMessage,
      fallbackMessage: "thrown",
    });
    expect(errorMessage).not.toHaveBeenCalled();
    expect(msg).toBe("thrown");
  });

  it("respects an empty-string mapped message (only null/undefined fall through)", () => {
    const msg = resolveActionError<DemoResult>(
      { ok: false, reason: "invalid", message: "real" },
      { errorMessage: () => "", fallbackMessage: "fallback" },
    );
    expect(msg).toBe("");
  });
});
