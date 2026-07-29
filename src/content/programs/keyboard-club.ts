import type { Program } from "../types";
import { bigLettersUnit } from "./keyboard-club/big-letters";
import { homeBaseUnit } from "./keyboard-club/home-base";
import { skyRowUnit } from "./keyboard-club/sky-row";
import { underGroundUnit } from "./keyboard-club/under-ground";
import { wordWorkshopUnit } from "./keyboard-club/word-workshop";

/**
 * Program 03 — Keyboard Club.
 *
 * Units walk the keyboard by row, because that is how a hand learns it: anchor
 * at the bumps, reach up, reach down, then add space and shift. Word Workshop
 * closes the arc: with every letter reachable, the drills move from single
 * keys to whole words and short sentences.
 *
 * This is the one program that requires a physical keyboard; every Player
 * renders through `TypingStage`, which explains itself on a tablet rather than
 * degrading into a game that cannot teach typing.
 */
export const keyboardClub: Program = {
  slug: "keyboard-club",
  title: "Keyboard Club",
  subtitle: "Teach your fingers where the letters live",
  ageBand: "Ages 6–8 · needs a computer keyboard",
  summary:
    "A keyboard is a map, and your fingers can learn it by heart. Start at the two little bumps, reach up to the sky row and down to the ground, then add spaces and big letters — a few minutes at a time, until you stop hunting for keys.",
  units: [homeBaseUnit, skyRowUnit, underGroundUnit, bigLettersUnit, wordWorkshopUnit],
};
