// src/app/api/health/route.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the DB-backed column probe so we can drive ok / drift / throw without a DB.
vi.mock("@/lib/db/health", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/health")>("@/lib/db/health");
  return { ...actual, liveColumns: vi.fn() };
});
vi.mock("@/lib/capture", () => ({ captureNonCritical: vi.fn() }));

import { REQUIRED_COLUMNS, liveColumns } from "@/lib/db/health";
import { captureNonCritical } from "@/lib/capture";

/** A live column map that satisfies every REQUIRED_COLUMNS entry (→ 200 ok). */
function fullColumnMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const [table, cols] of Object.entries(REQUIRED_COLUMNS)) map[table] = [...cols];
  return map;
}

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("200 ok when every required column is present", async () => {
    vi.mocked(liveColumns).mockResolvedValue(fullColumnMap());
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("503 degraded (schema-drift) lists the missing columns, no Sentry capture", async () => {
    const map = fullColumnMap();
    map.learner = map.learner.filter((c) => c !== "settings"); // drop a required column
    vi.mocked(liveColumns).mockResolvedValue(map);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string; reason: string; missing: string[] };
    expect(body).toMatchObject({ status: "degraded", reason: "schema-drift" });
    expect(body.missing).toContain("learner.settings");
    // Drift is an expected canary trip, not an exception → not captured.
    expect(captureNonCritical).not.toHaveBeenCalled();
  });

  it("503 down with an OPAQUE reason on an internal error — never leaks err.message", async () => {
    vi.mocked(liveColumns).mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432"));
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "down", reason: "internal_error" });
    // The raw driver/host detail must not appear anywhere in the response body.
    const raw = JSON.stringify(await (await import("./route")).GET().then((r) => r.json()));
    expect(raw).not.toContain("ECONNREFUSED");
    expect(raw).not.toContain("5432");
  });

  it("throttles Sentry captures during an outage to one per process per window", async () => {
    vi.mocked(liveColumns).mockRejectedValue(new Error("db down"));
    const { GET } = await import("./route");
    // A burst of probes within the window → exactly one capture.
    for (let i = 0; i < 5; i++) {
      const res = await GET();
      expect(res.status).toBe(503);
    }
    expect(captureNonCritical).toHaveBeenCalledTimes(1);

    // After the throttle window elapses, the next failure captures again.
    vi.advanceTimersByTime(60_000);
    await GET();
    expect(captureNonCritical).toHaveBeenCalledTimes(2);
  });
});
