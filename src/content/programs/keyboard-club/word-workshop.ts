import type { Unit } from "../../types";

// ── Unit 5 · Word Workshop ────────────────────────────────────────────
// Every row is reachable now, so the drills stop asking for single keys and
// start asking for whole words: `skillsForTargets` resolves any multi-char
// target to exactly ["typing.words.familiar"], and Rocket Race adds
// "typing.fluency.rate" alongside it — the same routing rule as Home Base's
// word lesson, just with a full unit of practice behind it.
export const wordWorkshopUnit: Unit = {
  id: "word-workshop",
  order: 5,
  title: "Word Workshop",
  emoji: "🛠️",
  world: "ocean",
  bigIdea: "Letters live on the keyboard. Words live in your fingers.",
  phonicsFocus: "",
  mathFocus: "",
  project: "Type your favorite animal's name without looking at the keys.",
  lessons: [
    {
      id: "ww-build",
      order: 1,
      title: "Word Builders",
      activities: [
        {
          id: "ww-cvc-a",
          kind: "typing-write",
          title: "Short-a words",
          blurb: "Cat, map, sat — short-a words your fingers already know.",
          estMinutes: 4,
          band: "ready",
          skillTags: ["typing.words.familiar"],
          config: {
            instruction: "Type each word, one letter at a time. Watch it appear!",
            mode: "see",
            scope: "word",
            items: ["cat", "map", "sat", "pan", "bag"],
          },
        },
        {
          id: "ww-cvc-mix",
          kind: "typing-write",
          title: "Mixed vowel words",
          blurb: "Hen, pig, dog, sun — every vowel gets a turn.",
          estMinutes: 4,
          band: "ready",
          skillTags: ["typing.words.familiar"],
          config: {
            instruction: "Type each word, one letter at a time. Watch it appear!",
            mode: "see",
            scope: "word",
            items: ["hen", "pig", "dog", "sun", "bug", "six"],
          },
        },
      ],
    },
    {
      id: "ww-listen",
      order: 2,
      title: "Listen and Type",
      activities: [
        {
          id: "ww-hear-sight",
          kind: "typing-write",
          title: "Listen and type",
          blurb: "Hear the word, then type it from memory.",
          estMinutes: 5,
          band: "ready",
          skillTags: ["typing.words.familiar"],
          config: {
            instruction: "Listen to the word, then type it one letter at a time.",
            mode: "hear",
            scope: "word",
            items: ["the", "and", "see", "can", "you", "we"],
          },
        },
      ],
    },
    {
      id: "ww-race",
      order: 3,
      title: "Rocket Races",
      activities: [
        {
          id: "ww-race-gentle",
          kind: "typing-race",
          title: "Rocket Race: gentle pace",
          blurb: "Type each word before the friendly comet catches up.",
          estMinutes: 4,
          band: "ready",
          skillTags: ["typing.fluency.rate", "typing.words.familiar"],
          config: {
            instruction: "Type each word, one letter at a time. The rocket hops when you finish a word!",
            words: ["cat", "hen", "pig", "sun", "map", "bug"],
            pacerWpm: 8,
          },
        },
        {
          id: "ww-race-steady",
          kind: "typing-race",
          title: "Rocket Race: steady pace",
          blurb: "Longer words, a quicker comet — keep those fingers moving.",
          estMinutes: 5,
          band: "stretch",
          skillTags: ["typing.fluency.rate", "typing.words.familiar"],
          config: {
            instruction: "Type each word, one letter at a time. The rocket hops when you finish a word!",
            words: ["fish", "ship", "chat", "jump", "help", "play", "swim", "sand"],
            pacerWpm: 12,
          },
        },
      ],
    },
    {
      id: "ww-sentences",
      order: 4,
      title: "Little Sentences",
      activities: [
        {
          id: "ww-sentences",
          kind: "typing-write",
          title: "Little sentences",
          blurb: "A big letter to start, a period to finish — a whole sentence!",
          estMinutes: 6,
          band: "stretch",
          skillTags: ["typing.words.familiar"],
          config: {
            instruction: "Type the whole sentence. Start with a big letter and end with a period.",
            mode: "see",
            scope: "sentence",
            items: ["The fat cat sat.", "A pig can dig.", "Ben can get the pen."],
          },
        },
      ],
    },
    {
      id: "ww-echo",
      order: 5,
      title: "Star Echo: words",
      activities: [
        {
          id: "ww-echo-short",
          kind: "typing-echo",
          title: "Star Echo: short words",
          blurb: "A little word flashes, then hides. Hold it in your head and type it back.",
          estMinutes: 4,
          band: "ready",
          skillTags: ["typing.words.familiar"],
          config: {
            instruction: "Watch the word flash, then type it back from memory.",
            sequences: ["at", "in", "up", "on"],
            flashMs: 1200,
          },
        },
        {
          id: "ww-echo-long",
          kind: "typing-echo",
          title: "Star Echo: longer words",
          blurb: "A longer word flashes fast — hold every letter in your head.",
          estMinutes: 5,
          band: "stretch",
          skillTags: ["typing.words.familiar"],
          config: {
            instruction: "Watch the word flash, then type it back from memory.",
            sequences: ["cat", "sun", "fish", "jump"],
            flashMs: 1000,
          },
        },
      ],
    },
  ],
};
