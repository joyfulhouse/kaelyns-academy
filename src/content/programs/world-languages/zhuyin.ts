import type { Unit } from "../../types";

/**
 * Zhuyin / Bopomofo — script-mapping for the Mandarin the learner already
 * speaks. She maps 37 symbols + 4 tone marks onto sounds she knows. Starter
 * ladder; the content pass extends through medials/finals, tones, and reading.
 */
export const zhuyinUnit: Unit = {
  id: "zhuyin",
  order: 1,
  title: "Zhuyin (注音)",
  emoji: "🔤",
  world: "sunshine",
  bigIdea: "You already know every sound. Now learn to read the symbols that write them.",
  phonicsFocus: "Symbols → tones → reading",
  mathFocus: "5 levels",
  project: "Read a short line written all in Zhuyin, with tone marks.",
  lessons: [
    {
      id: "zhuyin-l1",
      order: 1,
      title: "Meet ㄅ ㄆ ㄇ ㄈ",
      activities: [
        {
          id: "zhuyin-l1-a1",
          kind: "lang-symbol-intro",
          title: "Meet ㄅ ㄆ ㄇ ㄈ",
          blurb: "Sounds you know, written a new way.",
          estMinutes: 6,
          band: "ready",
          skillTags: ["zhuyin.symbols.initials"],
          config: {
            locale: "zh-TW",
            instruction: "These symbols spell sounds you already know. Tap each one to hear it.",
            skillTags: ["zhuyin.symbols.initials"],
            symbols: [
              { id: "zhuyin-b", symbol: "ㄅ", romanization: "b", spoken: "ㄅ", example: "ㄅㄚ" },
              { id: "zhuyin-p", symbol: "ㄆ", romanization: "p", spoken: "ㄆ", example: "ㄆㄚ" },
              { id: "zhuyin-m", symbol: "ㄇ", romanization: "m", spoken: "ㄇ", example: "ㄇㄚ" },
              { id: "zhuyin-f", symbol: "ㄈ", romanization: "f", spoken: "ㄈ", example: "ㄈㄚ" },
            ],
            verify: [
              { prompt: "Which one says “b”?", choices: ["ㄅ", "ㄆ", "ㄇ", "ㄈ"], answerIndex: 0 },
              { prompt: "Which one says “m”?", choices: ["ㄅ", "ㄆ", "ㄇ", "ㄈ"], answerIndex: 2 },
            ],
          },
        },
        {
          id: "zhuyin-l1-a2",
          kind: "lang-listen-match",
          title: "Hear it, tap it",
          blurb: "Listen, then tap the symbol you heard.",
          estMinutes: 5,
          band: "ready",
          skillTags: ["zhuyin.symbols.initials"],
          config: {
            locale: "zh-TW",
            instruction: "Listen. Then tap the symbol you heard.",
            skillTags: ["zhuyin.symbols.initials"],
            items: [
              {
                spoken: "ㄅ",
                choices: ["ㄅ", "ㄆ", "ㄇ", "ㄈ"],
                choiceLabels: ["b", "p", "m", "f"],
                answerIndex: 0,
              },
              {
                spoken: "ㄇ",
                choices: ["ㄅ", "ㄆ", "ㄇ", "ㄈ"],
                choiceLabels: ["b", "p", "m", "f"],
                answerIndex: 2,
              },
            ],
          },
        },
      ],
    },
  ],
};
