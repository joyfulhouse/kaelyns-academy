// src/app/api/practice/route.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/practice", () => ({ generatePracticeItems: vi.fn() }));
// Keep the real UnauthenticatedError (the route does `instanceof`); stub only the resolver.
vi.mock("@/lib/tenancy", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/tenancy")>()),
  requireAccount: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));

import { ACTIVITY_CONFIG_SCHEMAS } from "@/content/activity-configs";
import { generatePracticeItems } from "@/lib/ai/practice";
import { checkRateLimit } from "@/lib/rate-limit";
import { UnauthenticatedError, requireAccount } from "@/lib/tenancy";
import { POST } from "./route";

const KIND = Object.keys(ACTIVITY_CONFIG_SCHEMAS)[0];

function post(body: unknown): Request {
  return new Request("http://test/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(requireAccount).mockResolvedValue({ accountId: "acc-1", userId: "acc-1" });
  vi.mocked(checkRateLimit).mockReturnValue({ ok: true, retryAfterSec: 0 });
});
afterEach(() => vi.resetAllMocks());

describe("POST /api/practice", () => {
  it("401s when there is no session, before any model call", async () => {
    vi.mocked(requireAccount).mockRejectedValue(new UnauthenticatedError());
    const res = await POST(post({ kind: KIND, band: "ready", focus: "counting" }));
    expect(res.status).toBe(401);
    expect(generatePracticeItems).not.toHaveBeenCalled();
  });

  it("429s when the per-account rate limit is exceeded, before any model call", async () => {
    vi.mocked(checkRateLimit).mockReturnValue({ ok: false, retryAfterSec: 30 });
    const res = await POST(post({ kind: KIND, band: "ready", focus: "counting" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(generatePracticeItems).not.toHaveBeenCalled();
  });

  it("generates items (200) for a signed-in account under the limit", async () => {
    vi.mocked(generatePracticeItems).mockResolvedValue([]);
    const res = await POST(post({ kind: KIND, band: "ready", focus: "counting to ten" }));
    expect(res.status).toBe(200);
    expect(generatePracticeItems).toHaveBeenCalledOnce();
    expect(await res.json()).toMatchObject({ kind: KIND, band: "ready", items: [] });
  });
});
