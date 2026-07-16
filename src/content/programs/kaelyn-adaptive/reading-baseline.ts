import type { Unit } from "../../types";

// ── Baseline check-ins (Adventure 2.0 C1) ──────────────────────────────
// "Show what you know" placement units, one per academic strand. Each
// activity below probes exactly ONE skill so its first-try outcome is a
// clean per-skill signal for computePlacement (src/lib/placement). order: 0
// surfaces each ahead of its strand's regular units. checkpoint: "baseline"
// routes the attempt's evidence to checkpoint_result instead of skill_state
// (parent applies the placement afterward) — see src/lib/tutor/store.ts.
//
// Kind choice is deliberate: every item has a directly observable task whose
// runtime evidence stays inside its authored skillTags. Comprehension questions
// opt into a skill explicitly, while event ordering is the retell observation.
export const readingBaselineUnit: Unit = {
  id: "reading-baseline",
  order: 0,
  title: "Reading — Show what you know",
  emoji: "🌟",
  world: "sunshine",
  bigIdea: "Let's see what you already know about reading — there's no wrong here.",
  phonicsFocus: "A quick, friendly check-in",
  mathFocus: "",
  project: "Just read and answer — I'm watching what you've got.",
  checkpoint: "baseline",
  lessons: [
    {
      id: "reading-baseline-l1",
      order: 1,
      title: "Show what you know",
      activities: [
        {
          id: "reading-baseline-a1",
          kind: "reading-comprehension",
          title: "What happened?",
          blurb: "Read a bit, then answer.",
          estMinutes: 5,
          band: "ready",
          skillTags: ["reading.comprehension.retell"],
          config: {
            instruction: "Read this part, then answer.",
            title: "Ben's Lucky Find",
            passage:
              "Ben found a shiny rock by the creek. He put it in his pocket and ran home to show his sister.",
            questions: [
              {
                prompt: "What did Ben find by the creek?",
                choices: ["A shiny rock", "A baseball", "A puppy"],
                answerIndex: 0,
                kind: "literal",
              },
            ],
            structuredRetell: {
              prompt: "Put Ben's events in order.",
              events: [
                { id: "find", text: "Ben finds a shiny rock." },
                { id: "pocket", text: "Ben puts the rock in his pocket." },
                { id: "show", text: "Ben runs home to show his sister." },
              ],
            },
          },
        },
        {
          id: "reading-baseline-a2",
          kind: "reading-comprehension",
          title: "How do you know?",
          blurb: "The story doesn't say it outright — find the clue.",
          estMinutes: 6,
          band: "ready",
          skillTags: ["reading.comprehension.inference"],
          config: {
            instruction: "Read between the lines. The story never says it outright.",
            title: "Before the Show",
            passage:
              "Mia's hands were shaking as she held the microphone. Her cheeks turned red, and she kept looking down at her shoes instead of the crowd.",
            questions: [
              {
                prompt: "How does Mia most likely feel?",
                choices: ["Nervous", "Bored", "Angry"],
                answerIndex: 0,
                kind: "inference",
                skillTag: "reading.comprehension.inference",
                evidenceSentenceIndexes: [0, 1],
              },
            ],
          },
        },
        {
          id: "reading-baseline-a3",
          kind: "reading-comprehension",
          title: "Find the right heading",
          blurb: "Use the headings to find your way.",
          estMinutes: 6,
          band: "ready",
          skillTags: ["reading.nonfiction.text-features"],
          config: {
            instruction: "Use the headings to find where the answer lives.",
            title: "All About Pandas",
            passage:
              "WHAT DO PANDAS EAT?\nPandas mostly eat bamboo. They can eat for up to 12 hours a day!\n\nWHERE DO PANDAS LIVE?\nPandas live in cool, misty forests high up in the mountains of China.",
            questions: [
              {
                prompt: "Which heading would you read to find out where pandas live?",
                choices: ["WHAT DO PANDAS EAT?", "WHERE DO PANDAS LIVE?", "Neither one"],
                answerIndex: 1,
                kind: "text-feature",
                skillTag: "reading.nonfiction.text-features",
                evidenceSentenceIndexes: [3],
              },
            ],
          },
        },
        {
          id: "reading-baseline-a4",
          kind: "reading-comprehension",
          title: "What does that word mean?",
          blurb: "Use the sentence to figure it out.",
          estMinutes: 6,
          band: "ready",
          skillTags: ["reading.vocabulary.context"],
          config: {
            instruction: "You may not know the bold idea's word. Use the rest of the sentence to figure it out.",
            title: "The Long Climb",
            passage:
              "The hikers were exhausted after climbing the steep trail all day. They could barely lift their feet and just wanted to rest.",
            questions: [
              {
                prompt: "What does \"exhausted\" most likely mean?",
                choices: ["Very tired", "Very happy", "Very hungry"],
                answerIndex: 0,
                kind: "vocabulary",
                skillTag: "reading.vocabulary.context",
                evidenceSentenceIndexes: [1],
              },
            ],
          },
        },
        {
          id: "reading-baseline-a5",
          kind: "reading-comprehension",
          title: "Why did they write it?",
          blurb: "A story or the facts — which is it?",
          estMinutes: 7,
          band: "ready",
          skillTags: ["reading.comprehension.author-craft"],
          config: {
            instruction: "Read both short pieces about the same topic, then think about why each was written.",
            title: "Two Pieces About the Moon",
            passage:
              "PIECE ONE: Once there was a curious fox who wondered why the moon changed shape every night. She asked the wise old owl for the answer.\n\nPIECE TWO: The moon does not make its own light — it reflects light from the sun. As the moon orbits Earth, we see different amounts of its lit side, which is why it looks like it changes shape.",
            questions: [
              {
                prompt: "Why did the author write Piece Two?",
                choices: [
                  "To entertain you with a story about animals",
                  "To inform you with facts about the moon",
                  "To make you laugh",
                ],
                answerIndex: 1,
                kind: "author",
                skillTag: "reading.comprehension.author-craft",
              },
            ],
          },
        },
      ],
    },
  ],
};
