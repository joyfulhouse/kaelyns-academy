import type { Unit } from "../../types";
import { spokenVerifications } from "./spoken-verifications";

/**
 * Japanese — a new language with its own scripts (actually two). Starter ladder
 * for a ~6-year-old absolute beginner: learn hiragana one row at a time (vowels,
 * then k/s/t, then n/h/m), take a first taste of katakana mapped to the same
 * sounds, and finish with everyday greetings. Every kana/word is drawn verbatim
 * from the authored inventory (src/content/languages/japanese.ts) — symbol,
 * romanization, spoken, and id (which doubles as the audio clip key) are never
 * invented. Each lesson teaches with one see+hear intro, then an audio-first
 * "hear it, tap it" match. Romaji rides along as the helper label.
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
              { id: "hiragana-a", symbol: "あ", romanization: "a", spoken: "あ", audioKey: "hiragana-a" },
              { id: "hiragana-i", symbol: "い", romanization: "i", spoken: "い", audioKey: "hiragana-i" },
              { id: "hiragana-u", symbol: "う", romanization: "u", spoken: "う", audioKey: "hiragana-u" },
              { id: "hiragana-e", symbol: "え", romanization: "e", spoken: "え", audioKey: "hiragana-e" },
              { id: "hiragana-o", symbol: "お", romanization: "o", spoken: "お", audioKey: "hiragana-o" },
            ],
            verify: spokenVerifications([
              { prompt: "Which hiragana says “a”?", choices: ["あ", "い", "う", "え", "お"], answerIndex: 0 },
              { prompt: "Which hiragana says “u”?", choices: ["あ", "い", "う", "え", "お"], answerIndex: 2 },
              { prompt: "Which hiragana says “o”?", choices: ["あ", "い", "う", "え", "お"], answerIndex: 4 },
            ]),
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
              { spoken: "あ", audioKey: "hiragana-a", choices: ["あ", "い", "う", "え", "お"], choiceLabels: ["a", "i", "u", "e", "o"], answerIndex: 0 },
              { spoken: "え", audioKey: "hiragana-e", choices: ["あ", "い", "う", "え", "お"], choiceLabels: ["a", "i", "u", "e", "o"], answerIndex: 3 },
              { spoken: "お", audioKey: "hiragana-o", choices: ["あ", "い", "う", "え", "お"], choiceLabels: ["a", "i", "u", "e", "o"], answerIndex: 4 },
              { spoken: "い", audioKey: "hiragana-i", choices: ["あ", "い", "う", "え", "お"], choiceLabels: ["a", "i", "u", "e", "o"], answerIndex: 1 },
            ],
          },
        },
      ],
    },
    {
      id: "japanese-l2",
      order: 2,
      title: "Hiragana か・さ・た rows",
      activities: [
        {
          id: "japanese-l2-a1",
          kind: "lang-symbol-intro",
          title: "k, s, and t sounds",
          blurb: "Add a consonant in front of each vowel.",
          estMinutes: 7,
          band: "ready",
          skillTags: ["japanese.hiragana-k-s-t"],
          config: {
            locale: "ja-JP",
            instruction: "New hiragana from the か, さ, and た rows. Tap each one to hear it.",
            skillTags: ["japanese.hiragana-k-s-t"],
            symbols: [
              { id: "hiragana-ka", symbol: "か", romanization: "ka", spoken: "か", audioKey: "hiragana-ka" },
              { id: "hiragana-ki", symbol: "き", romanization: "ki", spoken: "き", audioKey: "hiragana-ki" },
              { id: "hiragana-ku", symbol: "く", romanization: "ku", spoken: "く", audioKey: "hiragana-ku" },
              { id: "hiragana-sa", symbol: "さ", romanization: "sa", spoken: "さ", audioKey: "hiragana-sa" },
              { id: "hiragana-shi", symbol: "し", romanization: "shi", spoken: "し", audioKey: "hiragana-shi" },
              { id: "hiragana-ta", symbol: "た", romanization: "ta", spoken: "た", audioKey: "hiragana-ta" },
            ],
            verify: spokenVerifications([
              { prompt: "Which hiragana says “ka”?", choices: ["か", "さ", "た", "き"], answerIndex: 0 },
              { prompt: "Which hiragana says “shi”?", choices: ["さ", "し", "き", "た"], answerIndex: 1 },
              { prompt: "Which hiragana says “ta”?", choices: ["か", "く", "た", "さ"], answerIndex: 2 },
            ]),
          },
        },
        {
          id: "japanese-l2-a2",
          kind: "lang-listen-match",
          title: "Hear it, tap it",
          blurb: "Listen, then tap the hiragana you heard.",
          estMinutes: 5,
          band: "ready",
          skillTags: ["japanese.listening", "japanese.hiragana-k-s-t"],
          config: {
            locale: "ja-JP",
            instruction: "Listen. Then tap the hiragana you heard.",
            skillTags: ["japanese.listening", "japanese.hiragana-k-s-t"],
            items: [
              { spoken: "か", audioKey: "hiragana-ka", choices: ["か", "さ", "た", "き"], choiceLabels: ["ka", "sa", "ta", "ki"], answerIndex: 0 },
              { spoken: "し", audioKey: "hiragana-shi", choices: ["く", "し", "さ", "た"], choiceLabels: ["ku", "shi", "sa", "ta"], answerIndex: 1 },
              { spoken: "た", audioKey: "hiragana-ta", choices: ["き", "か", "た", "し"], choiceLabels: ["ki", "ka", "ta", "shi"], answerIndex: 2 },
              { spoken: "き", audioKey: "hiragana-ki", choices: ["さ", "た", "か", "き"], choiceLabels: ["sa", "ta", "ka", "ki"], answerIndex: 3 },
              { spoken: "さ", audioKey: "hiragana-sa", choices: ["さ", "く", "し", "た"], choiceLabels: ["sa", "ku", "shi", "ta"], answerIndex: 0 },
            ],
          },
        },
      ],
    },
    {
      id: "japanese-l3",
      order: 3,
      title: "Hiragana な・は・ま rows",
      activities: [
        {
          id: "japanese-l3-a1",
          kind: "lang-symbol-intro",
          title: "n, h, and m sounds",
          blurb: "Three more rows of soft, friendly sounds.",
          estMinutes: 7,
          band: "ready",
          skillTags: ["japanese.hiragana-n-h-m"],
          config: {
            locale: "ja-JP",
            instruction: "New hiragana from the な, は, and ま rows. Tap each one to hear it.",
            skillTags: ["japanese.hiragana-n-h-m"],
            symbols: [
              { id: "hiragana-na", symbol: "な", romanization: "na", spoken: "な", audioKey: "hiragana-na" },
              { id: "hiragana-ni", symbol: "に", romanization: "ni", spoken: "に", audioKey: "hiragana-ni" },
              { id: "hiragana-ha", symbol: "は", romanization: "ha", spoken: "は", audioKey: "hiragana-ha" },
              { id: "hiragana-hi", symbol: "ひ", romanization: "hi", spoken: "ひ", audioKey: "hiragana-hi" },
              { id: "hiragana-ma", symbol: "ま", romanization: "ma", spoken: "ま", audioKey: "hiragana-ma" },
              { id: "hiragana-mi", symbol: "み", romanization: "mi", spoken: "み", audioKey: "hiragana-mi" },
            ],
            verify: spokenVerifications([
              { prompt: "Which hiragana says “na”?", choices: ["な", "は", "ま", "に"], answerIndex: 0 },
              { prompt: "Which hiragana says “ha”?", choices: ["ま", "は", "な", "み"], answerIndex: 1 },
              { prompt: "Which hiragana says “mi”?", choices: ["に", "ひ", "み", "な"], answerIndex: 2 },
            ]),
          },
        },
        {
          id: "japanese-l3-a2",
          kind: "lang-listen-match",
          title: "Hear it, tap it",
          blurb: "Listen, then tap the hiragana you heard.",
          estMinutes: 5,
          band: "ready",
          skillTags: ["japanese.listening", "japanese.hiragana-n-h-m"],
          config: {
            locale: "ja-JP",
            instruction: "Listen. Then tap the hiragana you heard.",
            skillTags: ["japanese.listening", "japanese.hiragana-n-h-m"],
            items: [
              { spoken: "な", audioKey: "hiragana-na", choices: ["な", "は", "ま", "に"], choiceLabels: ["na", "ha", "ma", "ni"], answerIndex: 0 },
              { spoken: "ひ", audioKey: "hiragana-hi", choices: ["み", "ひ", "に", "は"], choiceLabels: ["mi", "hi", "ni", "ha"], answerIndex: 1 },
              { spoken: "ま", audioKey: "hiragana-ma", choices: ["な", "は", "ま", "み"], choiceLabels: ["na", "ha", "ma", "mi"], answerIndex: 2 },
              { spoken: "に", audioKey: "hiragana-ni", choices: ["は", "ま", "な", "に"], choiceLabels: ["ha", "ma", "na", "ni"], answerIndex: 3 },
              { spoken: "は", audioKey: "hiragana-ha", choices: ["は", "ひ", "ま", "な"], choiceLabels: ["ha", "hi", "ma", "na"], answerIndex: 0 },
            ],
          },
        },
      ],
    },
    {
      id: "japanese-l4",
      order: 4,
      title: "Meet katakana (ア イ ウ エ オ)",
      activities: [
        {
          id: "japanese-l4-a1",
          kind: "lang-symbol-intro",
          title: "The second alphabet",
          blurb: "Same sounds you know — a new, blockier shape.",
          estMinutes: 7,
          band: "ready",
          skillTags: ["japanese.katakana-intro"],
          config: {
            locale: "ja-JP",
            instruction: "Katakana spells the same sounds as hiragana. These five are the vowels. Tap each to hear it.",
            skillTags: ["japanese.katakana-intro"],
            symbols: [
              { id: "katakana-a", symbol: "ア", romanization: "a", spoken: "ア", audioKey: "katakana-a" },
              { id: "katakana-i", symbol: "イ", romanization: "i", spoken: "イ", audioKey: "katakana-i" },
              { id: "katakana-u", symbol: "ウ", romanization: "u", spoken: "ウ", audioKey: "katakana-u" },
              { id: "katakana-e", symbol: "エ", romanization: "e", spoken: "エ", audioKey: "katakana-e" },
              { id: "katakana-o", symbol: "オ", romanization: "o", spoken: "オ", audioKey: "katakana-o" },
              { id: "katakana-ka", symbol: "カ", romanization: "ka", spoken: "カ", audioKey: "katakana-ka" },
            ],
            verify: spokenVerifications([
              { prompt: "Which katakana says “a”?", choices: ["ア", "イ", "ウ", "エ", "オ"], answerIndex: 0 },
              { prompt: "Which katakana says “i”?", choices: ["ア", "イ", "ウ", "エ", "オ"], answerIndex: 1 },
              { prompt: "Which katakana says “ka”?", choices: ["オ", "ウ", "カ", "エ"], answerIndex: 2 },
            ]),
          },
        },
        {
          id: "japanese-l4-a2",
          kind: "lang-listen-match",
          title: "Hear it, tap it",
          blurb: "Listen, then tap the katakana you heard.",
          estMinutes: 5,
          band: "ready",
          skillTags: ["japanese.listening", "japanese.katakana-intro"],
          config: {
            locale: "ja-JP",
            instruction: "Listen. Then tap the katakana you heard.",
            skillTags: ["japanese.listening", "japanese.katakana-intro"],
            items: [
              { spoken: "ア", audioKey: "katakana-a", choices: ["ア", "イ", "ウ", "エ", "オ"], choiceLabels: ["a", "i", "u", "e", "o"], answerIndex: 0 },
              { spoken: "ウ", audioKey: "katakana-u", choices: ["ア", "イ", "ウ", "エ", "オ"], choiceLabels: ["a", "i", "u", "e", "o"], answerIndex: 2 },
              { spoken: "オ", audioKey: "katakana-o", choices: ["ア", "イ", "ウ", "エ", "オ"], choiceLabels: ["a", "i", "u", "e", "o"], answerIndex: 4 },
              { spoken: "カ", audioKey: "katakana-ka", choices: ["ア", "エ", "カ", "オ"], choiceLabels: ["a", "e", "ka", "o"], answerIndex: 2 },
            ],
          },
        },
      ],
    },
    {
      id: "japanese-l5",
      order: 5,
      title: "Everyday greetings (こんにちは)",
      activities: [
        {
          id: "japanese-l5-a1",
          kind: "lang-symbol-intro",
          title: "Words you can say today",
          blurb: "Hello, thank you, goodbye — your first real words.",
          estMinutes: 7,
          band: "ready",
          skillTags: ["japanese.greetings"],
          config: {
            locale: "ja-JP",
            instruction: "Whole words now! Tap each greeting to hear it, and see what it means.",
            skillTags: ["japanese.greetings"],
            symbols: [
              { id: "ja-konnichiwa", symbol: "こんにちは", romanization: "konnichiwa", spoken: "こんにちは", audioKey: "ja-konnichiwa", meaning: "Hello" },
              { id: "ja-ohayou", symbol: "おはよう", romanization: "ohayō", spoken: "おはよう", audioKey: "ja-ohayou", meaning: "Good morning" },
              { id: "ja-arigatou", symbol: "ありがとう", romanization: "arigatō", spoken: "ありがとう", audioKey: "ja-arigatou", meaning: "Thank you" },
              { id: "ja-sayounara", symbol: "さようなら", romanization: "sayōnara", spoken: "さようなら", audioKey: "ja-sayounara", meaning: "Goodbye" },
              { id: "ja-hai", symbol: "はい", romanization: "hai", spoken: "はい", audioKey: "ja-hai", meaning: "yes" },
              { id: "ja-iie", symbol: "いいえ", romanization: "iie", spoken: "いいえ", audioKey: "ja-iie", meaning: "no" },
            ],
            verify: spokenVerifications([
              { prompt: "Which word means “Hello”?", choices: ["こんにちは", "ありがとう", "さようなら"], answerIndex: 0 },
              { prompt: "Which word means “Thank you”?", choices: ["おはよう", "ありがとう", "はい"], answerIndex: 1 },
              { prompt: "Which word means “Goodbye”?", choices: ["はい", "いいえ", "さようなら"], answerIndex: 2 },
            ]),
          },
        },
        {
          id: "japanese-l5-a2",
          kind: "lang-listen-match",
          title: "Hear it, tap it",
          blurb: "Listen, then tap the greeting you heard.",
          estMinutes: 5,
          band: "ready",
          skillTags: ["japanese.listening", "japanese.greetings"],
          config: {
            locale: "ja-JP",
            instruction: "Listen. Then tap the greeting you heard.",
            skillTags: ["japanese.listening", "japanese.greetings"],
            items: [
              { spoken: "こんにちは", audioKey: "ja-konnichiwa", choices: ["こんにちは", "ありがとう", "さようなら", "おはよう"], choiceLabels: ["konnichiwa", "arigatō", "sayōnara", "ohayō"], answerIndex: 0 },
              { spoken: "ありがとう", audioKey: "ja-arigatou", choices: ["おはよう", "ありがとう", "はい", "いいえ"], choiceLabels: ["ohayō", "arigatō", "hai", "iie"], answerIndex: 1 },
              { spoken: "さようなら", audioKey: "ja-sayounara", choices: ["こんにちは", "おはよう", "さようなら", "ありがとう"], choiceLabels: ["konnichiwa", "ohayō", "sayōnara", "arigatō"], answerIndex: 2 },
              { spoken: "おはよう", audioKey: "ja-ohayou", choices: ["はい", "いいえ", "ありがとう", "おはよう"], choiceLabels: ["hai", "iie", "arigatō", "ohayō"], answerIndex: 3 },
              { spoken: "はい", audioKey: "ja-hai", choices: ["はい", "いいえ", "こんにちは"], choiceLabels: ["hai", "iie", "konnichiwa"], answerIndex: 0 },
            ],
          },
        },
      ],
    },
  ],
};
