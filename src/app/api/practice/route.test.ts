// src/app/api/practice/route.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/practice", () => ({ generatePracticeItems: vi.fn() }));
vi.mock("@/lib/tenancy", () => ({ getAccountOrNull: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));

import { ACTIVITY_CONFIG_SCHEMAS } from "@/content/activity-configs";
import { generatePracticeItems } from "@/lib/ai/practice";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAccountOrNull } from "@/lib/tenancy";
import { POST } from "./route";

const KIND = Object.keys(ACTIVITY_CONFIG_SCHEMAS)[0];

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://test/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(getAccountOrNull).mockResolvedValue({ accountId: "acc-1", userId: "acc-1" });
  vi.mocked(checkRateLimit).mockReturnValue({ ok: true, retryAfterSec: 0 });
});
afterEach(() => vi.resetAllMocks());

describe("POST /api/practice", () => {
  it("serves anonymous callers (no 401), keyed + capped tighter by client IP", async () => {
    vi.mocked(getAccountOrNull).mockResolvedValue(null);
    vi.mocked(generatePracticeItems).mockResolvedValue([]);
    const res = await POST(
      post({ kind: KIND, band: "ready", focus: "counting" }, { "cf-connecting-ip": "203.0.113.7" }),
    );
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(200);
    expect(checkRateLimit).toHaveBeenCalledWith("practice:ip:203.0.113.7", {
      limit: 10,
      windowMs: 60_000,
    });
  });

  it("keys signed-in callers by account with a more generous window", async () => {
    vi.mocked(generatePracticeItems).mockResolvedValue([]);
    await POST(post({ kind: KIND, band: "ready", focus: "counting" }));
    expect(checkRateLimit).toHaveBeenCalledWith("practice:acct:acc-1", {
      limit: 30,
      windowMs: 60_000,
    });
  });

  it("429s when the rate limit is exceeded, before any model call", async () => {
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
