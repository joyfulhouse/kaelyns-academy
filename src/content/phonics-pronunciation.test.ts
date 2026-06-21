import { describe, expect, it } from "vitest";
import { PROGRAMS } from "@/content";
import { phonicsWordbuildConfig } from "@/content/activity-configs";

/**
 * Guards the per-tile pronunciation overrides authored on phonics-wordbuild
 * activities. A lone tile is spoken in isolation, where its out-of-context
 * spelling mis-phonemizes (e.g. "ble" → "blee", "ta" → "tah"); the `say` map
 * supplies the in-word IPA so the child hears the right sound. These checks
 * catch typos (an override keyed to a tile that doesn't exist) and lock the
 * original reported regression.
 */
interface RawActivity {
  id?: unknown;
  kind?: unknown;
  config?: unknown;
}

function phonicsActivities(): { id: string; config: unknown }[] {
  const out: { id: string; config: unknown }[] = [];
  for (const program of PROGRAMS) {
    for (const unit of program.units ?? []) {
      for (const lesson of unit.lessons ?? []) {
        for (const activity of lesson.activities ?? []) {
          const a = activity as RawActivity;
          if (a.kind === "phonics-wordbuild") {
            out.push({ id: typeof a.id === "string" ? a.id : "(unknown)", config: a.config });
          }
        }
      }
    }
  }
  return out;
}

describe("phonics-wordbuild pronunciation overrides", () => {
  const activities = phonicsActivities();

  it("covers the phonics-wordbuild activities in the programs", () => {
    expect(activities.length).toBeGreaterThan(0);
  });

  it("every `say` key is an actual tile and every override is non-empty", () => {
    for (const { id, config } of activities) {
      const parsed = phonicsWordbuildConfig.parse(config);
      const tiles = new Set(parsed.tiles);
      for (const [tile, ipa] of Object.entries(parsed.say ?? {})) {
        expect(tiles.has(tile), `${id}: say key "${tile}" is not one of its tiles`).toBe(true);
        expect(ipa.trim().length, `${id}: empty IPA override for tile "${tile}"`).toBeGreaterThan(0);
      }
    }
  });

  it("every `silent` tile is an actual tile", () => {
    for (const { id, config } of activities) {
      const parsed = phonicsWordbuildConfig.parse(config);
      const tiles = new Set(parsed.tiles);
      for (const t of parsed.silent ?? []) {
        expect(tiles.has(t), `${id}: silent tile "${t}" is not one of its tiles`).toBe(true);
      }
    }
  });

  it("every target word is buildable from its tiles (greedy longest-first)", () => {
    // Mirrors segmentWord() in the Player: a word the tray can't spell is unplayable.
    const segment = (word: string, tiles: string[]): string[] => {
      const byLen = [...new Set(tiles)].sort((a, b) => b.length - a.length);
      const segs: string[] = [];
      let i = 0;
      const w = word.toLowerCase();
      while (i < w.length) {
        const m = byLen.find((t) => w.startsWith(t.toLowerCase(), i));
        if (!m) {
          segs.push(w.slice(i));
          break;
        }
        segs.push(m);
        i += m.length;
      }
      return segs;
    };
    for (const { id, config } of activities) {
      const parsed = phonicsWordbuildConfig.parse(config);
      const tiles = new Set(parsed.tiles.map((t) => t.toLowerCase()));
      for (const { word } of parsed.words) {
        for (const seg of segment(word, parsed.tiles)) {
          expect(tiles.has(seg.toLowerCase()), `${id}: "${word}" needs missing tile "${seg}"`).toBe(
            true,
          );
        }
      }
    }
  });

  it("rejects oversized configs so generated content can't fan out TTS prewarm", () => {
    // Every tile is pre-synthesized to durable TTS; without a cap a bad generated
    // config could trigger hundreds of warm calls. Schema caps the array sizes.
    const tooManyTiles = {
      focus: "x",
      instruction: "y",
      tiles: Array.from({ length: 200 }, (_, i) => `t${i}`),
      words: [{ word: "test" }],
    };
    expect(() => phonicsWordbuildConfig.parse(tooManyTiles)).toThrow();

    const tooManyWords = {
      focus: "x",
      instruction: "y",
      tiles: ["a", "b"],
      words: Array.from({ length: 50 }, (_, i) => ({ word: `w${i}` })),
    };
    expect(() => phonicsWordbuildConfig.parse(tooManyWords)).toThrow();
  });

  it("the reported 'six syllable types' activity fixes the known-bad tiles", () => {
    // Regression for the original bug: in isolation ta→"tah", ble→"blee",
    // ti→"tee", ger→"jer" (soft g). Each must carry an IPA override now.
    const a = activities.find((x) => x.id === "word-r4-a1");
    expect(a, "word-r4-a1 (Build by syllable type) should exist").toBeDefined();
    const say = phonicsWordbuildConfig.parse(a!.config).say ?? {};
    for (const tile of ["ta", "ble", "ti", "ger"]) {
      expect(say[tile]?.trim(), `word-r4-a1 missing override for "${tile}"`).toBeTruthy();
    }
  });
});
