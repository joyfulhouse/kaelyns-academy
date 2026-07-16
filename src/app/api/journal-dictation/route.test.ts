import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/transcribe", () => ({ transcribeOralReading: vi.fn() }));
vi.mock("@/lib/tenancy", () => ({ getAccountOrNull: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/tutor/store", () => ({
  getEnrollmentForGate: vi.fn(),
  getLearnerSettings: vi.fn(),
}));
vi.mock("@/lib/content/repository", () => ({ resolveProgramForEnrollmentVersion: vi.fn() }));
vi.mock("@/lib/capture", () => ({ captureNonCritical: vi.fn() }));

import { transcribeOralReading } from "@/lib/ai/transcribe";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAccountOrNull } from "@/lib/tenancy";
import { getEnrollmentForGate, getLearnerSettings } from "@/lib/tutor/store";
import { resolveProgramForEnrollmentVersion } from "@/lib/content/repository";
import type { Program } from "@/content";
import { POST } from "./route";

const PROGRAM = {
  slug: "kaelyn-adaptive",
  title: "Writing",
  subtitle: "",
  ageBand: "",
  summary: "",
  units: [
    {
      id: "unit-1",
      order: 1,
      title: "Write",
      emoji: "✏️",
      world: "sunshine",
      bigIdea: "",
      phonicsFocus: "",
      mathFocus: "",
      project: "",
      lessons: [
        {
          id: "lesson-1",
          order: 1,
          title: "Journal",
          activities: [
            {
              id: "journal-dictate",
              kind: "journal-prompt",
              title: "Tell about your day",
              band: "ready",
              skillTags: ["writing.compose"],
              config: {
                prompt: "What did you do today?",
                mode: "compose",
                allowModes: ["type", "dictate"],
              },
            },
            {
              id: "journal-type-only",
              kind: "journal-prompt",
              title: "Type about your day",
              band: "ready",
              skillTags: ["writing.compose"],
              config: {
                prompt: "What did you do today?",
                mode: "compose",
                allowModes: ["type", "scribe"],
              },
            },
            {
              id: "journal-draw-dictate",
              kind: "journal-prompt",
              title: "Draw about your day",
              band: "ready",
              skillTags: ["writing.compose"],
              config: {
                // Draw mode never exposes the mic in the Player, so even with
                // "dictate" listed the route must refuse to transcribe.
                prompt: "What did you do today?",
                mode: "draw",
                allowModes: ["dictate"],
              },
            },
            {
              id: "not-journal",
              kind: "math-clock",
              title: "Clock",
              band: "ready",
              skillTags: ["math.time"],
              config: { mode: "set", instruction: "Set six.", targetHour: 6, targetMinute: 0 },
            },
          ],
        },
      ],
    },
  ],
} satisfies Program;

function post(
  overrides: {
    learnerId?: string;
    programSlug?: string;
    unitKey?: string;
    activityId?: string;
    bytes?: number;
    omitFile?: boolean;
  } = {},
): Request {
  const form = new FormData();
  form.append("learnerId", overrides.learnerId ?? "l-1");
  form.append("programSlug", overrides.programSlug ?? "kaelyn-adaptive");
  form.append("unitKey", overrides.unitKey ?? "unit-1");
  form.append("activityId", overrides.activityId ?? "journal-dictate");
  if (!overrides.omitFile) {
    form.append(
      "file",
      new Blob([new Uint8Array(overrides.bytes ?? 12)], { type: "audio/webm" }),
      "dictation.webm",
    );
  }
  return new Request("http://test/api/journal-dictation", { method: "POST", body: form });
}

beforeEach(() => {
  vi.mocked(getAccountOrNull).mockResolvedValue({ accountId: "acc-1", userId: "acc-1" });
  vi.mocked(checkRateLimit).mockReturnValue({ ok: true, retryAfterSec: 0 });
  vi.mocked(getEnrollmentForGate).mockResolvedValue({
    status: "active",
    config: { band: "ready" },
    configValid: true,
    programVersionId: "PV1",
  });
  vi.mocked(getLearnerSettings).mockResolvedValue({ oralReading: true });
  vi.mocked(resolveProgramForEnrollmentVersion).mockResolvedValue(PROGRAM);
  vi.mocked(transcribeOralReading).mockResolvedValue("we went to the park" as never);
});

afterEach(() => vi.resetAllMocks());

describe("POST /api/journal-dictation", () => {
  it("transcribes through LiteLLM and returns the bounded text for an opted-in learner", async () => {
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "we went to the park" });
    // §8: an empty prompt keeps open-ended recognition unbiased; the request
    // signal is propagated so a client disconnect aborts the upstream STT.
    expect(transcribeOralReading).toHaveBeenCalledWith(expect.any(Blob), "", {
      signal: expect.any(AbortSignal),
    });
  });

  it("rate-limits before reading audio or calling the transcriber", async () => {
    vi.mocked(checkRateLimit).mockReturnValue({ ok: false, retryAfterSec: 20 });
    const res = await POST(post());
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("20");
    expect(await res.json()).toEqual({ text: "" });
    expect(getEnrollmentForGate).not.toHaveBeenCalled();
    expect(transcribeOralReading).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared payload before any gate or gateway call", async () => {
    const oversized = new Request(post(), { headers: { "content-length": "2097153" } });
    const res = await POST(oversized);
    expect(res.status).toBe(413);
    expect(getEnrollmentForGate).not.toHaveBeenCalled();
    expect(transcribeOralReading).not.toHaveBeenCalled();
  });

  it("returns 403 for guests without buffering or transcribing audio", async () => {
    vi.mocked(getAccountOrNull).mockResolvedValue(null);
    const res = await POST(post());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ text: "" });
    expect(transcribeOralReading).not.toHaveBeenCalled();
  });

  it("fails closed (403) when the parent has NOT opted this learner into the microphone", async () => {
    vi.mocked(getLearnerSettings).mockResolvedValue({ oralReading: false });
    const res = await POST(post());
    expect(res.status).toBe(403);
    expect(transcribeOralReading).not.toHaveBeenCalled();
  });

  it("fails closed (403) when the enrollment is not active", async () => {
    vi.mocked(getEnrollmentForGate).mockResolvedValue({
      status: "paused",
      config: { band: "ready" },
      configValid: true,
      programVersionId: "PV1",
    });
    const res = await POST(post());
    expect(res.status).toBe(403);
    expect(transcribeOralReading).not.toHaveBeenCalled();
  });

  it("refuses (403) an activity that is not a dictate-enabled journal-prompt", async () => {
    expect((await POST(post({ activityId: "journal-type-only" }))).status).toBe(403);
    expect((await POST(post({ activityId: "not-journal" }))).status).toBe(403);
    expect((await POST(post({ activityId: "missing" }))).status).toBe(403);
    expect(transcribeOralReading).not.toHaveBeenCalled();
  });

  it("refuses (403) a draw-mode journal even when it lists 'dictate'", async () => {
    const res = await POST(post({ activityId: "journal-draw-dictate" }));
    expect(res.status).toBe(403);
    expect(transcribeOralReading).not.toHaveBeenCalled();
  });

  it("returns 400 when the audio file is missing", async () => {
    const res = await POST(post({ omitFile: true }));
    expect(res.status).toBe(400);
    expect(transcribeOralReading).not.toHaveBeenCalled();
  });

  it("returns 502 (not 200) when the gateway transcription fails, so the client shows the fallback", async () => {
    vi.mocked(transcribeOralReading).mockRejectedValue(new Error("gateway down"));
    const res = await POST(post());
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ text: "" });
  });
});
