// src/app/api/practice/route.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/practice", () => ({ generatePracticeItems: vi.fn() }));
// Keep the real UnauthenticatedError (the route does `instanceof`); stub only the resolver.
vi.mock("@/lib/tenancy", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/tenancy")>()),
  requireAccount: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));
// Stub the store so tests don't need a real DB. Default: no config (AI enabled).
vi.mock("@/lib/tutor/store", () => ({ getEnrollmentConfig: vi.fn() }));

import { ACTIVITY_CONFIG_SCHEMAS } from "@/content/activity-configs";
import { generatePracticeItems } from "@/lib/ai/practice";
import { checkRateLimit } from "@/lib/rate-limit";
import { UnauthenticatedError, requireAccount } from "@/lib/tenancy";
import { getEnrollmentConfig } from "@/lib/tutor/store";
import { POST } from "./route";

const KIND = Object.keys(ACTIVITY_CONFIG_SCHEMAS)[0];

/** Minimal valid body — learnerId + programSlug are now required by the schema. */
function post(body: unknown): Request {
  return new Request("http://test/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BASE = { kind: KIND, band: "ready", focus: "counting", learnerId: "l-1", programSlug: "prog-1" } as const;

beforeEach(() => {
  vi.mocked(requireAccount).mockResolvedValue({ accountId: "acc-1", userId: "acc-1" });
  vi.mocked(checkRateLimit).mockReturnValue({ ok: true, retryAfterSec: 0 });
  // Default: AI practice not disabled (empty config).
  vi.mocked(getEnrollmentConfig).mockResolvedValue({});
});
afterEach(() => vi.resetAllMocks());

describe("POST /api/practice", () => {
  it("401s when there is no session, before any model call", async () => {
    vi.mocked(requireAccount).mockRejectedValue(new UnauthenticatedError());
    const res = await POST(post({ ...VALID_BASE }));
    expect(res.status).toBe(401);
    expect(generatePracticeItems).not.toHaveBeenCalled();
  });

  it("429s when the per-account rate limit is exceeded, before any model call", async () => {
    vi.mocked(checkRateLimit).mockReturnValue({ ok: false, retryAfterSec: 30 });
    const res = await POST(post({ ...VALID_BASE }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(generatePracticeItems).not.toHaveBeenCalled();
  });

  it("generates items (200) for a signed-in account under the limit", async () => {
    vi.mocked(generatePracticeItems).mockResolvedValue([]);
    const res = await POST(post({ ...VALID_BASE, focus: "counting to ten" }));
    expect(res.status).toBe(200);
    expect(generatePracticeItems).toHaveBeenCalledOnce();
    expect(await res.json()).toMatchObject({ kind: KIND, band: "ready", items: [] });
  });

  it("403s before any model call when aiPractice is disabled for the learner+program", async () => {
    vi.mocked(getEnrollmentConfig).mockResolvedValue({ aiPractice: false });
    const res = await POST(post({ ...VALID_BASE }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "ai_disabled" });
    expect(generatePracticeItems).not.toHaveBeenCalled();
  });

  it("400s when learnerId is missing (schema enforcement)", async () => {
    const { learnerId: _omit, ...body } = VALID_BASE;
    const res = await POST(post(body));
    expect(res.status).toBe(400);
    expect(generatePracticeItems).not.toHaveBeenCalled();
  });
});
