import type { Unit } from "../../types";

/**
 * Japanese — a new language with its own scripts. Start with hiragana, one row
 * at a time (the five vowels first). Starter ladder; the content pass extends
 * through the kana rows, first katakana, and greetings.
 */
export const japaneseUnit: Unit = {
  id: "japanese",
  order: 3,
  title: "日本語",
  emoji: "⛩️",
  world: "ocean",
  bigIdea: "Japanese has its own alphabet — actually two. Start with hiragana, one row at a time.",
  phonicsFocus: "Hiragana → katakana → words",
  mathFocus: "6 levels",
  project: "Read your name written in katakana.",
  lessons: [
    {
      id: "japanese-l1",
      order: 1,
      title: "Hiragana vowels (あ い う え お)",
      activities: [
        {
          id: "japanese-l1-a1",
          kind: "lang-symbol-intro",
          title: "Five hiragana, five sounds",
          blurb: "Every Japanese syllable starts here.",
          estMinutes: 7,
          band: "ready",
          skillTags: ["japanese.hiragana-vowels"],
          config: {
            locale: "ja-JP",
            instruction: "These five hiragana are the vowel sounds. Tap each one to hear it.",
            skillTags: ["japanese.hiragana-vowels"],
            symbols: [
              { id: "hiragana-a", symbol: "あ", romanization: "a", spoken: "あ" },
              { id: "hiragana-i", symbol: "い", romanization: "i", spoken: "い" },
              { id: "hiragana-u", symbol: "う", romanization: "u", spoken: "う" },
              { id: "hiragana-e", symbol: "え", romanization: "e", spoken: "え" },
              { id: "hiragana-o", symbol: "お", romanization: "o", spoken: "お" },
            ],
            verify: [
              { prompt: "Which hiragana says “a”?", choices: ["あ", "い", "う", "え", "お"], answerIndex: 0 },
              { prompt: "Which hiragana says “u”?", choices: ["あ", "い", "う", "え", "お"], answerIndex: 2 },
            ],
          },
        },
        {
          id: "japanese-l1-a2",
          kind: "lang-listen-match",
          title: "Hear it, tap it",
          blurb: "Listen, then tap the hiragana you heard.",
          estMinutes: 5,
          band: "ready",
          skillTags: ["japanese.listening", "japanese.hiragana-vowels"],
          config: {
            locale: "ja-JP",
            instruction: "Listen. Then tap the hiragana you heard.",
            skillTags: ["japanese.listening", "japanese.hiragana-vowels"],
            items: [
              {
                spoken: "あ",
                choices: ["あ", "い", "う", "え", "お"],
                choiceLabels: ["a", "i", "u", "e", "o"],
                answerIndex: 0,
              },
              {
                spoken: "お",
                choices: ["あ", "い", "う", "え", "お"],
                choiceLabels: ["a", "i", "u", "e", "o"],
                answerIndex: 4,
              },
            ],
          },
        },
      ],
    },
  ],
};
