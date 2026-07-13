import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/transcribe", () => ({ transcribeOralReading: vi.fn() }));
vi.mock("@/lib/ai/oralReadingMatch", () => ({ matchOralReading: vi.fn() }));
vi.mock("@/lib/tenancy", () => ({ getAccountOrNull: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/tutor/store", () => ({
  getEnrollmentForGate: vi.fn(),
  getLearnerSettings: vi.fn(),
}));
vi.mock("@/lib/capture", () => ({ captureNonCritical: vi.fn() }));

import { matchOralReading } from "@/lib/ai/oralReadingMatch";
import { transcribeOralReading } from "@/lib/ai/transcribe";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAccountOrNull } from "@/lib/tenancy";
import { getEnrollmentForGate, getLearnerSettings } from "@/lib/tutor/store";
import { POST } from "./route";

function post(
  overrides: { target?: string; learnerId?: string; programSlug?: string; bytes?: number } = {},
): Request {
  const form = new FormData();
  form.append("target", overrides.target ?? "there");
  form.append("learnerId", overrides.learnerId ?? "l-1");
  form.append("programSlug", overrides.programSlug ?? "kaelyn-adaptive");
  form.append(
    "file",
    new Blob([new Uint8Array(overrides.bytes ?? 12)], { type: "audio/webm" }),
    "reading.webm",
  );
  return new Request("http://test/api/oral-reading", { method: "POST", body: form });
}

beforeEach(() => {
  vi.mocked(getAccountOrNull).mockResolvedValue({ accountId: "acc-1", userId: "acc-1" });
  vi.mocked(checkRateLimit).mockReturnValue({ ok: true, retryAfterSec: 0 });
  vi.mocked(getEnrollmentForGate).mockResolvedValue({
    status: "active",
    config: { band: "ready" },
  });
  vi.mocked(getLearnerSettings).mockResolvedValue({ oralReading: true });
  vi.mocked(transcribeOralReading).mockResolvedValue("their");
  vi.mocked(matchOralReading).mockReturnValue("matched");
});

afterEach(() => vi.resetAllMocks());

describe("POST /api/oral-reading", () => {
  it("rate-limits before reading audio or calling the transcriber", async () => {
    vi.mocked(checkRateLimit).mockReturnValue({ ok: false, retryAfterSec: 20 });
    const res = await POST(post());
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("20");
    expect(await res.json()).toEqual({ result: "unavailable" });
    expect(getEnrollmentForGate).not.toHaveBeenCalled();
    expect(transcribeOralReading).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared payload before learner reads", async () => {
    const req = post();
    const oversized = new Request(req, { headers: { "content-length": "2097153" } });
    const res = await POST(oversized);
    expect(res.status).toBe(413);
    expect(getEnrollmentForGate).not.toHaveBeenCalled();
    expect(transcribeOralReading).not.toHaveBeenCalled();
  });

  it("returns 403 for guests without buffering or transcribing audio", async () => {
    vi.mocked(getAccountOrNull).mockResolvedValue(null);
    const res = await POST(post());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ result: "unavailable" });
    expect(getEnrollmentForGate).not.toHaveBeenCalled();
    expect(transcribeOralReading).not.toHaveBeenCalled();
  });

  it("requires programSlug so the enrollment gate can run", async () => {
    const form = new FormData();
    form.append("target", "there");
    form.append("learnerId", "l-1");
    form.append("file", new Blob([new Uint8Array(12)], { type: "audio/webm" }), "reading.webm");
    const res = await POST(
      new Request("http://test/api/oral-reading", { method: "POST", body: form }),
    );
    expect(res.status).toBe(400);
    expect(getEnrollmentForGate).not.toHaveBeenCalled();
  });

  it("fails closed on the §8 two-control gate: unowned learner, inactive enrollment, or mic off", async () => {
    // Unowned learner / no enrollment for the program.
    vi.mocked(getEnrollmentForGate).mockResolvedValueOnce(null);
    expect((await POST(post())).status).toBe(403);
    expect(transcribeOralReading).not.toHaveBeenCalled();

    // Enrollment exists but the parent paused it.
    vi.mocked(getEnrollmentForGate).mockResolvedValueOnce({
      status: "paused",
      config: { band: "ready" },
    });
    expect((await POST(post())).status).toBe(403);
    expect(transcribeOralReading).not.toHaveBeenCalled();

    // Active enrollment but the oralReading opt-in is off (default).
    vi.mocked(getLearnerSettings).mockResolvedValueOnce({ oralReading: false });
    expect((await POST(post())).status).toBe(403);
    expect(transcribeOralReading).not.toHaveBeenCalled();
  });

  it("transcribes, matches, and returns only the tri-state result", async () => {
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: "matched" });
    expect(getEnrollmentForGate).toHaveBeenCalledWith("acc-1", "l-1", "kaelyn-adaptive");
    expect(transcribeOralReading).toHaveBeenCalledWith(expect.any(Blob), "there");
    expect(matchOralReading).toHaveBeenCalledWith("there", "their");
  });

  it("maps every transcriber failure to unavailable without matching", async () => {
    vi.mocked(transcribeOralReading).mockRejectedValue(new Error("gateway down"));
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: "unavailable" });
    expect(matchOralReading).not.toHaveBeenCalled();
  });
});
