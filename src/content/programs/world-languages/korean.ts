import type { Unit } from "../../types";

/**
 * Korean — a new language with a logical, learnable alphabet. Letters combine
 * into syllable blocks; start with the basic vowel jamo. Starter ladder; the
 * content pass extends through consonant jamo, syllable blocks, and greetings.
 */
export const koreanUnit: Unit = {
  id: "korean",
  order: 4,
  title: "한국어",
  emoji: "🏮",
  world: "space",
  bigIdea: "Korean letters snap together into blocks. Learn the pieces, then build.",
  phonicsFocus: "Vowels → consonants → blocks",
  mathFocus: "5 levels",
  project: "Write your name as a Korean syllable block.",
  lessons: [
    {
      id: "korean-l1",
      order: 1,
      title: "Vowels (ㅏ ㅓ ㅗ ㅜ ㅣ)",
      activities: [
        {
          id: "korean-l1-a1",
          kind: "lang-symbol-intro",
          title: "The first five vowels",
          blurb: "Each one is a sound you can say.",
          estMinutes: 7,
          band: "ready",
          skillTags: ["korean.vowels"],
          config: {
            locale: "ko-KR",
            instruction: "Korean vowels are simple lines. Tap each one to hear it.",
            skillTags: ["korean.vowels"],
            symbols: [
              { id: "jamo-a", symbol: "ㅏ", romanization: "a", spoken: "아" },
              { id: "jamo-eo", symbol: "ㅓ", romanization: "eo", spoken: "어" },
              { id: "jamo-o", symbol: "ㅗ", romanization: "o", spoken: "오" },
              { id: "jamo-u", symbol: "ㅜ", romanization: "u", spoken: "우" },
              { id: "jamo-i", symbol: "ㅣ", romanization: "i", spoken: "이" },
            ],
            verify: [
              { prompt: "Which vowel says “a”?", choices: ["ㅏ", "ㅓ", "ㅗ", "ㅜ", "ㅣ"], answerIndex: 0 },
              { prompt: "Which vowel says “o”?", choices: ["ㅏ", "ㅓ", "ㅗ", "ㅜ", "ㅣ"], answerIndex: 2 },
            ],
          },
        },
        {
          id: "korean-l1-a2",
          kind: "lang-listen-match",
          title: "Hear it, tap it",
          blurb: "Listen, then tap the vowel you heard.",
          estMinutes: 5,
          band: "ready",
          skillTags: ["korean.listening", "korean.vowels"],
          config: {
            locale: "ko-KR",
            instruction: "Listen. Then tap the Korean vowel you heard.",
            skillTags: ["korean.listening", "korean.vowels"],
            items: [
              {
                spoken: "아",
                choices: ["ㅏ", "ㅓ", "ㅗ", "ㅜ", "ㅣ"],
                choiceLabels: ["a", "eo", "o", "u", "i"],
                answerIndex: 0,
              },
              {
                spoken: "오",
                choices: ["ㅏ", "ㅓ", "ㅗ", "ㅜ", "ㅣ"],
                choiceLabels: ["a", "eo", "o", "u", "i"],
                answerIndex: 2,
              },
            ],
          },
        },
      ],
    },
  ],
};
