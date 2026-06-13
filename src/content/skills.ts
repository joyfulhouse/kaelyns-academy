import type { Skill, SkillTag } from "./types";

/** The skill rubric backing Program 01, derived from
 *  docs/curriculum/summer-k-to-grade1/ (the "ready" vs "2nd-grade stretch" tables). */
export const SKILLS: Skill[] = [
  // Phonics
  { slug: "phonics.cvc", domain: "phonics", label: "Short vowels & CVC", readyIndicator: "Blends and reads CVC words (cat, sun)", stretchIndicator: "Reads CVC fluently in connected text" },
  { slug: "phonics.digraphs", domain: "phonics", label: "Digraphs (sh, ch, th, wh, ck)", readyIndicator: "Reads words with two-letter sounds", stretchIndicator: "Spells digraph words unprompted" },
  { slug: "phonics.blends.initial", domain: "phonics", label: "Beginning blends (bl, st, gr)", readyIndicator: "Reads words starting with a blend", stretchIndicator: "Reads three-letter blends (spr, str)" },
  { slug: "phonics.blends.final", domain: "phonics", label: "Ending blends (-nd, -st, -mp)", readyIndicator: "Reads words ending in a blend" },
  { slug: "phonics.silent-e", domain: "phonics", label: "Silent-e / long vowels", readyIndicator: "Reads a_e, i_e, o_e words (cake, bike)", stretchIndicator: "Contrasts cap/cape automatically" },
  { slug: "phonics.vowel-teams", domain: "phonics", label: "Vowel teams (ai, ay, ee, ea, oa)", readyIndicator: "Reads common vowel-team words", stretchIndicator: "Reads multisyllable vowel-team words" },
  { slug: "phonics.r-controlled", domain: "phonics", label: "R-controlled (ar, or, er, ir, ur)", readyIndicator: "Reads bossy-r words (car, bird)" },
  { slug: "phonics.diphthongs", domain: "phonics", label: "Diphthongs (oi, oy, ou, ow)", readyIndicator: "Reads gliding-vowel words (coin, cow)" },
  { slug: "phonics.endings", domain: "phonics", label: "Endings -s, -ed, -ing & syllables", readyIndicator: "Reads inflected endings", stretchIndicator: "Splits two-syllable words to decode" },

  // Reading
  { slug: "reading.sight-words", domain: "reading", label: "High-frequency (sight) words", readyIndicator: "Reads ~100 sight words", stretchIndicator: "Reads 150+ incl. Grade-2 list" },
  { slug: "reading.decodable", domain: "reading", label: "Reads & retells decodable books", readyIndicator: "Reads a simple book and retells it", stretchIndicator: "Reads early chapter books with phrasing" },

  // Writing
  { slug: "writing.sentence", domain: "writing", label: "Writes a complete sentence", readyIndicator: "Capital, spaces, period", stretchIndicator: "Writes a 3–5 sentence story" },

  // Math
  { slug: "math.counting", domain: "math", label: "Counting & comparing", readyIndicator: "Counts to 120; reads/writes to 100", stretchIndicator: "Skip-counts 2s/5s/10s; to 1000" },
  { slug: "math.place-value", domain: "math", label: "Place value (tens & ones)", readyIndicator: "Understands tens and ones", stretchIndicator: "Hundreds/tens/ones; compares 3-digit" },
  { slug: "math.addition", domain: "math", label: "Addition within 20", readyIndicator: "Adds within 20 (count-on, make-ten)", stretchIndicator: "Two-digit addition" },
  { slug: "math.subtraction", domain: "math", label: "Subtraction within 20", readyIndicator: "Subtracts within 20", stretchIndicator: "Two-digit subtraction" },
  { slug: "math.fluency", domain: "math", label: "Fact fluency & word problems", readyIndicator: "Fluent facts to 10; solves word problems" },
  { slug: "math.measurement", domain: "math", label: "Measurement", readyIndicator: "Compares and measures length" },
  { slug: "math.time-money", domain: "math", label: "Time & money", readyIndicator: "Tells time to hour/half", stretchIndicator: "Time to 5 min; counts coins" },
  { slug: "math.geometry", domain: "math", label: "Geometry & fractions", readyIndicator: "Names 2D/3D shapes; halves & fourths" },
  { slug: "math.skip-count", domain: "math", label: "Skip-counting & arrays", readyIndicator: "Skip-counts 2s/5s/10s", stretchIndicator: "Builds arrays (intro multiplication)" },

  // Habits
  { slug: "habits.stamina", domain: "habits", label: "Focus & persistence", readyIndicator: "Works independently for a short block" },
];

const BY_SLUG = new Map<SkillTag, Skill>(SKILLS.map((s) => [s.slug, s]));

export function getSkill(slug: SkillTag): Skill | undefined {
  return BY_SLUG.get(slug);
}
