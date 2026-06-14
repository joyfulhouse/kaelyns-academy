import type { Program } from "../../types";
import { zhuyinUnit } from "./zhuyin";
import { spanishUnit } from "./spanish";
import { japaneseUnit } from "./japanese";
import { koreanUnit } from "./korean";

/**
 * Program — World Languages. One Unit (strand) per language; each advances
 * independently on the same mastery engine as the core curriculum, and the
 * learner switches into it from the core program on the kid surface.
 *
 * Linguistic facts live in the authored inventories (src/content/languages);
 * the bounded AI generator fills pedagogical variety, never the facts. Each unit
 * here is a starter ladder — deeper rungs are layered in by the content pass.
 */
export const worldLanguages: Program = {
  slug: "world-languages",
  title: "World Languages",
  subtitle: "Four languages, one adventure at a time",
  ageBand: "Multilingual explorer",
  summary:
    "Explore four languages: read Zhuyin for the Mandarin you already speak, and discover Spanish, Japanese, and Korean from scratch. Meet new symbols, listen closely, and learn words and phrases. Each language is its own strand and climbs at its own pace.",
  units: [zhuyinUnit, spanishUnit, japaneseUnit, koreanUnit],
};
