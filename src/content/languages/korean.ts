/**
 * Korean (ko-KR) — authored canonical inventory.
 *
 * Source of truth for the bounded practice generator and the audio pipeline.
 * Linguistic correctness is paramount: this teaches an English-speaking ~6-year-old
 * beginner. Romanization is Revised Romanization (RR) of Korean.
 *
 * TTS note (CRITICAL): a lone vowel jamo (e.g. the bare ARE-A vowel) and most lone
 * consonant jamo do not voice well in ko-KR TTS. So `symbol` shows the bare jamo,
 * but `spoken` is always a full SYLLABLE block:
 *   - vowels -> the silent-onset (IEUNG) block, e.g. bare "a" vowel -> the "a" syllable.
 *   - consonants -> consonant + the "a" vowel (a clear CV syllable), e.g. -> "ga".
 *   - IEUNG as an onset is silent, so its `spoken` is its jamo name (IEUNG itself).
 * ASCII-only comments throughout.
 */
import type { LanguageDef, ScriptEntry } from "./types";

/** 10 basic vowel jamo. symbol = bare jamo; spoken = its IEUNG-onset syllable. */
const vowels: ScriptEntry[] = [
  { id: "jamo-a", symbol: "ㅏ", romanization: "a", spoken: "아", group: "vowels" },
  { id: "jamo-eo", symbol: "ㅓ", romanization: "eo", spoken: "어", group: "vowels" },
  { id: "jamo-o", symbol: "ㅗ", romanization: "o", spoken: "오", group: "vowels" },
  { id: "jamo-u", symbol: "ㅜ", romanization: "u", spoken: "우", group: "vowels" },
  { id: "jamo-eu", symbol: "ㅡ", romanization: "eu", spoken: "으", group: "vowels" },
  { id: "jamo-i", symbol: "ㅣ", romanization: "i", spoken: "이", group: "vowels" },
  { id: "jamo-ya", symbol: "ㅑ", romanization: "ya", spoken: "야", group: "vowels" },
  { id: "jamo-yeo", symbol: "ㅕ", romanization: "yeo", spoken: "여", group: "vowels" },
  { id: "jamo-yo", symbol: "ㅛ", romanization: "yo", spoken: "요", group: "vowels" },
  { id: "jamo-yu", symbol: "ㅠ", romanization: "yu", spoken: "유", group: "vowels" },
];

/**
 * 14 basic consonant jamo. symbol = bare jamo; spoken = a clear CV syllable
 * (consonant + the "a" vowel). IEUNG is a silent onset, so spoken = its name.
 */
const consonants: ScriptEntry[] = [
  { id: "jamo-g", symbol: "ㄱ", romanization: "g", spoken: "가", group: "consonants" },
  { id: "jamo-n", symbol: "ㄴ", romanization: "n", spoken: "나", group: "consonants" },
  { id: "jamo-d", symbol: "ㄷ", romanization: "d", spoken: "다", group: "consonants" },
  { id: "jamo-r", symbol: "ㄹ", romanization: "r", spoken: "라", group: "consonants" },
  { id: "jamo-m", symbol: "ㅁ", romanization: "m", spoken: "마", group: "consonants" },
  { id: "jamo-b", symbol: "ㅂ", romanization: "b", spoken: "바", group: "consonants" },
  { id: "jamo-s", symbol: "ㅅ", romanization: "s", spoken: "사", group: "consonants" },
  // IEUNG: silent as an onset; voiced only as a final. Speak its jamo name.
  { id: "jamo-ng", symbol: "ㅇ", romanization: "ng", spoken: "이응", group: "consonants" },
  { id: "jamo-j", symbol: "ㅈ", romanization: "j", spoken: "자", group: "consonants" },
  { id: "jamo-ch", symbol: "ㅊ", romanization: "ch", spoken: "차", group: "consonants" },
  { id: "jamo-k", symbol: "ㅋ", romanization: "k", spoken: "카", group: "consonants" },
  { id: "jamo-t", symbol: "ㅌ", romanization: "t", spoken: "타", group: "consonants" },
  { id: "jamo-p", symbol: "ㅍ", romanization: "p", spoken: "파", group: "consonants" },
  { id: "jamo-h", symbol: "ㅎ", romanization: "h", spoken: "하", group: "consonants" },
];

/**
 * ~12 common CV syllable blocks. spoken = the block itself.
 * meaning only where the block is a real standalone word.
 */
const syllables: ScriptEntry[] = [
  { id: "syl-ga", symbol: "가", romanization: "ga", spoken: "가", group: "syllables" },
  { id: "syl-na", symbol: "나", romanization: "na", spoken: "나", group: "syllables", meaning: "I / me" },
  { id: "syl-da", symbol: "다", romanization: "da", spoken: "다", group: "syllables" },
  { id: "syl-ra", symbol: "라", romanization: "ra", spoken: "라", group: "syllables" },
  { id: "syl-ma", symbol: "마", romanization: "ma", spoken: "마", group: "syllables" },
  { id: "syl-ba", symbol: "바", romanization: "ba", spoken: "바", group: "syllables" },
  { id: "syl-sa", symbol: "사", romanization: "sa", spoken: "사", group: "syllables" },
  { id: "syl-a", symbol: "아", romanization: "a", spoken: "아", group: "syllables" },
  { id: "syl-ja", symbol: "자", romanization: "ja", spoken: "자", group: "syllables" },
  { id: "syl-ha", symbol: "하", romanization: "ha", spoken: "하", group: "syllables" },
  { id: "syl-go", symbol: "고", romanization: "go", spoken: "고", group: "syllables" },
  { id: "syl-mu", symbol: "무", romanization: "mu", spoken: "무", group: "syllables", meaning: "radish" },
];

/** Everyday greetings and yes/no. spoken = the phrase itself. */
const greetings: ScriptEntry[] = [
  {
    id: "ko-annyeonghaseyo",
    symbol: "안녕하세요",
    romanization: "annyeonghaseyo",
    spoken: "안녕하세요",
    group: "greetings",
    meaning: "Hello",
  },
  {
    id: "ko-gamsahamnida",
    symbol: "감사합니다",
    romanization: "gamsahamnida",
    spoken: "감사합니다",
    group: "greetings",
    meaning: "Thank you",
  },
  {
    id: "ko-annyeong",
    symbol: "안녕",
    romanization: "annyeong",
    spoken: "안녕",
    group: "greetings",
    meaning: "Hi / Bye",
  },
  { id: "ko-ne", symbol: "네", romanization: "ne", spoken: "네", group: "greetings", meaning: "yes" },
  { id: "ko-aniyo", symbol: "아니요", romanization: "aniyo", spoken: "아니요", group: "greetings", meaning: "no" },
];

/** Native Korean numbers 1-10. spoken = the number word itself. */
const numbers: ScriptEntry[] = [
  { id: "ko-num-1", symbol: "하나", romanization: "hana", spoken: "하나", group: "numbers", meaning: "one" },
  { id: "ko-num-2", symbol: "둘", romanization: "dul", spoken: "둘", group: "numbers", meaning: "two" },
  { id: "ko-num-3", symbol: "셋", romanization: "set", spoken: "셋", group: "numbers", meaning: "three" },
  { id: "ko-num-4", symbol: "넷", romanization: "net", spoken: "넷", group: "numbers", meaning: "four" },
  { id: "ko-num-5", symbol: "다섯", romanization: "daseot", spoken: "다섯", group: "numbers", meaning: "five" },
  { id: "ko-num-6", symbol: "여섯", romanization: "yeoseot", spoken: "여섯", group: "numbers", meaning: "six" },
  { id: "ko-num-7", symbol: "일곱", romanization: "ilgop", spoken: "일곱", group: "numbers", meaning: "seven" },
  { id: "ko-num-8", symbol: "여덟", romanization: "yeodeol", spoken: "여덟", group: "numbers", meaning: "eight" },
  { id: "ko-num-9", symbol: "아홉", romanization: "ahop", spoken: "아홉", group: "numbers", meaning: "nine" },
  { id: "ko-num-10", symbol: "열", romanization: "yeol", spoken: "열", group: "numbers", meaning: "ten" },
];

export const korean: LanguageDef = {
  id: "korean",
  locale: "ko-KR",
  displayName: "Korean",
  nativeName: "한국어",
  emoji: "🏮",
  mode: "l2-from-scratch",
  romanization: "revised-romanization",
  voice: { lang: "ko-KR", preferredVoiceNames: ["Yuna", "Sora"], rate: 0.82 },
  inventory: [...vowels, ...consonants, ...syllables, ...greetings, ...numbers],
};
