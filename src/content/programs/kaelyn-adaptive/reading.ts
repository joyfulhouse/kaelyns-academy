import type { Unit } from "../../types";

// ── Strand 1: Reading & Comprehension ──────────────────────────────────
export const readingUnit: Unit = {
  id: "reading",
  order: 1,
  title: "Reading & Comprehension",
  emoji: "📖",
  world: "sunshine",
  bigIdea:
    "The words are already hers. Now read them like she means it, and understand them deeply, across fiction and nonfiction.",
  phonicsFocus: "Fluency → inference → summary",
  mathFocus: "8 levels",
  project: "Lead a 60-second book talk on a longer expedition book she finished.",
  lessons: [
    {
      id: "reading-r1",
      order: 1,
      title: "Fluency on early-chapter text",
      activities: [
        {
          id: "reading-r1-a1",
          kind: "reading-comprehension",
          title: "Read it like you mean it",
          blurb: "Pick the voice that fits the moment.",
          estMinutes: 8,
          band: "ready",
          skillTags: ["reading.fluency.phrasing"],
          config: {
            instruction: "Read this part out loud first. Then pick the voice that fits.",
            title: "Frog and Toad: The Lost Button",
            passage:
              "Toad looked everywhere. He looked under the chairs and behind the door. \"I will never find my button!\" he cried. He sat down hard and put his head in his hands.",
            questions: [
              {
                prompt: "Toad says this right after he loses the button. Which voice fits best?",
                choices: ["A sleepy, quiet voice", "An upset, frustrated voice", "A silly, giggly voice"],
                answerIndex: 1,
                kind: "inference",
              },
              {
                prompt: "Where should your voice get bigger?",
                choices: ["On \"He looked under the chairs\"", "On \"I will never find my button!\"", "On \"He sat down hard\""],
                answerIndex: 1,
                kind: "literal",
              },
            ],
          },
        },
        {
          id: "reading-r1-a2",
          kind: "reading-comprehension",
          title: "Punctuation drive",
          blurb: "Read to the marks: stop, slow, big voice.",
          estMinutes: 6,
          band: "stretch",
          skillTags: ["reading.fluency.phrasing", "reading.comprehension.retell"],
          config: {
            instruction: "Read it to the marks. Then say in one breath who it was about and what happened.",
            title: "Expedition: Volcanoes",
            passage:
              "The mountain rumbled. Smoke poured out of the top, dark and fast. Then, with a roar, it erupted! Hot lava ran down the side like a river of fire.",
            questions: [
              {
                prompt: "Which sentence gets the biggest voice?",
                choices: ["The mountain rumbled.", "Then, with a roar, it erupted!", "Smoke poured out of the top."],
                answerIndex: 1,
                kind: "literal",
              },
            ],
            retellPrompt: "In one breath: who or what was this about, and what happened?",
          },
        },
      ],
    },
    {
      id: "reading-r2",
      order: 2,
      title: "Story elements & retell",
      activities: [
        {
          id: "reading-r2-a1",
          kind: "reading-comprehension",
          title: "Who, where, problem, solution",
          blurb: "Find the four parts, then retell it.",
          estMinutes: 10,
          band: "ready",
          skillTags: ["reading.comprehension.retell"],
          config: {
            instruction: "Read the story, then answer and retell it in order.",
            title: "Magic Tree House: Lost in the Pyramid",
            passage:
              "Jack and Annie climbed into the dark tomb. The door slid shut behind them with a thud. \"We're trapped!\" said Annie. Jack remembered the book said to follow the painted birds on the wall. They followed the birds around three corners and found a small door that led them back out into the sunlight.",
            questions: [
              {
                prompt: "What is the characters' problem?",
                choices: ["They are hungry", "They are trapped in the tomb", "They lost their book"],
                answerIndex: 1,
                kind: "literal",
              },
              {
                prompt: "How do they solve it?",
                choices: ["They dig through the wall", "They follow the painted birds to a door", "They wait for help"],
                answerIndex: 1,
                kind: "literal",
              },
            ],
            retellPrompt: "Retell it in order: who, where, the problem, and how it got solved.",
          },
        },
      ],
    },
    {
      id: "reading-r3",
      order: 3,
      title: "Inference: feelings, motivation, cause & effect",
      activities: [
        {
          id: "reading-r3-a1",
          kind: "reading-comprehension",
          title: "How do you know?",
          blurb: "Name the feeling and the clue that tells you.",
          estMinutes: 10,
          band: "ready",
          skillTags: ["reading.comprehension.inference"],
          config: {
            instruction: "Read between the lines. The story does not say it outright, so find the clue.",
            title: "Expedition: Oceans & Whales",
            passage:
              "The little whale swam in circles near the boat. It slapped its tail again and again on the water. Its mother was nowhere in sight. It made a long, low call and then waited, listening.",
            questions: [
              {
                prompt: "How does the little whale most likely feel?",
                choices: ["Sleepy", "Worried and looking for its mother", "Angry at the boat"],
                answerIndex: 1,
                kind: "inference",
              },
              {
                prompt: "Which clue tells you that?",
                choices: ["It swims in the ocean", "Its mother is nowhere in sight and it calls and waits", "It is little"],
                answerIndex: 1,
                kind: "inference",
              },
            ],
          },
        },
        {
          id: "reading-r3-a2",
          kind: "reading-comprehension",
          title: "Detective conclusion",
          blurb: "Three clues. Who is it?",
          estMinutes: 8,
          band: "stretch",
          skillTags: ["reading.comprehension.inference", "reading.comprehension.main-idea"],
          config: {
            instruction: "The story never says who this is. Use the clues to figure it out.",
            title: "Expedition: Space",
            passage:
              "She checked the straps on her helmet one more time. Outside the small window, the Earth was a blue marble far below. When she let go of her pencil, it did not fall. It floated in the air in front of her face.",
            questions: [
              {
                prompt: "Who is she, most likely?",
                choices: ["A swimmer", "An astronaut in space", "A pilot on a plane"],
                answerIndex: 1,
                kind: "inference",
              },
              {
                prompt: "Which clue is the strongest?",
                choices: ["She has a pencil", "The pencil floats instead of falling", "She has a helmet"],
                answerIndex: 1,
                kind: "inference",
              },
            ],
            retellPrompt: "What was this whole part mostly about, in one idea?",
          },
        },
      ],
    },
    {
      id: "reading-r4",
      order: 4,
      title: "Nonfiction text features & evidence",
      activities: [
        {
          id: "reading-r4-a1",
          kind: "reading-comprehension",
          title: "Prove it",
          blurb: "Answer, then point to the exact words.",
          estMinutes: 10,
          band: "ready",
          skillTags: ["reading.nonfiction.text-features"],
          config: {
            instruction: "Use the headings and the words on the page to find the answer and prove it.",
            title: "How Volcanoes Work",
            passage:
              "HOW HOT IS LAVA?\nLava is melted rock that pours out of a volcano. It can reach 2,000 degrees Fahrenheit, hot enough to melt metal.\n\nWHAT IS MAGMA?\nBefore it erupts, the melted rock waits underground. There it is called magma. Magma rises when pressure builds up below.",
            questions: [
              {
                prompt: "How hot can lava get?",
                choices: ["100 degrees", "About 2,000 degrees Fahrenheit", "It does not say"],
                answerIndex: 1,
                kind: "literal",
              },
              {
                prompt: "Which heading would you read to learn what melted rock is called underground?",
                choices: ["HOW HOT IS LAVA?", "WHAT IS MAGMA?", "Neither one"],
                answerIndex: 1,
                kind: "main-idea",
              },
              {
                prompt: "Find the evidence: what is melted rock called before it erupts?",
                choices: ["Lava", "Magma", "Ash"],
                answerIndex: 1,
                kind: "literal",
              },
            ],
          },
        },
      ],
    },
    {
      id: "reading-r5",
      order: 5,
      title: "Author's purpose, comparing texts & theme",
      activities: [
        {
          id: "reading-r5-a1",
          kind: "reading-comprehension",
          title: "Why did they write it?",
          blurb: "Inform, entertain, or teach a lesson?",
          estMinutes: 10,
          band: "stretch",
          skillTags: ["reading.comprehension.author-craft"],
          config: {
            instruction: "Read both short pieces about the same topic, then think about why each author wrote it.",
            title: "Two Pieces About Volcanoes",
            passage:
              "PIECE ONE: Once there was a grumpy dragon who lived deep inside a mountain. When he sneezed, fire and smoke shot out the top, and the villagers called it a volcano.\n\nPIECE TWO: A volcano is an opening in the Earth's crust. When pressure builds underground, magma is pushed up and erupts as lava and ash.",
            questions: [
              {
                prompt: "Why did the author write Piece One?",
                choices: ["To inform you with facts", "To entertain you with a story", "To sell you a dragon"],
                answerIndex: 1,
                kind: "author",
              },
              {
                prompt: "Why did the author write Piece Two?",
                choices: ["To entertain you with a story", "To inform you about how volcanoes work", "To make you laugh"],
                answerIndex: 1,
                kind: "author",
              },
              {
                prompt: "Which piece would you use to answer a real question about how volcanoes erupt?",
                choices: ["Piece One", "Piece Two", "Either one is equally good"],
                answerIndex: 1,
                kind: "main-idea",
              },
            ],
          },
        },
      ],
    },
  ],
};
