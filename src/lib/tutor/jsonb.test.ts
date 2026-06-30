import { beforeEach, describe, expect, it, vi } from "vitest";

// parseJsonbFailClosed is the single §8 fail-closed parse shared by every
// enrollment-config / learner-settings read. A malformed stored value must
// degrade to `{ aiPractice: false }` (BLOCK AI), never `{}` (which would leave
// aiPractice undefined → the gate wouldn't block → fail-OPEN). The Sentry capture
// is asserted via a mocked captureException so we know corruption is reported.
const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  withScope: (fn: (scope: unknown) => void) => fn({ setLevel: vi.fn() }),
  captureException: (e: unknown) => captureException(e),
}));

import { enrollmentConfigSchema, learnerSettingsSchema } from "@/lib/content/config";
import { parseJsonbFailClosed } from "./jsonb";

beforeEach(() => captureException.mockClear());

describe("parseJsonbFailClosed", () => {
  it("returns the parsed value for a valid config (no capture)", () => {
    const got = parseJsonbFailClosed(
      enrollmentConfigSchema,
      { aiPractice: true, band: "ready" },
      "enrollment config (x)",
    );
    expect(got).toEqual({ aiPractice: true, band: "ready" });
    expect(captureException).not.toHaveBeenCalled();
  });

  it("keeps a legitimately empty/absent value permissive ({}), default-allow", () => {
    // Empty and nullish both parse to {} — the gate only blocks on aiPractice===false.
    expect(parseJsonbFailClosed(enrollmentConfigSchema, {}, "x")).toEqual({});
    expect(parseJsonbFailClosed(enrollmentConfigSchema, null, "x")).toEqual({});
    expect(parseJsonbFailClosed(enrollmentConfigSchema, undefined, "x")).toEqual({});
    expect(captureException).not.toHaveBeenCalled();
  });

  it("fails CLOSED to { aiPractice: false } on a malformed config and logs", () => {
    // A hand-edited row storing the STRING "false" must not satisfy === false via
    // the raw value; safeParse fails → fail closed (blocks AI), and is reported.
    const got = parseJsonbFailClosed(
      enrollmentConfigSchema,
      { aiPractice: "false" },
      "enrollment config (learner=L slug=S)",
    );
    expect(got).toEqual({ aiPractice: false });
    expect(captureException).toHaveBeenCalledOnce();
  });

  it("fails CLOSED on out-of-range numeric fields too", () => {
    const got = parseJsonbFailClosed(enrollmentConfigSchema, { dailyGoal: 999 }, "x");
    expect(got).toEqual({ aiPractice: false });
    expect(captureException).toHaveBeenCalledOnce();
  });

  it("applies the same fail-closed default to the learner-settings schema", () => {
    const got = parseJsonbFailClosed(
      learnerSettingsSchema,
      { aiPractice: "nope" },
      "learner settings (gate learner=L)",
    );
    expect(got).toEqual({ aiPractice: false });
    expect(captureException).toHaveBeenCalledOnce();
  });

  it("parses valid learner settings unchanged", () => {
    const got = parseJsonbFailClosed(
      learnerSettingsSchema,
      { aiPractice: false, readAloud: true },
      "x",
    );
    expect(got).toEqual({ aiPractice: false, readAloud: true });
    expect(captureException).not.toHaveBeenCalled();
  });
});
