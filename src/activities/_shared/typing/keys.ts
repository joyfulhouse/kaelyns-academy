import type { SkillTag } from "@/content/types";

/**
 * US-QWERTY key geography for Keyboard Club. Pure and server-safe: scoring,
 * content validation, and the KeyboardMap all read these same tables, so the
 * board a child sees and the skills an attempt claims can never disagree.
 *
 * Scope is slice-1 deliberate: letters, space, and the four punctuation keys
 * that sit on the lettered rows. The number row and symbols are out of scope.
 */

export type Hand = "left" | "right";
export type Finger = "pinky" | "ring" | "middle" | "index" | "thumb";
export type TypingRow = "top" | "home" | "bottom" | "space";

export const TYPING_ROWS = {
  top: ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  home: ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";"],
  bottom: ["z", "x", "c", "v", "b", "n", "m", ",", ".", "/"],
} as const satisfies Record<Exclude<TypingRow, "space">, readonly string[]>;

/** Touch-typing finger assignment. `g`/`h` are the index-finger reaches. */
export const KEY_FINGERS: Record<string, { hand: Hand; finger: Finger }> = {
  q: { hand: "left", finger: "pinky" },
  a: { hand: "left", finger: "pinky" },
  z: { hand: "left", finger: "pinky" },
  w: { hand: "left", finger: "ring" },
  s: { hand: "left", finger: "ring" },
  x: { hand: "left", finger: "ring" },
  e: { hand: "left", finger: "middle" },
  d: { hand: "left", finger: "middle" },
  c: { hand: "left", finger: "middle" },
  r: { hand: "left", finger: "index" },
  f: { hand: "left", finger: "index" },
  v: { hand: "left", finger: "index" },
  t: { hand: "left", finger: "index" },
  g: { hand: "left", finger: "index" },
  b: { hand: "left", finger: "index" },
  y: { hand: "right", finger: "index" },
  h: { hand: "right", finger: "index" },
  n: { hand: "right", finger: "index" },
  u: { hand: "right", finger: "index" },
  j: { hand: "right", finger: "index" },
  m: { hand: "right", finger: "index" },
  i: { hand: "right", finger: "middle" },
  k: { hand: "right", finger: "middle" },
  ",": { hand: "right", finger: "middle" },
  o: { hand: "right", finger: "ring" },
  l: { hand: "right", finger: "ring" },
  ".": { hand: "right", finger: "ring" },
  p: { hand: "right", finger: "pinky" },
  ";": { hand: "right", finger: "pinky" },
  "/": { hand: "right", finger: "pinky" },
  " ": { hand: "right", finger: "thumb" },
};

const ROW_SKILL: Record<TypingRow, SkillTag> = {
  top: "typing.keys.top-row",
  home: "typing.keys.home-row",
  bottom: "typing.keys.bottom-row",
  space: "typing.keys.space",
};

/** Case-insensitive: "A" is the same physical key as "a". */
export function isTeachableKey(char: string): boolean {
  return KEY_FINGERS[char.toLowerCase()] !== undefined;
}

/** True only for a letter authored as a capital, never punctuation or space. */
export function isCapitalKey(char: string): boolean {
  return char !== char.toLowerCase();
}

export function rowOf(char: string): TypingRow {
  const lower = char.toLowerCase();
  if (lower === " ") return "space";
  if ((TYPING_ROWS.top as readonly string[]).includes(lower)) return "top";
  if ((TYPING_ROWS.home as readonly string[]).includes(lower)) return "home";
  if ((TYPING_ROWS.bottom as readonly string[]).includes(lower)) return "bottom";
  throw new Error(`untaught key: ${char}`);
}

/**
 * A capital is shift work no matter which row the letter lives on — reaching
 * for the far-hand shift is the skill being practiced, not the letter.
 */
export function skillForKey(char: string): SkillTag {
  if (char === " ") return ROW_SKILL.space;
  if (char !== char.toLowerCase()) return "typing.keys.shift";
  return ROW_SKILL[rowOf(char)];
}

/**
 * The single skill-derivation rule both typing kinds use, so a config and its
 * authored `skillTags` can be checked against one another. Multi-character
 * targets are word typing; the individual letters are assumed by then.
 *
 * Word typing splits by what the hands actually have to do. "sad" and "flask"
 * never move a finger off its resting key; "jump" and "fish" mean reaching to
 * the top and bottom rows and finding home again. One shared tag made the
 * harder unit a strict subset of the easier one, so a child who had only typed
 * home-row words read as done with word typing and the tutor stopped offering
 * her the unit that teaches the reaches. Derived from the letters rather than
 * authored, so `skillTags` and `skillsAffected` cannot drift apart.
 *
 * A set containing ANY reach is a reaching set: the easy words in it are
 * warm-up, and crediting the home-row skill for them would re-open the same
 * subset hole from the other side.
 */
export function skillsForTargets(targets: readonly string[]): SkillTag[] {
  if (targets.some((target) => target.length !== 1)) {
    return [targetsStayOnHomeRow(targets) ? "typing.words.familiar" : "typing.words.reach"];
  }
  return [...new Set(targets.map(skillForKey))].sort();
}

/**
 * True when every character of every target rests on the home row. Space is
 * free — the thumb never leaves it — and a capital is judged by its letter,
 * since shift is tracked separately as its own skill.
 *
 * Deliberately does NOT use `rowOf`, which throws on anything it doesn't teach.
 * This runs over authored words and whole sentences (and, through
 * `skillsAffected`, over generated practice), so a comma or an exclamation mark
 * must classify, not explode. Anything that isn't a home-row letter is a reach —
 * which is also true of punctuation, since reaching for it leaves home.
 */
function targetsStayOnHomeRow(targets: readonly string[]): boolean {
  const home = TYPING_ROWS.home as readonly string[];
  return targets.every((target) =>
    [...target].every((char) => {
      const lower = char.toLowerCase();
      return lower === " " || home.includes(lower);
    }),
  );
}
