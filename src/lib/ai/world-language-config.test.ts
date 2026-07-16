import { describe, expect, it } from "vitest";
import { getLanguage } from "@/content/languages";
import {
  inventorySlice,
  isLangKind,
  languageForSkillHints,
  validateLangItems,
} from "./world-language-config";

/**
 * Pure-guard tests for bounded World-Languages generation. No network: these
 * exercise the language-derivation + the anti-hallucination guard only.
 */

const zhuyin = getLanguage("zhuyin");
if (!zhuyin) throw new Error("test setup: zhuyin language missing");
const spanish = getLanguage("spanish");
if (!spanish) throw new Error("test setup: spanish language missing");
const japanese = getLanguage("japanese");
if (!japanese) throw new Error("test setup: japanese language missing");

// Real inventory glyphs to build valid fixtures from.
const bGlyph = "ㄅ"; // zhuyin-b (U+3105)
const pGlyph = "ㄆ"; // zhuyin-p (U+3106)
const mGlyph = "ㄇ"; // zhuyin-m (U+3107)
const zhuyinInitials = inventorySlice(zhuyin, "initials", ["zhuyin.symbols.initials"]);
const spanishGreetings = inventorySlice(spanish, "greetings", ["spanish.greetings"]);

describe("languageForSkillHints", () => {
  it("maps a zhuyin skill hint to the zhuyin language", () => {
    expect(languageForSkillHints(["zhuyin.symbols.initials"])?.id).toBe("zhuyin");
  });

  it("maps a spanish skill hint to the spanish language", () => {
    expect(languageForSkillHints(["spanish.greetings"])?.id).toBe("spanish");
  });

  it("maps japanese and korean hints to their languages", () => {
    expect(languageForSkillHints(["japanese.hiragana-vowels"])?.id).toBe("japanese");
    expect(languageForSkillHints(["korean.vowels"])?.id).toBe("korean");
  });

  it("skips non-language hints and uses the first language hint", () => {
    // reading.* is a real skill but not a language domain; spanish.* wins.
    expect(
      languageForSkillHints(["reading.fluency.phrasing", "spanish.numbers"])?.id,
    ).toBe("spanish");
  });

  it("returns undefined for unknown or non-language-only hints", () => {
    expect(languageForSkillHints(["not.a.real.skill"])).toBeUndefined();
    expect(languageForSkillHints(["math.mult.facts"])).toBeUndefined();
    expect(languageForSkillHints([])).toBeUndefined();
  });
});

describe("isLangKind", () => {
  it("recognizes the two language kinds and rejects others", () => {
    expect(isLangKind("lang-symbol-intro")).toBe(true);
    expect(isLangKind("lang-listen-match")).toBe(true);
    expect(isLangKind("phonics-wordbuild")).toBe(false);
  });
});

describe("inventorySlice", () => {
  it("narrows to a matching group by keyword and caps the size", () => {
    const slice = inventorySlice(zhuyin, "initials", ["zhuyin.symbols.initials"]);
    expect(slice.length).toBeGreaterThan(0);
    expect(slice.length).toBeLessThanOrEqual(40);
    // Every entry in the slice is an "initials" group member.
    expect(slice.every((e) => e.group === "initials")).toBe(true);
    expect(slice.some((e) => e.symbol === bGlyph)).toBe(true);
  });

  it("falls back to the whole inventory when nothing matches the focus", () => {
    const slice = inventorySlice(zhuyin, "xyzzy-nonsense", []);
    // Capped, but drawn from the full inventory (not empty).
    expect(slice.length).toBeGreaterThan(0);
    expect(slice.length).toBeLessThanOrEqual(40);
  });
});

describe("validateLangItems — lang-symbol-intro", () => {
  function symbolItem(symbol: string, choices: string[], answerIndex = 0) {
    return {
      locale: "zh-TW",
      instruction: "Tap the one you hear.",
      skillTags: ["zhuyin.symbols.initials"],
      // id intentionally wrong so we can assert the repair to the inventory id.
      symbols: [{ id: "wrong-id", symbol, romanization: "b", spoken: "ㄅㄛ" }],
      verify: [{ prompt: "Which one?", choices, answerIndex }],
    };
  }

  it("keeps a valid item and repairs the symbol id to the inventory id", () => {
    const item = symbolItem(bGlyph, [bGlyph, pGlyph], 0);
    const kept = validateLangItems("lang-symbol-intro", [item], zhuyin, zhuyinInitials);
    expect(kept).toHaveLength(1);
    // id repaired from "wrong-id" to the canonical inventory id for ㄅ.
    expect(kept[0].symbols[0].id).toBe("zhuyin-b");
  });

  it("canonicalizes child-facing fields from the inventory (right glyph, wrong facts)", () => {
    const entry = zhuyin.inventory.find((e) => e.symbol === bGlyph);
    if (!entry) throw new Error("test setup: ㄅ missing");
    const item = {
      locale: "en-US", // wrong locale
      instruction: "x",
      skillTags: ["zhuyin.symbols.initials"],
      // Right glyph, but wrong id / romanization / spoken / audioKey:
      symbols: [{ id: "made-up", symbol: bGlyph, romanization: "WRONG", spoken: "ㄆㄛ", audioKey: "made-up" }],
      verify: [{ prompt: "?", choices: [bGlyph, pGlyph], answerIndex: 0 }],
    };
    const [out] = validateLangItems("lang-symbol-intro", [item], zhuyin, zhuyinInitials);
    expect(out.locale).toBe(zhuyin.locale);
    expect(out.symbols[0].id).toBe(entry.id);
    expect(out.symbols[0].romanization).toBe(entry.romanization);
    expect(out.symbols[0].spoken).toBe(entry.spoken); // the wrong "ㄆㄛ" is overwritten
    expect(out.symbols[0].audioKey).toBe(entry.id);
  });

  it("DROPS an item whose shown symbol is a made-up glyph", () => {
    // "Ｂ" (fullwidth latin B, U+FF22) is NOT in the zhuyin inventory.
    const item = symbolItem("Ｂ", [bGlyph, pGlyph], 0);
    expect(() =>
      validateLangItems("lang-symbol-intro", [item], zhuyin, zhuyinInitials),
    ).toThrow();
  });

  it("rejects a real language glyph that is outside the supplied inventory slice", () => {
    const slice = zhuyin.inventory.filter(({ id }) =>
      ["zhuyin-b", "zhuyin-p", "zhuyin-m"].includes(id),
    );
    const item = symbolItem("ㄈ", ["ㄈ", pGlyph], 0);
    expect(() => validateLangItems("lang-symbol-intro", [item], zhuyin, slice)).toThrow();
  });

  it("deletes hallucinated optional fields when the canonical entry lacks them", () => {
    const slice = japanese.inventory.filter(({ id }) =>
      ["hiragana-a", "hiragana-i", "hiragana-u"].includes(id),
    );
    const item = {
      locale: japanese.locale,
      instruction: "Meet the vowels.",
      skillTags: ["made.up"],
      symbols: slice.map((entry) => ({
        ...entry,
        audioKey: entry.id,
        example: "hallucinated",
        exampleSpoken: "hallucinated",
        meaning: "hallucinated",
      })),
      verify: [
        {
          prompt: "Which one is a?",
          spokenPrompt: "Which one is a?",
          choices: slice.map(({ symbol }) => symbol),
          answerIndex: 0,
        },
      ],
    };
    const [out] = validateLangItems("lang-symbol-intro", [item], japanese, slice);
    expect(out.symbols[0]).not.toHaveProperty("example");
    expect(out.symbols[0]).not.toHaveProperty("exampleSpoken");
    expect(out.symbols[0]).not.toHaveProperty("meaning");
  });

  it("DROPS an item whose verify choice is a CJK look-alike, keeping the valid sibling", () => {
    // Katakana 'ハ' (U+30CF) visually rhymes with a bopomofo glyph but is NOT
    // in the zhuyin inventory — the anti-hallucination guard must reject it.
    const bad = symbolItem(bGlyph, [bGlyph, "ハ"], 0);
    const good = symbolItem(mGlyph, [mGlyph, pGlyph], 0);
    const kept = validateLangItems(
      "lang-symbol-intro",
      [bad, good],
      zhuyin,
      zhuyinInitials,
    );
    expect(kept).toHaveLength(1);
    expect(kept[0].symbols[0].symbol).toBe(mGlyph);
  });

  it("DROPS an item with an out-of-range answerIndex", () => {
    const item = symbolItem(bGlyph, [bGlyph, pGlyph], 5);
    expect(() =>
      validateLangItems("lang-symbol-intro", [item], zhuyin, zhuyinInitials),
    ).toThrow();
  });
});

describe("validateLangItems — lang-listen-match", () => {
  function listenItem(choices: string[], answerIndex = 0) {
    return {
      locale: "zh-TW",
      instruction: "Tap what you hear.",
      skillTags: ["zhuyin.symbols.initials"],
      items: [{ spoken: "ㄅㄛ", choices, answerIndex }],
    };
  }

  it("keeps an item whose every choice is an inventory glyph", () => {
    const kept = validateLangItems(
      "lang-listen-match",
      [listenItem([bGlyph, pGlyph, mGlyph], 0)],
      zhuyin,
      zhuyinInitials,
    );
    expect(kept).toHaveLength(1);
  });

  it("canonicalizes the heard sound + labels from the answer entry", () => {
    const mEntry = zhuyin.inventory.find((e) => e.symbol === mGlyph);
    const bEntry = zhuyin.inventory.find((e) => e.symbol === bGlyph);
    if (!mEntry || !bEntry) throw new Error("test setup: glyph missing");
    const item = {
      locale: "en-US",
      instruction: "x",
      skillTags: ["zhuyin.symbols.initials"],
      // Answer is ㄇ (index 1), but the model gave a wrong spoken / audioKey / labels:
      items: [
        { spoken: "WRONG", audioKey: "WRONG", choices: [bGlyph, mGlyph], choiceLabels: ["x", "y"], answerIndex: 1 },
      ],
    };
    const [out] = validateLangItems("lang-listen-match", [item], zhuyin, zhuyinInitials);
    expect(out.items[0].spoken).toBe(mEntry.spoken); // played = the answer's canonical sound
    expect(out.items[0].audioKey).toBe(mEntry.id);
    expect(out.items[0].choiceLabels).toEqual([bEntry.romanization, mEntry.romanization]);
  });

  it("DROPS an item with a glyph not in the inventory", () => {
    // 'B' is a plain ASCII letter, never an inventory symbol.
    expect(() =>
      validateLangItems(
        "lang-listen-match",
        [listenItem([bGlyph, "B"], 0)],
        zhuyin,
        zhuyinInitials,
      ),
    ).toThrow();
  });

  it("validates Spanish word-choices against the Spanish inventory", () => {
    const hola = "Hola"; // es-hola
    const adios = "Adiós"; // es-adios
    const good = {
      locale: "es-MX",
      instruction: "Tap what you hear.",
      skillTags: ["spanish.greetings"],
      items: [{ spoken: "Hola", choices: [hola, adios], answerIndex: 0 }],
    };
    expect(
      validateLangItems("lang-listen-match", [good], spanish, spanishGreetings),
    ).toHaveLength(1);

    // A plausible but non-inventory Spanish word must be rejected.
    const bad = {
      locale: "es-MX",
      instruction: "Tap what you hear.",
      skillTags: ["spanish.greetings"],
      items: [{ spoken: "Hola", choices: [hola, "Buenas"], answerIndex: 0 }],
    };
    expect(() =>
      validateLangItems("lang-listen-match", [bad], spanish, spanishGreetings),
    ).toThrow();
  });
});
