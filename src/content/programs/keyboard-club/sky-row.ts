import type { Unit } from "../../types";

// ── Unit 2 · Sky Row ──────────────────────────────────────────────────
// The top row, reached from — and returned to — the home row. Pure top-row
// drills resolve to exactly ["typing.keys.top-row"]; the mixed catch round
// touches both rows it has learned so far, so its tags are the union.
export const skyRowUnit: Unit = {
  id: "sky-row",
  order: 2,
  title: "Sky Row",
  emoji: "☁️",
  world: "space",
  bigIdea: "Reach up to the sky row, then come straight back home.",
  phonicsFocus: "",
  mathFocus: "",
  project: "Reach up for a letter and come back to the bumps without looking.",
  lessons: [
    {
      id: "sky-reach",
      order: 1,
      title: "Reach for the Sky Row",
      activities: [
        {
          id: "sky-left",
          kind: "typing-keys",
          title: "Left hand reaches up",
          blurb: "Q, W, E, R, T — reach up from your left hand's home keys.",
          estMinutes: 4,
          band: "ready",
          skillTags: ["typing.keys.top-row"],
          config: {
            instruction: "Reach up with your left hand, then come back home.",
            keys: ["q", "w", "e", "r", "t"],
            reps: 2,
          },
        },
        {
          id: "sky-right",
          kind: "typing-keys",
          title: "Right hand reaches up",
          blurb: "Y, U, I, O, P — reach up from your right hand's home keys.",
          estMinutes: 4,
          band: "ready",
          skillTags: ["typing.keys.top-row"],
          config: {
            instruction: "Reach up with your right hand, then come back home.",
            keys: ["y", "u", "i", "o", "p"],
            reps: 2,
          },
        },
      ],
    },
    {
      id: "sky-catch",
      order: 2,
      title: "Sky Row Catch",
      activities: [
        {
          id: "sky-catch-top",
          kind: "typing-catch",
          title: "Star Catch: sky row",
          blurb: "Pop each star before it lands.",
          estMinutes: 3,
          band: "ready",
          skillTags: ["typing.keys.top-row"],
          config: {
            instruction: "Type the letter on each star to pop it!",
            pool: ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
            durationSec: 45,
            lives: 3,
            speed: "gentle",
          },
        },
        {
          id: "sky-catch-mixed",
          kind: "typing-catch",
          title: "Star Catch: home and sky",
          blurb: "Stars from both rows now — stay ready to reach.",
          estMinutes: 3,
          band: "stretch",
          skillTags: ["typing.keys.home-row", "typing.keys.top-row"],
          config: {
            instruction: "Type the letter on each star to pop it!",
            pool: ["a", "s", "d", "f", "q", "w", "e", "r"],
            durationSec: 45,
            lives: 3,
            speed: "gentle",
          },
        },
      ],
    },
  ],
};
