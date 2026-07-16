import type { Unit } from "../../types";

// ── Strand 2: Word Study & Vocabulary ──────────────────────────────────
export const wordStudyUnit: Unit = {
  id: "word-study",
  order: 2,
  title: "Word Study & Vocabulary",
  emoji: "🌊",
  world: "ocean",
  bigIdea:
    "Unlock big, unfamiliar words on her own, by hearing their syllables, seeing their parts, and reasoning out their meaning. The real engine of a large vocabulary.",
  phonicsFocus: "Syllables → morphology → depth",
  mathFocus: "15 levels",
  project: "Collect a deck of Greek and Latin root cards and unlock new words with them.",
  lessons: [
    {
      id: "word-sight-review",
      order: 0,
      title: "Sight-word listening warm-up",
      activities: [
        {
          id: "word-sight-find",
          kind: "sightword-game",
          title: "Listen and find the word",
          blurb: "Hear one familiar word, then find its steady word card.",
          estMinutes: 4,
          band: "ready",
          // This is a warm-up participation activity. The current adaptive
          // rubric has no isolated sight-word-recognition rung, so it does not
          // fabricate fluency or morphology evidence.
          skillTags: [],
          config: {
            instruction: "Listen to one word. Find the matching word card. The cards will stay still.",
            rounds: [
              {
                target: "the",
                choices: ["then", "the", "they"],
                spokenPrompt: "Find the word the.",
              },
              {
                target: "and",
                choices: ["an", "and", "any"],
                spokenPrompt: "Find the word and.",
              },
              {
                target: "said",
                choices: ["sad", "sail", "said"],
                spokenPrompt: "Find the word said.",
              },
            ],
          },
        },
        {
          id: "word-oral-the",
          kind: "oral-reading",
          title: "Read the word: the",
          blurb: "Listen first, then read a word you know.",
          estMinutes: 2,
          band: "ready",
          // Listen-and-repeat is modeled practice, not a cold fluency observation.
          skillTags: [],
          config: {
            presentation: "listen-repeat",
            instruction: "Listen, then read this word aloud.",
            target: "the",
          },
        },
        {
          id: "word-oral-and",
          kind: "oral-reading",
          title: "Read the word: and",
          blurb: "Listen first, then read a word you know.",
          estMinutes: 2,
          band: "ready",
          skillTags: [],
          config: {
            presentation: "listen-repeat",
            instruction: "Listen, then read this word aloud.",
            target: "and",
          },
        },
        {
          id: "word-oral-to",
          kind: "oral-reading",
          title: "Read the word: to",
          blurb: "Listen first, then read a word you know.",
          estMinutes: 2,
          band: "ready",
          skillTags: [],
          config: {
            presentation: "listen-repeat",
            instruction: "Listen, then read this word aloud.",
            target: "to",
          },
        },
        {
          id: "word-oral-see",
          kind: "oral-reading",
          title: "Read the word: see",
          blurb: "Listen first, then read a word you know.",
          estMinutes: 2,
          band: "ready",
          skillTags: [],
          config: {
            presentation: "listen-repeat",
            instruction: "Listen, then read this word aloud.",
            target: "see",
          },
        },
        {
          id: "word-oral-we-can",
          kind: "oral-reading",
          title: "Read the words: we can",
          blurb: "Put two known words together smoothly.",
          estMinutes: 2,
          band: "ready",
          skillTags: [],
          config: {
            presentation: "listen-repeat",
            instruction: "Listen, then read these words aloud.",
            target: "we can",
          },
        },
        {
          id: "word-sentence-see-cat",
          kind: "oral-reading",
          title: "Read the sentence: see the cat",
          blurb: "Read known words together at a smooth talking pace.",
          estMinutes: 3,
          band: "ready",
          skillTags: [],
          config: {
            mode: "sentence",
            presentation: "listen-repeat",
            instruction: "Listen, then read this sentence aloud.",
            passage: "We can see the cat.",
          },
        },
        {
          id: "word-sentence-run-play",
          kind: "oral-reading",
          title: "Read the sentence: run and play",
          blurb: "Let each word flow into the next.",
          estMinutes: 3,
          band: "ready",
          skillTags: [],
          config: {
            mode: "sentence",
            presentation: "listen-repeat",
            instruction: "Listen, then read this sentence aloud.",
            passage: "I like to run and play.",
          },
        },
      ],
    },
    {
      id: "word-r4",
      order: 1,
      title: "Blend prepared syllable chunks",
      activities: [
        {
          id: "word-r4-a1",
          kind: "phonics-wordbuild",
          title: "Build by syllable",
          blurb: "Join the syllable parts, then blend the whole word.",
          estMinutes: 10,
          band: "ready",
          skillTags: [],
          config: {
            focus: "prepared syllable chunks in longer words",
            instruction: "Build each word from its syllable tiles. Listen to each part, then blend the whole word.",
            // Two stable `co` instances make the repeated syllable in cocoa a
            // real inventory constraint instead of an infinitely reusable label.
            tiles: ["rab", "bit", "co", "co", "a"],
            say: { co: "kˈoʊ", a: "ə" },
            words: [
              { word: "rabbit" },
              { word: "cocoa" },
            ],
          },
        },
      ],
    },
    {
      id: "word-r5",
      order: 2,
      title: "Build and understand long words",
      activities: [
        {
          id: "word-r5-a1",
          kind: "phonics-wordbuild",
          title: "Build it by syllable",
          blurb: "Order prepared syllable chunks, then read the whole word.",
          estMinutes: 10,
          band: "ready",
          skillTags: [],
          config: {
            focus: "prepared syllable chunks in multisyllable words",
            instruction: "These expedition words are split into syllables. Put them in order, read each part, then blend.",
            tiles: ["ad", "ven", "ture", "vol", "can", "ic", "con", "ti", "nent"],
            // Isolated misreads: ture→"tyoor" (want "cher"), ic→"ike" (want
            // short-i), ti→"tee" (reduced to schwa in continent). Rest read fine.
            say: { ture: "ʧəɹ", ic: "ɪk", ti: "tə" },
            words: [
              { word: "adventure" },
              { word: "volcanic" },
              { word: "continent" },
            ],
          },
        },
        {
          id: "word-r5-a2",
          kind: "reading-comprehension",
          title: "Use the context clues",
          blurb: "Use the sentence to figure out a new word's meaning.",
          estMinutes: 8,
          band: "stretch",
          skillTags: ["vocab.context-clues"],
          config: {
            instruction: "Read the sentence, then use its clues to figure out what the new word means.",
            passage:
              "The diggers found a chamber so enormous that the whole team could stand inside it. The room went back farther than their lights could reach.",
            questions: [
              {
                prompt: "What does \"enormous\" most likely mean?",
                choices: ["Very small", "Very large", "Very dark"],
                answerIndex: 1,
                kind: "vocabulary",
                skillTag: "vocab.context-clues",
                evidenceSentenceIndexes: [0, 1],
              },
              {
                prompt: "Which clue told you?",
                choices: ["\"found a chamber\"", "\"the whole team could stand inside it\"", "\"their lights\""],
                answerIndex: 1,
                kind: "vocabulary",
                skillTag: "vocab.context-clues",
                evidenceSentenceIndexes: [0],
              },
            ],
          },
        },
      ],
    },
    {
      id: "word-r10",
      order: 3,
      title: "Prefixes (un-, re-, pre-, dis-, mis-, non-)",
      activities: [
        {
          id: "word-r10-a1",
          kind: "phonics-wordbuild",
          title: "Build the prefixed word",
          blurb: "Join a prefix and base-word tile, then blend the whole word.",
          estMinutes: 10,
          band: "ready",
          skillTags: [],
          config: {
            focus: "prefixes that change meaning (un-, re-, pre-, dis-, mis-, non-)",
            instruction: "Join each prefix and base-word tile, then blend the whole word.",
            tiles: ["un", "re", "pre", "dis", "happy", "play", "heat", "appear"],
            // "re" alone reads "ray"; in "replay" it's "ree". Others read fine.
            say: { re: "ɹˈi" },
            words: [
              { word: "unhappy" },
              { word: "replay" },
              { word: "preheat" },
              { word: "disappear" },
            ],
          },
        },
        {
          id: "word-r10-a2",
          kind: "reading-comprehension",
          title: "Find the prefix that means \"again\"",
          blurb: "Use a sentence to show what re- does to a word.",
          estMinutes: 5,
          band: "ready",
          skillTags: ["word.morphology.prefixes"],
          config: {
            instruction: "Read the sentence. Choose what re- means and point to the sentence that proves it.",
            passage: "The prefix re- means again. Maya will redo the puzzle, so she will do it one more time.",
            questions: [
              {
                prompt: "What does re- mean in redo?",
                choices: ["Again", "Not", "Before"],
                answerIndex: 0,
                kind: "vocabulary",
                skillTag: "word.morphology.prefixes",
                evidenceSentenceIndexes: [0, 1],
              },
            ],
          },
        },
      ],
    },
    {
      id: "word-r11",
      order: 4,
      title: "Greek & Latin roots",
      activities: [
        {
          id: "word-r11-a1",
          kind: "phonics-wordbuild",
          title: "Build from word parts",
          blurb: "Combine the prepared parts, then blend the whole word.",
          estMinutes: 12,
          band: "ready",
          skillTags: [],
          config: {
            focus: "Greek and Latin roots (tele = far, graph = write, geo = earth, port = carry, struct = build, meter = measure)",
            instruction: "Combine the prepared word-part tiles, then blend the whole word.",
            // "y" completes the -y suffix in geography (geo+graph+y); without it
            // geography was unbuildable. Roots voice fine in isolation (citation
            // form); only the lone "y" misreads as "why" — pin it to /i/.
            tiles: ["tele", "graph", "geo", "trans", "port", "thermo", "meter", "y"],
            say: { y: "i" },
            words: [
              { word: "telegraph" },
              { word: "geography" },
              { word: "transport" },
              { word: "thermometer" },
            ],
          },
        },
        {
          id: "word-r11-a2",
          kind: "reading-comprehension",
          title: "Infer the unknown word",
          blurb: "Break a brand-new word into roots, then check the sentence.",
          estMinutes: 8,
          band: "stretch",
          skillTags: ["word.morphology.roots"],
          config: {
            instruction: "You may never have seen the bold word. Break it into roots you know, build the meaning, then check it against the sentence.",
            passage:
              "The scientist wrote a biography of the famous explorer, telling the story of his whole life from the day he was born.",
            questions: [
              {
                prompt: "Using bio (life) and graph (write), what is a \"biography\"?",
                choices: ["A drawing of a place", "The written story of someone's life", "A tool that measures heat"],
                answerIndex: 1,
                kind: "vocabulary",
                skillTag: "word.morphology.roots",
                evidenceSentenceIndexes: [0],
              },
            ],
          },
        },
      ],
    },
    {
      id: "word-r12",
      order: 5,
      title: "Synonyms, antonyms & shades of meaning",
      activities: [
        {
          id: "word-r12-a1",
          kind: "reading-comprehension",
          title: "Find the closest meaning",
          blurb: "Use the sentence to compare shades of meaning.",
          estMinutes: 6,
          band: "ready",
          skillTags: ["vocab.shades-of-meaning"],
          config: {
            instruction: "Read the sentence. Choose the word closest to enormous and point to the clue.",
            passage: "The enormous whale looked gigantic beside the tiny fish.",
            questions: [
              {
                prompt: "Which word means almost the same as enormous?",
                choices: ["Tiny", "Gigantic", "Quiet"],
                answerIndex: 1,
                kind: "vocabulary",
                skillTag: "vocab.shades-of-meaning",
                evidenceSentenceIndexes: [0],
              },
            ],
          },
        },
        {
          id: "word-r12-a2",
          kind: "reading-comprehension",
          title: "Pick the strongest word",
          blurb: "Choose the word with the strongest meaning.",
          estMinutes: 6,
          band: "stretch",
          skillTags: ["vocab.shades-of-meaning"],
          config: {
            instruction: "Read the sentence, then choose the word that shows the strongest degree.",
            passage:
              "The volcano was hot. As they got closer, the air was warm, then hot, then absolutely scorching.",
            questions: [
              {
                prompt: "Which word means the strongest amount of heat?",
                choices: ["Warm", "Hot", "Scorching"],
                answerIndex: 2,
                kind: "vocabulary",
                skillTag: "vocab.shades-of-meaning",
                evidenceSentenceIndexes: [1],
              },
            ],
          },
        },
      ],
    },
  ],
};
