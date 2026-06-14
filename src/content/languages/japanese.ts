/**
 * Japanese (ja-JP) — authored canonical inventory.
 *
 * Target learner: an English-speaking ~6-year-old absolute beginner.
 * Linguistic correctness is paramount; this file is the single source of truth
 * the bounded practice generator and the audio pipeline draw from. The model
 * never invents a symbol or its sound.
 *
 * v1 scope (intentionally minimal):
 *   - 46 basic hiragana (gojuon) — NO dakuten / handakuten / yoon combos.
 *   - 46 basic katakana, matching the hiragana set sound-for-sound.
 *   - 6 everyday greetings, 10 cardinal numbers.
 *
 * Romanization is strict Hepburn romaji (shi / chi / tsu / fu / wo; macrons on
 * long vowels in words). For each standalone kana, spoken = the kana itself so
 * the ja-JP TTS voice reads the native glyph, not the romaji.
 */
import type { LanguageDef, ScriptEntry } from "./types";

/**
 * The 46 basic hiragana in gojuon order (a-i-u-e-o across each consonant row).
 * ids are hiragana-<hepburn-romaji>; the vowel ids are exactly a/i/u/e/o.
 */
const hiragana: ScriptEntry[] = [
  // vowels (a, i, u, e, o)
  { id: "hiragana-a", symbol: "あ", romanization: "a", spoken: "あ", group: "hiragana" },
  { id: "hiragana-i", symbol: "い", romanization: "i", spoken: "い", group: "hiragana" },
  { id: "hiragana-u", symbol: "う", romanization: "u", spoken: "う", group: "hiragana" },
  { id: "hiragana-e", symbol: "え", romanization: "e", spoken: "え", group: "hiragana" },
  { id: "hiragana-o", symbol: "お", romanization: "o", spoken: "お", group: "hiragana" },
  // k-row
  { id: "hiragana-ka", symbol: "か", romanization: "ka", spoken: "か", group: "hiragana" },
  { id: "hiragana-ki", symbol: "き", romanization: "ki", spoken: "き", group: "hiragana" },
  { id: "hiragana-ku", symbol: "く", romanization: "ku", spoken: "く", group: "hiragana" },
  { id: "hiragana-ke", symbol: "け", romanization: "ke", spoken: "け", group: "hiragana" },
  { id: "hiragana-ko", symbol: "こ", romanization: "ko", spoken: "こ", group: "hiragana" },
  // s-row (note: shi, not si)
  { id: "hiragana-sa", symbol: "さ", romanization: "sa", spoken: "さ", group: "hiragana" },
  { id: "hiragana-shi", symbol: "し", romanization: "shi", spoken: "し", group: "hiragana" },
  { id: "hiragana-su", symbol: "す", romanization: "su", spoken: "す", group: "hiragana" },
  { id: "hiragana-se", symbol: "せ", romanization: "se", spoken: "せ", group: "hiragana" },
  { id: "hiragana-so", symbol: "そ", romanization: "so", spoken: "そ", group: "hiragana" },
  // t-row (note: chi, tsu)
  { id: "hiragana-ta", symbol: "た", romanization: "ta", spoken: "た", group: "hiragana" },
  { id: "hiragana-chi", symbol: "ち", romanization: "chi", spoken: "ち", group: "hiragana" },
  { id: "hiragana-tsu", symbol: "つ", romanization: "tsu", spoken: "つ", group: "hiragana" },
  { id: "hiragana-te", symbol: "て", romanization: "te", spoken: "て", group: "hiragana" },
  { id: "hiragana-to", symbol: "と", romanization: "to", spoken: "と", group: "hiragana" },
  // n-row
  { id: "hiragana-na", symbol: "な", romanization: "na", spoken: "な", group: "hiragana" },
  { id: "hiragana-ni", symbol: "に", romanization: "ni", spoken: "に", group: "hiragana" },
  { id: "hiragana-nu", symbol: "ぬ", romanization: "nu", spoken: "ぬ", group: "hiragana" },
  { id: "hiragana-ne", symbol: "ね", romanization: "ne", spoken: "ね", group: "hiragana" },
  { id: "hiragana-no", symbol: "の", romanization: "no", spoken: "の", group: "hiragana" },
  // h-row (note: fu, not hu)
  { id: "hiragana-ha", symbol: "は", romanization: "ha", spoken: "は", group: "hiragana" },
  { id: "hiragana-hi", symbol: "ひ", romanization: "hi", spoken: "ひ", group: "hiragana" },
  { id: "hiragana-fu", symbol: "ふ", romanization: "fu", spoken: "ふ", group: "hiragana" },
  { id: "hiragana-he", symbol: "へ", romanization: "he", spoken: "へ", group: "hiragana" },
  { id: "hiragana-ho", symbol: "ほ", romanization: "ho", spoken: "ほ", group: "hiragana" },
  // m-row
  { id: "hiragana-ma", symbol: "ま", romanization: "ma", spoken: "ま", group: "hiragana" },
  { id: "hiragana-mi", symbol: "み", romanization: "mi", spoken: "み", group: "hiragana" },
  { id: "hiragana-mu", symbol: "む", romanization: "mu", spoken: "む", group: "hiragana" },
  { id: "hiragana-me", symbol: "め", romanization: "me", spoken: "め", group: "hiragana" },
  { id: "hiragana-mo", symbol: "も", romanization: "mo", spoken: "も", group: "hiragana" },
  // y-row (only ya, yu, yo)
  { id: "hiragana-ya", symbol: "や", romanization: "ya", spoken: "や", group: "hiragana" },
  { id: "hiragana-yu", symbol: "ゆ", romanization: "yu", spoken: "ゆ", group: "hiragana" },
  { id: "hiragana-yo", symbol: "よ", romanization: "yo", spoken: "よ", group: "hiragana" },
  // r-row
  { id: "hiragana-ra", symbol: "ら", romanization: "ra", spoken: "ら", group: "hiragana" },
  { id: "hiragana-ri", symbol: "り", romanization: "ri", spoken: "り", group: "hiragana" },
  { id: "hiragana-ru", symbol: "る", romanization: "ru", spoken: "る", group: "hiragana" },
  { id: "hiragana-re", symbol: "れ", romanization: "re", spoken: "れ", group: "hiragana" },
  { id: "hiragana-ro", symbol: "ろ", romanization: "ro", spoken: "ろ", group: "hiragana" },
  // w-row + n (only wa, wo, and the moraic n)
  { id: "hiragana-wa", symbol: "わ", romanization: "wa", spoken: "わ", group: "hiragana" },
  { id: "hiragana-wo", symbol: "を", romanization: "wo", spoken: "を", group: "hiragana" },
  { id: "hiragana-n", symbol: "ん", romanization: "n", spoken: "ん", group: "hiragana" },
];

/**
 * The 46 basic katakana, same gojuon order and same Hepburn romaji as the
 * hiragana set above (sound-for-sound). ids are katakana-<hepburn-romaji>.
 */
const katakana: ScriptEntry[] = [
  // vowels (a, i, u, e, o)
  { id: "katakana-a", symbol: "ア", romanization: "a", spoken: "ア", group: "katakana" },
  { id: "katakana-i", symbol: "イ", romanization: "i", spoken: "イ", group: "katakana" },
  { id: "katakana-u", symbol: "ウ", romanization: "u", spoken: "ウ", group: "katakana" },
  { id: "katakana-e", symbol: "エ", romanization: "e", spoken: "エ", group: "katakana" },
  { id: "katakana-o", symbol: "オ", romanization: "o", spoken: "オ", group: "katakana" },
  // k-row
  { id: "katakana-ka", symbol: "カ", romanization: "ka", spoken: "カ", group: "katakana" },
  { id: "katakana-ki", symbol: "キ", romanization: "ki", spoken: "キ", group: "katakana" },
  { id: "katakana-ku", symbol: "ク", romanization: "ku", spoken: "ク", group: "katakana" },
  { id: "katakana-ke", symbol: "ケ", romanization: "ke", spoken: "ケ", group: "katakana" },
  { id: "katakana-ko", symbol: "コ", romanization: "ko", spoken: "コ", group: "katakana" },
  // s-row (note: shi, not si)
  { id: "katakana-sa", symbol: "サ", romanization: "sa", spoken: "サ", group: "katakana" },
  { id: "katakana-shi", symbol: "シ", romanization: "shi", spoken: "シ", group: "katakana" },
  { id: "katakana-su", symbol: "ス", romanization: "su", spoken: "ス", group: "katakana" },
  { id: "katakana-se", symbol: "セ", romanization: "se", spoken: "セ", group: "katakana" },
  { id: "katakana-so", symbol: "ソ", romanization: "so", spoken: "ソ", group: "katakana" },
  // t-row (note: chi, tsu)
  { id: "katakana-ta", symbol: "タ", romanization: "ta", spoken: "タ", group: "katakana" },
  { id: "katakana-chi", symbol: "チ", romanization: "chi", spoken: "チ", group: "katakana" },
  { id: "katakana-tsu", symbol: "ツ", romanization: "tsu", spoken: "ツ", group: "katakana" },
  { id: "katakana-te", symbol: "テ", romanization: "te", spoken: "テ", group: "katakana" },
  { id: "katakana-to", symbol: "ト", romanization: "to", spoken: "ト", group: "katakana" },
  // n-row
  { id: "katakana-na", symbol: "ナ", romanization: "na", spoken: "ナ", group: "katakana" },
  { id: "katakana-ni", symbol: "ニ", romanization: "ni", spoken: "ニ", group: "katakana" },
  { id: "katakana-nu", symbol: "ヌ", romanization: "nu", spoken: "ヌ", group: "katakana" },
  { id: "katakana-ne", symbol: "ネ", romanization: "ne", spoken: "ネ", group: "katakana" },
  { id: "katakana-no", symbol: "ノ", romanization: "no", spoken: "ノ", group: "katakana" },
  // h-row (note: fu, not hu)
  { id: "katakana-ha", symbol: "ハ", romanization: "ha", spoken: "ハ", group: "katakana" },
  { id: "katakana-hi", symbol: "ヒ", romanization: "hi", spoken: "ヒ", group: "katakana" },
  { id: "katakana-fu", symbol: "フ", romanization: "fu", spoken: "フ", group: "katakana" },
  { id: "katakana-he", symbol: "ヘ", romanization: "he", spoken: "ヘ", group: "katakana" },
  { id: "katakana-ho", symbol: "ホ", romanization: "ho", spoken: "ホ", group: "katakana" },
  // m-row
  { id: "katakana-ma", symbol: "マ", romanization: "ma", spoken: "マ", group: "katakana" },
  { id: "katakana-mi", symbol: "ミ", romanization: "mi", spoken: "ミ", group: "katakana" },
  { id: "katakana-mu", symbol: "ム", romanization: "mu", spoken: "ム", group: "katakana" },
  { id: "katakana-me", symbol: "メ", romanization: "me", spoken: "メ", group: "katakana" },
  { id: "katakana-mo", symbol: "モ", romanization: "mo", spoken: "モ", group: "katakana" },
  // y-row (only ya, yu, yo)
  { id: "katakana-ya", symbol: "ヤ", romanization: "ya", spoken: "ヤ", group: "katakana" },
  { id: "katakana-yu", symbol: "ユ", romanization: "yu", spoken: "ユ", group: "katakana" },
  { id: "katakana-yo", symbol: "ヨ", romanization: "yo", spoken: "ヨ", group: "katakana" },
  // r-row
  { id: "katakana-ra", symbol: "ラ", romanization: "ra", spoken: "ラ", group: "katakana" },
  { id: "katakana-ri", symbol: "リ", romanization: "ri", spoken: "リ", group: "katakana" },
  { id: "katakana-ru", symbol: "ル", romanization: "ru", spoken: "ル", group: "katakana" },
  { id: "katakana-re", symbol: "レ", romanization: "re", spoken: "レ", group: "katakana" },
  { id: "katakana-ro", symbol: "ロ", romanization: "ro", spoken: "ロ", group: "katakana" },
  // w-row + n (only wa, wo, and the moraic n)
  { id: "katakana-wa", symbol: "ワ", romanization: "wa", spoken: "ワ", group: "katakana" },
  { id: "katakana-wo", symbol: "ヲ", romanization: "wo", spoken: "ヲ", group: "katakana" },
  { id: "katakana-n", symbol: "ン", romanization: "n", spoken: "ン", group: "katakana" },
];

/**
 * Everyday greetings. Romanization uses Hepburn with macrons on long vowels
 * (arigato -> arigatou, etc.). spoken = the native word for natural TTS.
 */
const greetings: ScriptEntry[] = [
  {
    id: "ja-konnichiwa",
    symbol: "こんにちは",
    romanization: "konnichiwa",
    spoken: "こんにちは",
    group: "greetings",
    meaning: "Hello",
  },
  {
    id: "ja-arigatou",
    symbol: "ありがとう",
    romanization: "arigatō",
    spoken: "ありがとう",
    group: "greetings",
    meaning: "Thank you",
  },
  {
    id: "ja-sayounara",
    symbol: "さようなら",
    romanization: "sayōnara",
    spoken: "さようなら",
    group: "greetings",
    meaning: "Goodbye",
  },
  {
    id: "ja-ohayou",
    symbol: "おはよう",
    romanization: "ohayō",
    spoken: "おはよう",
    group: "greetings",
    meaning: "Good morning",
  },
  {
    id: "ja-hai",
    symbol: "はい",
    romanization: "hai",
    spoken: "はい",
    group: "greetings",
    meaning: "yes",
  },
  {
    id: "ja-iie",
    symbol: "いいえ",
    romanization: "iie",
    spoken: "いいえ",
    group: "greetings",
    meaning: "no",
  },
];

/**
 * Cardinal numbers 1-10 (Sino-Japanese readings; yon for 4, nana for 7).
 * Long vowels carry macrons in Hepburn (kyu -> kyū, ju -> jū).
 */
const numbers: ScriptEntry[] = [
  { id: "ja-num-1", symbol: "いち", romanization: "ichi", spoken: "いち", group: "numbers", meaning: "one" },
  { id: "ja-num-2", symbol: "に", romanization: "ni", spoken: "に", group: "numbers", meaning: "two" },
  { id: "ja-num-3", symbol: "さん", romanization: "san", spoken: "さん", group: "numbers", meaning: "three" },
  { id: "ja-num-4", symbol: "よん", romanization: "yon", spoken: "よん", group: "numbers", meaning: "four" },
  { id: "ja-num-5", symbol: "ご", romanization: "go", spoken: "ご", group: "numbers", meaning: "five" },
  { id: "ja-num-6", symbol: "ろく", romanization: "roku", spoken: "ろく", group: "numbers", meaning: "six" },
  { id: "ja-num-7", symbol: "なな", romanization: "nana", spoken: "なな", group: "numbers", meaning: "seven" },
  { id: "ja-num-8", symbol: "はち", romanization: "hachi", spoken: "はち", group: "numbers", meaning: "eight" },
  { id: "ja-num-9", symbol: "きゅう", romanization: "kyū", spoken: "きゅう", group: "numbers", meaning: "nine" },
  { id: "ja-num-10", symbol: "じゅう", romanization: "jū", spoken: "じゅう", group: "numbers", meaning: "ten" },
];

export const japanese: LanguageDef = {
  id: "japanese",
  locale: "ja-JP",
  displayName: "Japanese",
  nativeName: "日本語",
  emoji: "⛩️",
  mode: "l2-from-scratch",
  romanization: "romaji",
  voice: { lang: "ja-JP", preferredVoiceNames: ["Kyoko", "O-ren"], rate: 0.8 },
  inventory: [...hiragana, ...katakana, ...greetings, ...numbers],
};
