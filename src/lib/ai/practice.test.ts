import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generatePracticeItems } from "./practice";

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

describe("generatePracticeItems (bounded + schema-validated)", () => {
  beforeEach(() => {
    process.env.LITELLM_URL = "http://litellm.test/v1";
    process.env.LITELLM_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns validated config items for a valid model response", async () => {
    const valid = JSON.stringify({
      items: [
        {
          focus: "short a CVC",
          instruction: "Build the word.",
          tiles: ["c", "a", "t"],
          words: [{ word: "cat", picture: "🐱" }],
        },
      ],
    });
    const fetchMock = vi.fn().mockResolvedValue(completion(valid));
    vi.stubGlobal("fetch", fetchMock);

    const items = await generatePracticeItems("phonics-wordbuild", "ready", "short a", 1);
    expect(items).toHaveLength(1);
    expect(items[0].words[0].word).toBe("cat");
    expect(fetchMock).toHaveBeenCalledOnce();

    // It POSTs JSON with a bearer token to the gateway's chat-completions path.
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://litellm.test/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer test-key");
    expect(init.method).toBe("POST");
  });

  it("throws when the model returns config that violates the schema", async () => {
    // Missing required `words` for phonics-wordbuild.
    const bad = JSON.stringify({ items: [{ focus: "x", instruction: "y", tiles: ["a", "b"] }] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completion(bad)));

    await expect(
      generatePracticeItems("phonics-wordbuild", "ready", "short a", 1),
    ).rejects.toThrow();
  });

  it("throws when the model returns non-JSON content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completion("totally not json")));
    await expect(
      generatePracticeItems("sightword-game", "ready", "the, and", 1),
    ).rejects.toThrow(/non-JSON/);
  });

  it("throws on a non-2xx gateway response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completion("{}", false, 503)));
    await expect(
      generatePracticeItems("math-tenframe", "ready", "count to 10", 1),
    ).rejects.toThrow(/503/);
  });

  it("tolerates markdown-fenced JSON from a chatty model", async () => {
    const fenced = "```json\n" + JSON.stringify({
      items: [{ instruction: "Show 5.", mode: "represent", target: 5, frames: 1 }],
    }) + "\n```";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completion(fenced)));

    const items = await generatePracticeItems("math-tenframe", "ready", "count to 5", 1);
    expect(items[0]).toMatchObject({ mode: "represent", target: 5 });
  });

  it("applies schema defaults to validated items (sightword decoys)", async () => {
    const valid = JSON.stringify({ items: [{ instruction: "Find the words.", words: ["the", "and"] }] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completion(valid)));

    const items = await generatePracticeItems("sightword-game", "ready", "the, and", 1);
    expect(items[0].decoys).toEqual([]); // .default([]) applied by the schema
  });
});
