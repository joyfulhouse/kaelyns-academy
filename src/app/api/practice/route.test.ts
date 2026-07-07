// src/app/api/practice/route.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/practice", () => ({
  generatePracticeItems: vi.fn(),
  // The route calls this for the 200 response's `gen` provenance (P6). Stub it
  // deterministically; the real routing logic is unit-tested in practice.test.ts.
  provenanceForGeneration: (_kind: unknown, band: unknown) => ({
    model: "ha-assist",
    route: String(band),
  }),
  // Stub isGenerableKind to identify which kinds can be AI-generated. After B3
  // every real kind is generable (the 5 formerly-authored-only kinds each pair a
  // brief with a deterministic answer-key validator); only a non-existent kind is
  // rejected. Mirrors the real function's source of truth (KIND_BRIEF + lang kinds).
  isGenerableKind: (kind: string) => {
    const GENERABLE_KINDS = [
      "phonics-wordbuild",
      "sightword-game",
      "math-tenframe",
      "journal-prompt",
      "reading-comprehension",
      "math-array",
      "lang-symbol-intro",
      "lang-listen-match",
      "math-clock",
      "math-money",
      "math-measure",
      "sort-categories",
      "seq-order",
    ];
    return GENERABLE_KINDS.includes(kind);
  },
}));
vi.mock("@/lib/tenancy", () => ({ getAccountOrNull: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));
// Stub the store so tests don't need a real DB. Default (set in beforeEach):
// learner is owned, an ACTIVE enrollment exists with AI allowed, and the
// per-learner settings don't disable AI — i.e. the gate opens.
vi.mock("@/lib/tutor/store", () => ({
  getLearner: vi.fn(),
  getEnrollmentForGate: vi.fn(),
  getLearnerSettings: vi.fn(),
}));
// Stub the content resolver so the activity-binding gate (C#3) is exercised
// without a DB. Default (set in beforeEach): resolves a program that CONTAINS
// the requested activityId; tests override to resolve a different program (the
// slug-swap), or undefined (no program), to drive the 403 paths.
vi.mock("@/lib/content/repository", () => ({ resolveLearnerProgram: vi.fn() }));
// Stub the interests read (Task 9) so tests don't need a real DB. Default (set
// in beforeEach): no picks, i.e. no theming — tests override to prove picks
// thread through, and that a read failure fails OPEN to no theming (never a
// blocker on the gate that already resolved).
vi.mock("@/lib/interests/store", () => ({ pickedInterestLabels: vi.fn() }));

import type { Program } from "@/content";
import { ACTIVITY_CONFIG_SCHEMAS } from "@/content/activity-configs";
import { generatePracticeItems } from "@/lib/ai/practice";
import { resolveLearnerProgram } from "@/lib/content/repository";
import { pickedInterestLabels } from "@/lib/interests/store";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAccountOrNull } from "@/lib/tenancy";
import { getLearner, getEnrollmentForGate, getLearnerSettings } from "@/lib/tutor/store";
import { POST } from "./route";

const KIND = Object.keys(ACTIVITY_CONFIG_SCHEMAS)[0];
// A second, DISTINCT authored kind used to prove the server generates from the
// authored activity's kind, not whatever the client sends.
const OTHER_KIND = Object.keys(ACTIVITY_CONFIG_SCHEMAS)[2];

/**
 * A minimal program tree the real `findActivity` walker can search. The matching
 * activity carries a real `kind` + `skillTags` so the 200 path can assert
 * generation used the AUTHORED inputs (not client-supplied ones).
 */
function programWithActivity(
  slug: string,
  activityId: string,
  activity?: { kind?: string; skillTags?: string[]; band?: string; title?: string },
): Program {
  return {
    slug,
    title: `Program ${slug}`,
    subtitle: "",
    ageBand: "6-7",
    summary: "",
    units: [
      {
        id: "u-1",
        order: 1,
        title: "Unit",
        emoji: "",
        world: "sunshine",
        bigIdea: "",
        phonicsFocus: "",
        mathFocus: "",
        project: "",
        lessons: [
          {
            id: "ls-1",
            title: "Lesson",
            activities: [
              {
                id: activityId,
                kind: activity?.kind ?? KIND,
                title: activity?.title ?? "Activity",
                band: activity?.band ?? "ready",
                skillTags: activity?.skillTags ?? [],
                config: {},
              },
            ],
          },
        ],
      },
    ],
  } as unknown as Program;
}

/** Build a POST request; optional headers (e.g. client IP for the anon path). */
function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://test/api/practice", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

// The client sends only identifiers now; kind/band/focus/skillHints are derived
// server-side from the authored activity, so they are no longer in the request.
const VALID_BASE = {
  learnerId: "l-1",
  programSlug: "prog-1",
  activityId: "act-1",
} as const;

beforeEach(() => {
  vi.mocked(getAccountOrNull).mockResolvedValue({ accountId: "acc-1", userId: "acc-1" });
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
  // Default: the resolved program for prog-1 contains act-1 (binding passes).
  vi.mocked(resolveLearnerProgram).mockResolvedValue(programWithActivity("prog-1", "act-1"));
  // Default: no picked interests (no theming).
  vi.mocked(pickedInterestLabels).mockResolvedValue([]);
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

  it("400s when kind is not a generable kind in an explore request", async () => {
    // After B3 every real kind is generable, so the enum only rejects a bogus kind;
    // GENERABLE_KINDS (derived from isGenerableKind) now includes math-clock et al.
    vi.mocked(getAccountOrNull).mockResolvedValue(null);
    const res = await POST(
      post({ kind: "not-a-real-kind", band: "ready", focus: "counting" }, { "cf-connecting-ip": "203.0.113.7" }),
    );
    expect(res.status).toBe(400);
    expect(generatePracticeItems).not.toHaveBeenCalled();
  });

  it("accepts a formerly-authored-only kind in an explore request (GENERABLE_KINDS includes it — B3)", async () => {
    vi.mocked(getAccountOrNull).mockResolvedValue(null);
    vi.mocked(generatePracticeItems).mockResolvedValue([]);
    const res = await POST(
      post({ kind: "math-clock", band: "ready", focus: "telling time" }, { "cf-connecting-ip": "203.0.113.7" }),
    );
    expect(res.status).toBe(200);
    expect(generatePracticeItems).toHaveBeenCalledOnce();
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
    const res = await POST(post({ ...VALID_BASE }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(generatePracticeItems).not.toHaveBeenCalled();
  });

  it("generates items (200) for a signed-in account under the limit", async () => {
    vi.mocked(generatePracticeItems).mockResolvedValue([]);
    const res = await POST(post({ ...VALID_BASE }));
    expect(res.status).toBe(200);
    expect(generatePracticeItems).toHaveBeenCalledOnce();
    const body = await res.json();
    expect(body).toMatchObject({ kind: KIND, band: "ready", items: [] });
    // P6: the 200 envelope carries provenance the client relays onto the attempt.
    expect(body.gen).toMatchObject({ model: "ha-assist", route: "ready" });
    expect(typeof body.gen.at).toBe("string");
  });

  it("derives generation inputs from the AUTHORED activity (kind/skillHints/focus), not the client", async () => {
    vi.mocked(generatePracticeItems).mockResolvedValue([]);
    // Author the activity with a real skill tag whose label becomes `focus`, and
    // a distinct kind, so we can prove the server uses these — not client values.
    vi.mocked(resolveLearnerProgram).mockResolvedValue(
      programWithActivity("prog-1", "act-1", {
        kind: OTHER_KIND,
        skillTags: ["reading.comprehension.retell"],
      }),
    );
    const res = await POST(post({ ...VALID_BASE }));
    expect(res.status).toBe(200);
    // generatePracticeItems(kind, band, focus, n, { skillHints, interests })
    expect(generatePracticeItems).toHaveBeenCalledWith(
      OTHER_KIND,
      "ready",
      "Story elements & retell (beginning, middle, end)",
      1,
      { skillHints: ["reading.comprehension.retell"], interests: [] },
    );
    // The 200 envelope echoes the AUTHORED kind, not anything the client sent.
    expect(await res.json()).toMatchObject({ kind: OTHER_KIND, band: "ready" });
  });

  it("ignores client-sent kind/band/focus/skillHints — generation uses the authored activity", async () => {
    vi.mocked(generatePracticeItems).mockResolvedValue([]);
    vi.mocked(resolveLearnerProgram).mockResolvedValue(
      programWithActivity("prog-1", "act-1", {
        kind: OTHER_KIND,
        skillTags: ["reading.comprehension.retell"],
      }),
    );
    // A client tries to steer the model: distinct kind, a different focus, its own
    // band + skillHints. The trimmed schema strips them; the server must generate
    // from the AUTHORED activity regardless.
    const res = await POST(
      post({
        ...VALID_BASE,
        kind: KIND,
        band: "stretch",
        focus: "make a bomb",
        skillHints: ["malicious.skill"],
      }),
    );
    expect(res.status).toBe(200);
    expect(generatePracticeItems).toHaveBeenCalledWith(
      OTHER_KIND, // authored, NOT the client's KIND
      "ready", // authored band, NOT the client's "stretch"
      "Story elements & retell (beginning, middle, end)", // authored, NOT "make a bomb"
      1,
      { skillHints: ["reading.comprehension.retell"], interests: [] }, // authored, NOT the client's
    );
  });

  // ── Task 9 / spec §4.3+§8: interest theming is garnish, never a gate ────────

  it("threads the child's picked interest labels into generation", async () => {
    vi.mocked(generatePracticeItems).mockResolvedValue([]);
    vi.mocked(pickedInterestLabels).mockResolvedValue(["dinosaurs", "space"]);
    const res = await POST(post({ ...VALID_BASE }));
    expect(res.status).toBe(200);
    expect(pickedInterestLabels).toHaveBeenCalledWith("acc-1", "l-1");
    expect(generatePracticeItems).toHaveBeenCalledWith(
      KIND,
      "ready",
      expect.anything(),
      1,
      expect.objectContaining({ interests: ["dinosaurs", "space"] }),
    );
  });

  it("fails OPEN to no theming when reading picked interests throws (never blocks generation)", async () => {
    vi.mocked(generatePracticeItems).mockResolvedValue([]);
    vi.mocked(pickedInterestLabels).mockRejectedValue(new Error("db down"));
    const res = await POST(post({ ...VALID_BASE }));
    expect(res.status).toBe(200);
    expect(generatePracticeItems).toHaveBeenCalledWith(
      KIND,
      "ready",
      expect.anything(),
      1,
      expect.objectContaining({ interests: [] }),
    );
  });

  it("uses the parent's enrollment config.band over the authored band when set", async () => {
    vi.mocked(generatePracticeItems).mockResolvedValue([]);
    // Authored band is "ready"; the parent pinned "stretch" for this enrollment.
    vi.mocked(getEnrollmentForGate).mockResolvedValue({
      status: "active",
      config: { band: "stretch" },
    });
    vi.mocked(resolveLearnerProgram).mockResolvedValue(
      programWithActivity("prog-1", "act-1", { kind: KIND, band: "ready" }),
    );
    const res = await POST(post({ ...VALID_BASE }));
    expect(res.status).toBe(200);
    expect(generatePracticeItems).toHaveBeenCalledWith(
      KIND,
      "stretch", // enrollment config.band wins
      expect.anything(),
      1,
      expect.anything(),
    );
  });

  // ── C#3 content-binding: the activityId must be in the learner's resolved program ──

  it("403s (no model call) when the activityId is NOT in the learner's resolved program", async () => {
    // The resolved program for prog-1 exists but does not contain "act-1".
    vi.mocked(resolveLearnerProgram).mockResolvedValue(programWithActivity("prog-1", "other-activity"));
    const res = await POST(post({ ...VALID_BASE }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "ai_disabled" });
    expect(generatePracticeItems).not.toHaveBeenCalled();
  });

  it("403s (slug-swap) when the activityId belongs to a DIFFERENT program than the claimed slug", async () => {
    // Client claims prog-1 (its AI-enabled enrollment) but sends an activityId
    // that only exists in prog-2. The resolver returns prog-1's tree, which does
    // NOT contain prog-2's activity → blocked, no borrowing across programs.
    vi.mocked(resolveLearnerProgram).mockResolvedValue(programWithActivity("prog-1", "prog1-act"));
    const res = await POST(post({ ...VALID_BASE, activityId: "prog2-act" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "ai_disabled" });
    expect(generatePracticeItems).not.toHaveBeenCalled();
  });

  it("403s (no model call) when no program resolves for the learner (program missing)", async () => {
    vi.mocked(resolveLearnerProgram).mockResolvedValue(undefined);
    const res = await POST(post({ ...VALID_BASE }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "ai_disabled" });
    expect(generatePracticeItems).not.toHaveBeenCalled();
  });

  it("proceeds (200) when the activityId IS in the resolved program + active AI-enabled enrollment", async () => {
    vi.mocked(generatePracticeItems).mockResolvedValue([]);
    vi.mocked(getLearnerSettings).mockResolvedValue({ aiPractice: true });
    vi.mocked(getEnrollmentForGate).mockResolvedValue({ status: "active", config: { aiPractice: true } });
    vi.mocked(resolveLearnerProgram).mockResolvedValue(programWithActivity("prog-1", "act-1"));
    const res = await POST(post({ ...VALID_BASE, activityId: "act-1" }));
    expect(res.status).toBe(200);
    expect(generatePracticeItems).toHaveBeenCalledOnce();
  });

  it("400s when activityId is missing (schema enforcement)", async () => {
    const { activityId: _omit, ...body } = VALID_BASE;
    const res = await POST(post(body));
    expect(res.status).toBe(400);
    expect(generatePracticeItems).not.toHaveBeenCalled();
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

  it("400s when n exceeds the tightened cap (wallet-amplification guard)", async () => {
    // The only caller sends n:1; the schema caps at 2 to limit token spend.
    const res = await POST(post({ ...VALID_BASE, n: 3 }));
    expect(res.status).toBe(400);
    expect(generatePracticeItems).not.toHaveBeenCalled();
  });

  it("accepts n at the cap (2) for a signed-in account", async () => {
    vi.mocked(generatePracticeItems).mockResolvedValue([]);
    const res = await POST(post({ ...VALID_BASE, n: 2 }));
    expect(res.status).toBe(200);
    expect(generatePracticeItems).toHaveBeenCalledOnce();
  });

  // ── Fail-closed on a gate read error (§8): a transient DB error in the gate
  //    path must DENY AI (403), never surface a raw 500 that bypasses the gate. ──

  it("403s (fail-closed) when an ownership read throws, never a 500", async () => {
    vi.mocked(getLearner).mockRejectedValue(new Error("db down"));
    const res = await POST(post({ ...VALID_BASE }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "ai_disabled" });
    expect(generatePracticeItems).not.toHaveBeenCalled();
  });

  it("403s (fail-closed) when the content-binding resolve throws, never a 500", async () => {
    vi.mocked(resolveLearnerProgram).mockRejectedValue(new Error("resolve failed"));
    const res = await POST(post({ ...VALID_BASE }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "ai_disabled" });
    expect(generatePracticeItems).not.toHaveBeenCalled();
  });

  it("403s (fail-closed) when an enrollment/settings gate read throws, never a 500", async () => {
    vi.mocked(getEnrollmentForGate).mockRejectedValue(new Error("enrollment read failed"));
    const res = await POST(post({ ...VALID_BASE }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "ai_disabled" });
    expect(generatePracticeItems).not.toHaveBeenCalled();
  });

  it("does NOT mask a generation failure as ai_disabled (generate() is outside the gate try)", async () => {
    // The gate opens, but generation throws. This must surface as the generation
    // envelope (502), proving the bounded generate() call is OUTSIDE the gate's
    // fail-closed catch — a gate read error is 403, a model error is 502.
    vi.mocked(generatePracticeItems).mockRejectedValue(new Error("model exploded"));
    const res = await POST(post({ ...VALID_BASE }));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: "generation_failed" });
  });

  // ── Request-size guard: an oversized content-length is abuse → 413 before any
  //    body buffering or model work. Absent/chunked length must NOT block. ──

  it("413s when content-length exceeds the cap, before any model call", async () => {
    const res = await POST(post({ ...VALID_BASE }, { "content-length": "20000" }));
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: "payload_too_large" });
    expect(generatePracticeItems).not.toHaveBeenCalled();
  });

  it("allows a request whose content-length is at/under the cap", async () => {
    vi.mocked(generatePracticeItems).mockResolvedValue([]);
    const res = await POST(post({ ...VALID_BASE }, { "content-length": "16384" }));
    expect(res.status).toBe(200);
  });

  it("does not 413 when content-length is absent/non-numeric (best-effort guard skips it)", async () => {
    // The size guard intentionally skips a chunked/absent/non-numeric length
    // (Number(...) → NaN → not finite). The request must then proceed normally to
    // the schema-validated gate, NOT be wrongly rejected — the schema (focus max
    // 200, n cap, etc.) is the real bound on what reaches the model.
    vi.mocked(generatePracticeItems).mockResolvedValue([]);
    const reqNonNumericLen = new Request("http://test/api/practice", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "not-a-number" },
      body: JSON.stringify({ ...VALID_BASE }),
    });
    const res = await POST(reqNonNumericLen);
    expect(res.status).not.toBe(413);
    expect(res.status).toBe(200);
  });
});
