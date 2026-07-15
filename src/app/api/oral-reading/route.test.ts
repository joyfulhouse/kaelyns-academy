import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/transcribe", () => ({ transcribeOralReading: vi.fn() }));
vi.mock("@/lib/ai/oralReadingMatch", () => ({ matchOralReading: vi.fn() }));
vi.mock("@/lib/ai/oralReadingAlign", () => ({ oralReadingAlign: vi.fn() }));
vi.mock("@/lib/tenancy", () => ({ getAccountOrNull: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/tutor/store", () => ({
  createOralReadingVerification: vi.fn(),
  getEnrollmentForGate: vi.fn(),
  getLearnerSettings: vi.fn(),
}));
vi.mock("@/lib/content/repository", () => ({
  resolveProgramForEnrollmentVersion: vi.fn(),
}));
vi.mock("@/lib/capture", () => ({ captureNonCritical: vi.fn() }));

import { matchOralReading } from "@/lib/ai/oralReadingMatch";
import { oralReadingAlign } from "@/lib/ai/oralReadingAlign";
import { transcribeOralReading } from "@/lib/ai/transcribe";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAccountOrNull } from "@/lib/tenancy";
import {
  createOralReadingVerification,
  getEnrollmentForGate,
  getLearnerSettings,
} from "@/lib/tutor/store";
import { resolveProgramForEnrollmentVersion } from "@/lib/content/repository";
import type { Program } from "@/content";
import { POST } from "./route";

const PROGRAM = {
  slug: "kaelyn-adaptive",
  title: "Reading",
  subtitle: "",
  ageBand: "",
  summary: "",
  units: [
    {
      id: "unit-1",
      order: 1,
      title: "Words",
      emoji: "📖",
      world: "sunshine",
      bigIdea: "",
      phonicsFocus: "",
      mathFocus: "",
      project: "",
      lessons: [
        {
          id: "lesson-1",
          order: 1,
          title: "Read",
          activities: [
            {
              id: "oral-word",
              kind: "oral-reading",
              title: "Read there",
              band: "ready",
              skillTags: ["word.sight"],
              config: {
                presentation: "cold",
                instruction: "Read the word.",
                target: "there",
                skillTag: "word.sight",
              },
            },
            {
              id: "oral-sentence",
              kind: "oral-reading",
              title: "Read a sentence",
              band: "ready",
              skillTags: ["reading.accuracy"],
              config: {
                mode: "sentence",
                presentation: "cold",
                instruction: "Read the sentence.",
                passage: "We can see the cat.",
                skillTag: "reading.accuracy",
              },
            },
            {
              id: "not-oral",
              kind: "math-clock",
              title: "Clock",
              band: "ready",
              skillTags: ["math.time"],
              config: {
                mode: "set",
                instruction: "Set six o'clock.",
                targetHour: 6,
                targetMinute: 0,
              },
            },
          ],
        },
      ],
    },
    {
      id: "unit-2",
      order: 2,
      title: "Other",
      emoji: "🌱",
      world: "garden",
      bigIdea: "",
      phonicsFocus: "",
      mathFocus: "",
      project: "",
      lessons: [],
    },
  ],
} satisfies Program;

function post(
  overrides: {
    mode?: "word" | "sentence";
    target?: string;
    passage?: string;
    learnerId?: string;
    programSlug?: string;
    unitKey?: string;
    activityId?: string;
    bytes?: number;
  } = {},
): Request {
  const form = new FormData();
  // Deliberately allow legacy/tampered content facts in tests. The route must
  // ignore them and derive mode + expected text from the pinned activity.
  if (overrides.mode) form.append("mode", overrides.mode);
  if (overrides.target) form.append("target", overrides.target);
  if (overrides.passage) form.append("passage", overrides.passage);
  form.append("learnerId", overrides.learnerId ?? "l-1");
  form.append("programSlug", overrides.programSlug ?? "kaelyn-adaptive");
  form.append("unitKey", overrides.unitKey ?? "unit-1");
  form.append(
    "activityId",
    overrides.activityId ?? (overrides.mode === "sentence" ? "oral-sentence" : "oral-word"),
  );
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
    configValid: true,
    programVersionId: "PV1",
  });
  vi.mocked(getLearnerSettings).mockResolvedValue({ oralReading: true });
  vi.mocked(resolveProgramForEnrollmentVersion).mockResolvedValue(PROGRAM);
  vi.mocked(createOralReadingVerification).mockResolvedValue(
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  );
  vi.mocked(transcribeOralReading).mockResolvedValue("their" as never);
  vi.mocked(matchOralReading).mockReturnValue("matched");
  vi.mocked(oralReadingAlign).mockReturnValue({
    result: "matched",
    perWord: Array.from({ length: 5 }, () => ({ state: "correct" as const })),
    wcpm: 42,
    correctCount: 5,
    totalWords: 5,
  });
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

  it("requires the full authored identity so exact-unit resolution can run", async () => {
    const form = new FormData();
    form.append("learnerId", "l-1");
    form.append("programSlug", "kaelyn-adaptive");
    form.append("file", new Blob([new Uint8Array(12)], { type: "audio/webm" }), "reading.webm");
    const res = await POST(
      new Request("http://test/api/oral-reading", { method: "POST", body: form }),
    );
    expect(res.status).toBe(400);
    expect(getEnrollmentForGate).not.toHaveBeenCalled();
    expect(resolveProgramForEnrollmentVersion).not.toHaveBeenCalled();
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
      configValid: true,
      programVersionId: "PV1",
    });
    expect((await POST(post())).status).toBe(403);
    expect(transcribeOralReading).not.toHaveBeenCalled();

    // Active enrollment but the oralReading opt-in is off (default).
    vi.mocked(getLearnerSettings).mockResolvedValueOnce({ oralReading: false });
    expect((await POST(post())).status).toBe(403);
    expect(transcribeOralReading).not.toHaveBeenCalled();
  });

  it("fails closed when enrollment config is malformed or the route unit is curated out", async () => {
    vi.mocked(getEnrollmentForGate).mockResolvedValueOnce({
      status: "active",
      config: { aiPractice: false },
      configValid: false,
      programVersionId: "PV1",
    });
    expect((await POST(post())).status).toBe(403);
    expect(transcribeOralReading).not.toHaveBeenCalled();

    vi.mocked(getEnrollmentForGate).mockResolvedValueOnce({
      status: "active",
      config: { activeUnitKeys: ["unit-2"] },
      configValid: true,
      programVersionId: "PV1",
    });
    expect((await POST(post())).status).toBe(403);
    expect(transcribeOralReading).not.toHaveBeenCalled();
  });

  it("fails closed when consent or curation is revoked before witness insertion", async () => {
    vi.mocked(createOralReadingVerification).mockResolvedValueOnce(null);

    const response = await POST(post());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ result: "unavailable" });
  });

  it("derives the canonical word target and persists only a bounded witness", async () => {
    const res = await POST(post({ target: "forged browser target" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      result: "matched",
      verificationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    expect(getEnrollmentForGate).toHaveBeenCalledWith("acc-1", "l-1", "kaelyn-adaptive");
    expect(resolveProgramForEnrollmentVersion).toHaveBeenCalledWith(
      "kaelyn-adaptive",
      "PV1",
    );
    expect(transcribeOralReading).toHaveBeenCalledWith(expect.any(Blob), "there");
    expect(matchOralReading).toHaveBeenCalledWith("there", "their");
    expect(createOralReadingVerification).toHaveBeenCalledWith("acc-1", {
      learnerId: "l-1",
      programSlug: "kaelyn-adaptive",
      expectedProgramVersionId: "PV1",
      unitKey: "unit-1",
      activityId: "oral-word",
      mode: "word",
      result: "matched",
      perWord: null,
      correctCount: 1,
      totalWords: 1,
      wcpm: null,
    });
    const persisted = vi.mocked(createOralReadingVerification).mock.calls[0]?.[1];
    expect(JSON.stringify(persisted)).not.toMatch(/transcript|audio|target|passage|their/i);
  });

  it("transcribes sentence mode with timestamps and returns only derived karaoke data", async () => {
    vi.mocked(transcribeOralReading).mockResolvedValue({
      text: "we can see the cat",
      words: [
        { word: "we", start: 0, end: 0.4 },
        { word: "can", start: 0.4, end: 0.8 },
        { word: "see", start: 0.8, end: 1.2 },
        { word: "the", start: 1.2, end: 1.6 },
        { word: "cat", start: 1.6, end: 2.2 },
      ],
    });

    const res = await POST(post({ mode: "sentence" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      result: "matched",
      words: Array.from({ length: 5 }, () => ({ state: "correct" })),
      wcpm: 42,
      verificationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    expect(transcribeOralReading).toHaveBeenCalledWith(
      expect.any(Blob),
      "We can see the cat.",
      { wordTimestamps: true },
    );
    expect(oralReadingAlign).toHaveBeenCalledWith("We can see the cat.", [
      { word: "we", start: 0, end: 0.4 },
      { word: "can", start: 0.4, end: 0.8 },
      { word: "see", start: 0.8, end: 1.2 },
      { word: "the", start: 1.2, end: 1.6 },
      { word: "cat", start: 1.6, end: 2.2 },
    ]);
    expect(matchOralReading).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toContain("transcript");
    expect(createOralReadingVerification).toHaveBeenCalledWith("acc-1", {
      learnerId: "l-1",
      programSlug: "kaelyn-adaptive",
      expectedProgramVersionId: "PV1",
      unitKey: "unit-1",
      activityId: "oral-sentence",
      mode: "sentence",
      result: "matched",
      perWord: Array.from({ length: 5 }, () => ({ state: "correct" })),
      correctCount: 5,
      totalWords: 5,
      wcpm: 42,
    });
  });

  it("returns unavailable when the gateway drops per-word timestamps", async () => {
    // e.g. LiteLLM stripped words[] from the verbose response.
    vi.mocked(transcribeOralReading).mockResolvedValue({ text: "we can see the cat", words: [] });

    const res = await POST(post({ mode: "sentence" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: "unavailable" });
    expect(oralReadingAlign).not.toHaveBeenCalled();
    expect(createOralReadingVerification).not.toHaveBeenCalled();
  });

  it("rejects cross-unit, missing, non-oral, and malformed pinned activities", async () => {
    expect((await POST(post({ unitKey: "unit-2" }))).status).toBe(403);
    expect((await POST(post({ activityId: "missing" }))).status).toBe(403);
    expect((await POST(post({ activityId: "not-oral" }))).status).toBe(403);

    const malformed = structuredClone(PROGRAM) as Program;
    const activity = malformed.units[0]?.lessons[0]?.activities[0];
    if (activity?.kind === "oral-reading") activity.config = { target: "" } as never;
    vi.mocked(resolveProgramForEnrollmentVersion).mockResolvedValue(malformed);
    expect((await POST(post())).status).toBe(403);

    expect(transcribeOralReading).not.toHaveBeenCalled();
    expect(createOralReadingVerification).not.toHaveBeenCalled();
  });

  it("maps every transcriber failure to unavailable without matching", async () => {
    vi.mocked(transcribeOralReading).mockRejectedValue(new Error("gateway down"));
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: "unavailable" });
    expect(matchOralReading).not.toHaveBeenCalled();
    expect(createOralReadingVerification).not.toHaveBeenCalled();
  });

  it("fails closed when the pinned program or witness store is unavailable", async () => {
    vi.mocked(resolveProgramForEnrollmentVersion).mockRejectedValueOnce(
      new Error("pin unavailable"),
    );
    expect((await POST(post())).status).toBe(403);
    expect(transcribeOralReading).not.toHaveBeenCalled();

    vi.mocked(createOralReadingVerification).mockRejectedValueOnce(new Error("db unavailable"));
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: "unavailable" });
  });
});
