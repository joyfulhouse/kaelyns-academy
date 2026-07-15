import type { Program } from "../types";
import { decodableReadersUnit } from "./kaelyn-adaptive/decodable-readers";
import { lifeSkillsMathUnit } from "./kaelyn-adaptive/life-skills-math";
import { mathUnit } from "./kaelyn-adaptive/math";
import { mathBaselineUnit } from "./kaelyn-adaptive/math-baseline";
import { readingUnit } from "./kaelyn-adaptive/reading";
import { readingBaselineUnit } from "./kaelyn-adaptive/reading-baseline";
import { scienceNatureUnit } from "./kaelyn-adaptive/science-nature";
import { wordStudyUnit } from "./kaelyn-adaptive/word-study";
import { writingUnit } from "./kaelyn-adaptive/writing";

/**
 * Program 02 — Kaelyn's Adaptive Curriculum.
 * Typed from docs/curriculum/kaelyn-adaptive/ (README + the four strand ladders).
 * The curriculum docs are the human source of truth; this is the machine
 * representation the app renders and the tutor levels against.
 *
 * The platform's content model (Program → Unit → Lesson → Activity) is reused
 * pragmatically here: the four STRANDS become Units, each rung becomes a Lesson
 * (title = rung name), and activities are leveled, skill-tagged samples drawn
 * straight from the strand docs (band: "ready" = at-rung, "stretch" = the reach
 * that points at the next rung). This is genuinely at Kaelyn's level —
 * multiplication, morphology, inference, composition — not review.
 *
 * Unit fields are repurposed (the UI just renders them): bigIdea = the strand's
 * purpose, phonicsFocus/mathFocus = two short descriptors, project = the
 * strand's big goal. Strands are independent ladders; there is no week order.
 */
export const kaelynAdaptive: Program = {
  slug: "kaelyn-adaptive",
  title: "Kaelyn's Adaptive Curriculum",
  subtitle: "Four strands, each at her real level",
  ageBand: "Advanced & asynchronous · just finished K",
  summary:
    "A personalized, mastery-based curriculum where every strand starts where she actually is and climbs from there, one mastered skill at a time. Reading and math run at full speed; writing is bridged so big ideas are never trapped by a small hand. She is here to learn new things, not review.",
  units: [
    readingUnit,
    wordStudyUnit,
    writingUnit,
    mathUnit,
    lifeSkillsMathUnit,
    scienceNatureUnit,
    decodableReadersUnit,
    readingBaselineUnit,
    mathBaselineUnit,
  ],
};
