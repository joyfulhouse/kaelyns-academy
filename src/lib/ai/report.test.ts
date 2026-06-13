import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateProgressReport, type ProgressReportInput } from "./report";

/** Build a fake OpenAI-compatible chat-completions response. */
function completion(content: string, ok = true, status = 200): Response {
  const payload = { choices: [{ message: { content } }] };
  return {
    ok,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as unknown as Response;
}

const INPUT: ProgressReportInput = {
  learnerName: "Kaelyn",
  skills: [
    { label: "Vowel teams in longer words", domain: "word", outcome: "solid" },
    { label: "Consistent spacing & sizing", domain: "writing", outcome: "not_yet" },
  ],
  recent: [{ title: "The volcano wakes up", stars: 2 }],
};

const VALID = JSON.stringify({
  summary: "Kaelyn is reading longer words on her own and is just starting to space her writing.",
  wins: ["Reads two-syllable vowel-team words independently", "Stayed focused through a full read"],
  reinforce: ["Spacing between words is still emerging", "Writing the hand is catching up to the ideas"],
  suggestion: "Try writing one sentence together at dinner, with a finger space between words.",
});

describe("generateProgressReport (grounded + schema-validated)", () => {
  beforeEach(() => {
    process.env.LITELLM_URL = "http://litellm.test/v1";
    process.env.LITELLM_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns a validated report for a well-formed model response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(completion(VALID));
    vi.stubGlobal("fetch", fetchMock);

    const report = await generateProgressReport(INPUT);
    expect(report.wins.length).toBeGreaterThanOrEqual(2);
    expect(report.reinforce.length).toBeLessThanOrEqual(4);
    expect(report.suggestion).toMatch(/finger space/);
    expect(fetchMock).toHaveBeenCalledOnce();

    // It POSTs JSON with a bearer token to the gateway's chat-completions path,
    // using the rich tutor route ("chat-default").
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://litellm.test/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer test-key");
    expect(JSON.parse(init.body as string).model).toBe("chat-default");
  });

  it("grounds the prompt only in the provided skills (no fabricated data)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(completion(VALID));
    vi.stubGlobal("fetch", fetchMock);

    await generateProgressReport(INPUT);
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    const userMsg = body.messages.find((m: { role: string }) => m.role === "user")?.content ?? "";
    expect(userMsg).toContain("Vowel teams in longer words (solid)");
    expect(userMsg).toContain("Consistent spacing & sizing (not_yet)");
    expect(userMsg).toContain("The volcano wakes up");
  });

  it("throws when the model returns too few list items (schema floor)", async () => {
    const bad = JSON.stringify({
      summary: "ok",
      wins: ["only one"],
      reinforce: ["a", "b"],
      suggestion: "do a thing",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completion(bad)));
    await expect(generateProgressReport(INPUT)).rejects.toThrow();
  });

  it("throws when the model returns non-JSON content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completion("here is your report:")));
    await expect(generateProgressReport(INPUT)).rejects.toThrow(/non-JSON/);
  });

  it("throws on a non-2xx gateway response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completion("{}", false, 503)));
    await expect(generateProgressReport(INPUT)).rejects.toThrow(/503/);
  });

  it("handles an empty skill set without inventing skills", async () => {
    const fetchMock = vi.fn().mockResolvedValue(completion(VALID));
    vi.stubGlobal("fetch", fetchMock);

    await generateProgressReport({ learnerName: "Kaelyn", skills: [] });
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    const userMsg = body.messages.find((m: { role: string }) => m.role === "user")?.content ?? "";
    expect(userMsg).toContain("No skills have been assessed yet");
  });
});
