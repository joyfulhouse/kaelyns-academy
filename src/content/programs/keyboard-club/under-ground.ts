import type { Unit } from "../../types";

// ── Unit 3 · Under Ground ─────────────────────────────────────────────
// The bottom row, reached from — and returned to — the home row. Pure
// bottom-row drills resolve to exactly ["typing.keys.bottom-row"]; the final
// catch round mixes all three rows learned so far, so its tags are the union.
export const underGroundUnit: Unit = {
  id: "under-ground",
  order: 3,
  title: "Under Ground",
  emoji: "🌱",
  world: "garden",
  bigIdea: "Reach down to the bottom row, then come straight back home.",
  phonicsFocus: "",
  mathFocus: "",
  project: "Reach down for a letter and come back to the bumps without looking.",
  lessons: [
    {
      id: "under-reach",
      order: 1,
      title: "Reach for the Ground",
      activities: [
        {
          id: "under-left",
          kind: "typing-keys",
          title: "Left hand reaches down",
          blurb: "Z, X, C, V, B — reach down from your left hand's home keys.",
          estMinutes: 4,
          band: "ready",
          skillTags: ["typing.keys.bottom-row"],
          config: {
            instruction: "Reach down with your left hand, then come back home.",
            keys: ["z", "x", "c", "v", "b"],
            reps: 2,
          },
        },
        {
          id: "under-right",
          kind: "typing-keys",
          title: "Right hand reaches down",
          blurb: "N and M — reach down from your right hand's home keys.",
          estMinutes: 3,
          band: "ready",
          skillTags: ["typing.keys.bottom-row"],
          config: {
            instruction: "Reach down with your right hand, then come back home.",
            keys: ["n", "m"],
            reps: 3,
          },
        },
      ],
    },
    {
      id: "under-catch",
      order: 2,
      title: "Ground Row Catch",
      activities: [
        {
          id: "under-catch-bottom",
          kind: "typing-catch",
          title: "Star Catch: bottom row",
          blurb: "Pop each star before it lands.",
          estMinutes: 3,
          band: "ready",
          skillTags: ["typing.keys.bottom-row"],
          config: {
            instruction: "Type the letter on each star to pop it!",
            pool: ["z", "x", "c", "v", "b", "n", "m"],
            durationSec: 45,
            lives: 3,
            speed: "gentle",
          },
        },
        {
          id: "under-catch-all",
          kind: "typing-catch",
          title: "Star Catch: every row",
          blurb: "Stars from all three rows now — home, sky, and ground.",
          estMinutes: 4,
          band: "stretch",
          skillTags: [
            "typing.keys.home-row",
            "typing.keys.top-row",
            "typing.keys.bottom-row",
          ],
          config: {
            instruction: "Type the letter on each star to pop it!",
            pool: ["a", "s", "d", "f", "q", "w", "z", "x", "n", "m"],
            durationSec: 60,
            lives: 3,
            speed: "gentle",
          },
        },
      ],
    },
  ],
};
