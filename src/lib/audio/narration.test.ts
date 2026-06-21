// src/lib/audio/narration.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./kokoro", () => ({ synthesizeMp3: vi.fn() }));
vi.mock("./store", () => ({ clipExists: vi.fn(), putClip: vi.fn() }));

import { synthesizeMp3 } from "./kokoro";
import { clipExists, putClip } from "./store";
import { ensureNarration } from "./narration";

afterEach(() => vi.resetAllMocks());

describe("ensureNarration", () => {
  it("no-ops when the durable clip already exists", async () => {
    vi.mocked(clipExists).mockResolvedValue(true);
    const r = await ensureNarration("Find the word");
    expect(r.stored).toBe(true);
    expect(r.prefix).toBe("en");
    expect(synthesizeMp3).not.toHaveBeenCalled();
    expect(putClip).not.toHaveBeenCalled();
  });

  it("synthesizes and write-throughs on a miss", async () => {
    vi.mocked(clipExists).mockResolvedValue(false);
    vi.mocked(synthesizeMp3).mockResolvedValue(new Uint8Array([1]));
    vi.mocked(putClip).mockResolvedValue(true);
    const r = await ensureNarration("Find the word");
    expect(synthesizeMp3).toHaveBeenCalledWith("Find the word", "af_heart", 0.9);
    expect(putClip).toHaveBeenCalledWith("en", r.key, expect.any(Uint8Array));
    expect(r.stored).toBe(true);
  });

  it("uses the ephemeral prefix when persist=ephemeral", async () => {
    vi.mocked(clipExists).mockResolvedValue(false);
    vi.mocked(synthesizeMp3).mockResolvedValue(new Uint8Array([1]));
    vi.mocked(putClip).mockResolvedValue(true);
    const r = await ensureNarration("one off", { persist: "ephemeral" });
    expect(r.prefix).toBe("en/cache");
    expect(putClip).toHaveBeenCalledWith("en/cache", r.key, expect.any(Uint8Array));
  });

  it("swallows synth failure and reports stored=false", async () => {
    vi.mocked(clipExists).mockResolvedValue(false);
    vi.mocked(synthesizeMp3).mockRejectedValue(new Error("kokoro down"));
    const r = await ensureNarration("Find the word");
    expect(r.stored).toBe(false);
  });

  it("skips oversized text without synthesizing (denial-of-wallet guard)", async () => {
    const huge = "a".repeat(501); // mirrors the /api/tts MAX_TTS_TEXT_LEN=500 cap
    const r = await ensureNarration(huge);
    expect(r.stored).toBe(false);
    expect(clipExists).not.toHaveBeenCalled();
    expect(synthesizeMp3).not.toHaveBeenCalled();
    expect(putClip).not.toHaveBeenCalled();
  });
});
