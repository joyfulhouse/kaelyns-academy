// src/app/api/practice/route.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/practice", () => ({ generatePracticeItems: vi.fn() }));
// Keep the real UnauthenticatedError (the route does `instanceof`); stub only the resolver.
vi.mock("@/lib/tenancy", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/tenancy")>()),
  requireAccount: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));
// Stub the store so tests don't need a real DB. Default (set in beforeEach):
// learner is owned, an ACTIVE enrollment exists with AI allowed, and the
// per-learner settings don't disable AI — i.e. the gate opens.
vi.mock("@/lib/tutor/store", () => ({
  getLearner: vi.fn(),
  getEnrollmentForGate: vi.fn(),
  getLearnerSettings: vi.fn(),
}));

import { ACTIVITY_CONFIG_SCHEMAS } from "@/content/activity-configs";
import { generatePracticeItems } from "@/lib/ai/practice";
import { checkRateLimit } from "@/lib/rate-limit";
import { UnauthenticatedError, requireAccount } from "@/lib/tenancy";
import { getLearner, getEnrollmentForGate, getLearnerSettings } from "@/lib/tutor/store";
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
  // Default: learner owned; active enrollment with AI allowed; no settings kill-switch.
  vi.mocked(getLearner).mockResolvedValue({
    id: "l-1",
    accountId: "acc-1",
    displayName: "Test Learner",
    avatar: null,
    birthMonth: null,
  });
  vi.mocked(getEnrollmentForGate).mockResolvedValue({ status: "active", config: {} });
  vi.mocked(getLearnerSettings).mockResolvedValue({});
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

  // ── §8 AI gate: fail-closed unless owned + active enrollment + BOTH flags allow ──

  it("403s (no model call) when there is NO enrollment for the program", async () => {
    vi.mocked(getEnrollmentForGate).mockResolvedValue(null);
    const res = await POST(post({ ...VALID_BASE }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "ai_disabled" });
    expect(generatePracticeItems).not.toHaveBeenCalled();
  });

  it("403s (no model call) when the enrollment is removed (soft-removed stays blocked)", async () => {
    vi.mocked(getEnrollmentForGate).mockResolvedValue({ status: "removed", config: {} });
    const res = await POST(post({ ...VALID_BASE }));
    expect(res.status).toBe(403);
    expect(generatePracticeItems).not.toHaveBeenCalled();
  });

  it("403s (no model call) when the enrollment is paused", async () => {
    vi.mocked(getEnrollmentForGate).mockResolvedValue({ status: "paused", config: {} });
    const res = await POST(post({ ...VALID_BASE }));
    expect(res.status).toBe(403);
    expect(generatePracticeItems).not.toHaveBeenCalled();
  });

  it("403s (no model call) when the per-enrollment aiPractice flag is disabled", async () => {
    vi.mocked(getEnrollmentForGate).mockResolvedValue({ status: "active", config: { aiPractice: false } });
    const res = await POST(post({ ...VALID_BASE }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "ai_disabled" });
    expect(generatePracticeItems).not.toHaveBeenCalled();
  });

  it("403s (no model call) when the per-learner Settings kill-switch is off, even if the enrollment allows", async () => {
    vi.mocked(getLearnerSettings).mockResolvedValue({ aiPractice: false });
    vi.mocked(getEnrollmentForGate).mockResolvedValue({ status: "active", config: { aiPractice: true } });
    const res = await POST(post({ ...VALID_BASE }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "ai_disabled" });
    expect(generatePracticeItems).not.toHaveBeenCalled();
  });

  it("proceeds (200) only when owned + active enrollment + BOTH aiPractice flags allow", async () => {
    vi.mocked(generatePracticeItems).mockResolvedValue([]);
    vi.mocked(getLearnerSettings).mockResolvedValue({ aiPractice: true });
    vi.mocked(getEnrollmentForGate).mockResolvedValue({ status: "active", config: { aiPractice: true } });
    const res = await POST(post({ ...VALID_BASE }));
    expect(res.status).toBe(200);
    expect(generatePracticeItems).toHaveBeenCalledOnce();
  });

  it("404s when the learnerId is not owned by the authenticated account", async () => {
    vi.mocked(getLearner).mockResolvedValue(null);
    const res = await POST(post({ ...VALID_BASE }));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "not_found" });
    expect(generatePracticeItems).not.toHaveBeenCalled();
  });

  it("400s when learnerId is missing (schema enforcement)", async () => {
    const { learnerId: _omit, ...body } = VALID_BASE;
    const res = await POST(post(body));
    expect(res.status).toBe(400);
    expect(generatePracticeItems).not.toHaveBeenCalled();
  });
});
