import type { Unit } from "../../types";

// ── Unit 1 · Home Base ────────────────────────────────────────────────
// The home row and the F/J bumps. Every key-drill here is home-row only, so
// `skillsAffected` resolves to exactly ["typing.keys.home-row"] and the
// authored tags match it (skill-routing demands set equality, not subset).
// The closing word lesson steps outside that row rule on purpose: multi-char
// targets route to ["typing.words.familiar"] (plus "typing.fluency.rate" for
// the race), a first taste of Word Workshop's whole-word skills.
export const homeBaseUnit: Unit = {
  id: "home-base",
  order: 1,
  title: "Home Base",
  emoji: "🏠",
  world: "sunshine",
  bigIdea: "Your fingers have a home. Two little bumps tell them where it is.",
  phonicsFocus: "",
  mathFocus: "",
  project: "Rest all eight fingers on the home row and find the bumps with your eyes closed.",
  lessons: [
    {
      id: "home-meet",
      order: 1,
      title: "Meet the Home Row",
      activities: [
        {
          id: "home-fj",
          kind: "typing-keys",
          title: "Find the bumps",
          blurb: "F and J have little bumps. Your pointer fingers live there.",
          estMinutes: 3,
          band: "ready",
          skillTags: ["typing.keys.home-row"],
          config: {
            instruction: "Press the key that is glowing. Feel for the little bump!",
            keys: ["f", "j"],
            reps: 3,
          },
        },
        {
          id: "home-left",
          kind: "typing-keys",
          title: "Left hand home",
          blurb: "A, S, D, F — one key for each left finger.",
          estMinutes: 4,
          band: "ready",
          skillTags: ["typing.keys.home-row"],
          config: {
            instruction: "Press the glowing key with your left hand.",
            keys: ["a", "s", "d", "f"],
            reps: 2,
          },
        },
        {
          id: "home-right",
          kind: "typing-keys",
          title: "Right hand home",
          blurb: "J, K, L and the semicolon — one key for each right finger.",
          estMinutes: 4,
          band: "ready",
          skillTags: ["typing.keys.home-row"],
          config: {
            instruction: "Press the glowing key with your right hand.",
            keys: ["j", "k", "l", ";"],
            reps: 2,
          },
        },
      ],
    },
    {
      id: "home-catch",
      order: 2,
      title: "Home Row Catch",
      activities: [
        {
          id: "home-catch-gentle",
          kind: "typing-catch",
          title: "Star Catch: home row",
          blurb: "Pop each star before it lands.",
          estMinutes: 3,
          band: "ready",
          skillTags: ["typing.keys.home-row"],
          config: {
            instruction: "Type the letter on each star to pop it!",
            pool: ["a", "s", "d", "f", "j", "k", "l"],
            durationSec: 45,
            lives: 3,
            speed: "gentle",
          },
        },
        {
          id: "home-catch-steady",
          kind: "typing-catch",
          title: "Star Catch: a little faster",
          blurb: "Same stars, falling a bit quicker.",
          estMinutes: 3,
          band: "stretch",
          skillTags: ["typing.keys.home-row"],
          config: {
            instruction: "Type the letter on each star to pop it!",
            pool: ["a", "s", "d", "f", "j", "k", "l"],
            durationSec: 45,
            lives: 3,
            speed: "steady",
          },
        },
      ],
    },
    {
      id: "home-words",
      order: 3,
      title: "Home Row Words",
      activities: [
        {
          id: "home-write",
          kind: "typing-write",
          title: "Type home row words",
          blurb: "Sad, dad, ask — whole words using only your home row keys.",
          estMinutes: 4,
          band: "ready",
          skillTags: ["typing.words.familiar"],
          config: {
            instruction: "Type each word, one letter at a time. Stay on your home row!",
            mode: "see",
            scope: "word",
            items: ["sad", "dad", "ask", "fall", "salad"],
          },
        },
        {
          id: "home-race",
          kind: "typing-race",
          title: "Rocket Race: home row words",
          blurb: "Type each word before the friendly comet catches up.",
          estMinutes: 4,
          band: "ready",
          skillTags: ["typing.fluency.rate", "typing.words.familiar"],
          config: {
            instruction: "Type each word, one letter at a time. The rocket hops when you finish a word!",
            words: ["ask", "sad", "dad", "fall", "flask", "salad"],
            pacerWpm: 8,
          },
        },
      ],
    },
  ],
};
