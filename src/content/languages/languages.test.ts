import { describe, expect, it } from "vitest";
import { LANGUAGE_LIST, LANGUAGES, getLanguage, getScriptEntry } from "./index";

/**
 * Integrity guards for the authored canonical inventories. These are the source
 * of truth the AI generator and audio pipeline trust, so the shape and the
 * stability of ids (= audio clip keys) must hold.
 */
describe("World Languages inventories", () => {
  it("registers all four languages keyed by id", () => {
    expect(Object.keys(LANGUAGES).sort()).toEqual(["japanese", "korean", "spanish", "zhuyin"]);
    for (const lang of LANGUAGE_LIST) {
      expect(LANGUAGES[lang.id]).toBe(lang);
      expect(getLanguage(lang.id)).toBe(lang);
    }
  });

  it("each language has a non-empty inventory with no duplicate ids", () => {
    for (const lang of LANGUAGE_LIST) {
      expect(lang.inventory.length).toBeGreaterThan(0);
      const ids = lang.inventory.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("every entry has the required fields populated", () => {
    for (const lang of LANGUAGE_LIST) {
      for (const e of lang.inventory) {
        expect(e.id.trim()).toBeTruthy();
        expect(e.symbol.trim()).toBeTruthy();
        expect(e.romanization.trim()).toBeTruthy();
        expect(e.spoken.trim()).toBeTruthy();
      }
    }
  });

  it("entry ids are globally unique across languages (stable audio clip keys)", () => {
    const all = LANGUAGE_LIST.flatMap((l) => l.inventory.map((e) => e.id));
    expect(new Set(all).size).toBe(all.length);
  });

  it("resolves entries by id", () => {
    expect(getScriptEntry("zhuyin", "zhuyin-b")?.romanization).toBe("b");
    expect(getScriptEntry("japanese", "hiragana-a")?.symbol).toBe("あ");
    expect(getScriptEntry("korean", "jamo-a")?.symbol).toBe("ㅏ");
    expect(getScriptEntry("spanish", "es-hola")?.meaning).toMatch(/hello/i);
  });
});
