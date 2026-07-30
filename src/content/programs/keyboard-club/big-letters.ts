import type { Unit } from "../../types";

// ── Unit 4 · Big Letters ──────────────────────────────────────────────
// Space and shift are separate rungs: a thumb press cannot complete the
// capitals lesson, while every capital routes to shift no matter which row the
// letter sits on — reaching for shift is the skill, not the letter.
export const bigLettersUnit: Unit = {
  id: "big-letters",
  order: 4,
  title: "Big Letters",
  emoji: "🎪",
  world: "bigtop",
  bigIdea: "Thumbs make the spaces. Shift makes the big letters.",
  phonicsFocus: "",
  mathFocus: "",
  project: "Type your name with a big letter at the front.",
  lessons: [
    {
      id: "big-space",
      order: 1,
      title: "Thumbs on Space",
      activities: [
        {
          id: "big-thumb",
          kind: "typing-keys",
          title: "Meet the space bar",
          blurb: "The long bar at the bottom is for spaces between words.",
          estMinutes: 3,
          band: "ready",
          skillTags: ["typing.keys.space"],
          config: {
            instruction: "Press the long space bar with your thumb.",
            keys: [" "],
            reps: 3,
          },
        },
      ],
    },
    {
      id: "big-shift",
      order: 2,
      title: "Shift for Big Letters",
      activities: [
        {
          id: "big-caps-left",
          kind: "typing-keys",
          title: "Big letters, left hand",
          blurb: "Hold shift, then press the letter to make it big.",
          estMinutes: 4,
          band: "ready",
          skillTags: ["typing.keys.shift"],
          config: {
            instruction: "Hold shift with your other hand to make a big letter.",
            keys: ["A", "S", "D", "F"],
            reps: 2,
          },
        },
        {
          id: "big-caps-catch",
          kind: "typing-catch",
          title: "Star Catch: big letters",
          blurb: "Every star here needs a big letter — hold shift first.",
          estMinutes: 3,
          band: "stretch",
          skillTags: ["typing.keys.shift"],
          config: {
            instruction: "Type the big letter on each star to pop it!",
            pool: ["A", "S", "D", "F", "J", "K"],
            durationSec: 45,
            lives: 3,
            speed: "gentle",
          },
        },
      ],
    },
    {
      id: "big-echo",
      order: 3,
      title: "Star Echo: big letters",
      activities: [
        {
          id: "big-echo-caps",
          kind: "typing-echo",
          title: "Star Echo: hold the shape",
          blurb: "A big letter flashes, then hides. Hold it in your head and type it back.",
          estMinutes: 4,
          band: "stretch",
          skillTags: ["typing.words.familiar"],
          config: {
            instruction: "Watch the letters flash, then type them back from memory.",
            sequences: ["Fj", "Dk", "Sl"],
            flashMs: 1400,
          },
        },
      ],
    },
  ],
};
