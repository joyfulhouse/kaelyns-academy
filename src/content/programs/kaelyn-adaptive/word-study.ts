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
      title: "Sight-word fluency warm-up",
      activities: [
        {
          id: "word-oral-the",
          kind: "oral-reading",
          title: "Read the word: the",
          blurb: "Listen first, then read a word you know.",
          estMinutes: 2,
          band: "ready",
          skillTags: ["reading.fluency.phrasing"],
          config: {
            instruction: "Listen, then read this word aloud.",
            target: "the",
            skillTag: "reading.fluency.phrasing",
          },
        },
        {
          id: "word-oral-and",
          kind: "oral-reading",
          title: "Read the word: and",
          blurb: "Listen first, then read a word you know.",
          estMinutes: 2,
          band: "ready",
          skillTags: ["reading.fluency.phrasing"],
          config: {
            instruction: "Listen, then read this word aloud.",
            target: "and",
            skillTag: "reading.fluency.phrasing",
          },
        },
        {
          id: "word-oral-to",
          kind: "oral-reading",
          title: "Read the word: to",
          blurb: "Listen first, then read a word you know.",
          estMinutes: 2,
          band: "ready",
          skillTags: ["reading.fluency.phrasing"],
          config: {
            instruction: "Listen, then read this word aloud.",
            target: "to",
            skillTag: "reading.fluency.phrasing",
          },
        },
        {
          id: "word-oral-see",
          kind: "oral-reading",
          title: "Read the word: see",
          blurb: "Listen first, then read a word you know.",
          estMinutes: 2,
          band: "ready",
          skillTags: ["reading.fluency.phrasing"],
          config: {
            instruction: "Listen, then read this word aloud.",
            target: "see",
            skillTag: "reading.fluency.phrasing",
          },
        },
        {
          id: "word-oral-we-can",
          kind: "oral-reading",
          title: "Read the words: we can",
          blurb: "Put two known words together smoothly.",
          estMinutes: 2,
          band: "ready",
          skillTags: ["reading.fluency.phrasing"],
          config: {
            instruction: "Listen, then read these words aloud.",
            target: "we can",
            skillTag: "reading.fluency.phrasing",
          },
        },
        {
          id: "word-sentence-see-cat",
          kind: "oral-reading",
          title: "Read the sentence: see the cat",
          blurb: "Read known words together at a smooth talking pace.",
          estMinutes: 3,
          band: "ready",
          skillTags: ["reading.fluency.phrasing"],
          config: {
            mode: "sentence",
            instruction: "Listen, then read this sentence aloud.",
            passage: "We can see the cat.",
            skillTag: "reading.fluency.phrasing",
          },
        },
        {
          id: "word-sentence-run-play",
          kind: "oral-reading",
          title: "Read the sentence: run and play",
          blurb: "Let each word flow into the next.",
          estMinutes: 3,
          band: "ready",
          skillTags: ["reading.fluency.phrasing"],
          config: {
            mode: "sentence",
            instruction: "Listen, then read this sentence aloud.",
            passage: "I like to run and play.",
            skillTag: "reading.fluency.phrasing",
          },
        },
      ],
    },
    {
      id: "word-r4",
      order: 1,
      title: "The six syllable types",
      activities: [
        {
          id: "word-r4-a1",
          kind: "phonics-wordbuild",
          title: "Build by syllable type",
          blurb: "Build the word, then say if the vowel is short or long.",
          estMinutes: 10,
          band: "ready",
          skillTags: ["word.syllables.types"],
          config: {
            focus: "the six syllable types (closed, open, silent-e, vowel team, r-controlled, consonant-le)",
            instruction: "Build each word from its syllable tiles, then say whether the vowel is short or long and why.",
            tiles: ["rab", "bit", "ta", "ble", "ti", "ger", "gar", "den"],
            // Open/r-controlled/consonant-le tiles mis-voice in isolation
            // (ta→"tah", ble→"blee", ti→"tee", ger→soft-g "jer"); pin the
            // in-word sound. rab/bit/gar/den already voice correctly.
            say: { ta: "tˈA", ble: "bəl", ti: "tˈI", ger: "ɡˈɜɹ" },
            words: [
              { word: "rabbit" },
              { word: "table" },
              { word: "tiger" },
              { word: "garden" },
            ],
          },
        },
      ],
    },
    {
      id: "word-r5",
      order: 2,
      title: "Dividing & decoding long words",
      activities: [
        {
          id: "word-r5-a1",
          kind: "phonics-wordbuild",
          title: "Chop it and read it",
          blurb: "Order the scrambled syllables, then read the whole word.",
          estMinutes: 10,
          band: "ready",
          skillTags: ["word.syllables.division"],
          config: {
            focus: "dividing multisyllable words (VC/CV, V/CV, C+le)",
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
          title: "Cold-read challenge",
          blurb: "Chop a never-seen word, then use the sentence for its meaning.",
          estMinutes: 8,
          band: "stretch",
          skillTags: ["word.syllables.division", "vocab.context-clues"],
          config: {
            instruction: "Read the sentence. Chop the bold word into syllables, read it, then use the sentence to figure out what it means.",
            passage:
              "The diggers found a chamber so enormous that the whole team could stand inside it. The room went back farther than their lights could reach.",
            questions: [
              {
                prompt: "What does \"enormous\" most likely mean?",
                choices: ["Very small", "Very large", "Very dark"],
                answerIndex: 1,
                kind: "vocabulary",
              },
              {
                prompt: "Which clue told you?",
                choices: ["\"found a chamber\"", "\"the whole team could stand inside it\"", "\"their lights\""],
                answerIndex: 1,
                kind: "vocabulary",
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
          title: "Snap on a prefix",
          blurb: "Add the prefix, read it, say the new meaning.",
          estMinutes: 10,
          band: "ready",
          skillTags: ["word.morphology.prefixes"],
          config: {
            focus: "prefixes that change meaning (un-, re-, pre-, dis-, mis-, non-)",
            instruction: "Snap a prefix onto each base word. Read what you made, then say what the prefix did to the meaning.",
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
          kind: "sightword-game",
          title: "Tap the prefix that means \"again\"",
          blurb: "Find the word part that means again.",
          estMinutes: 5,
          band: "ready",
          skillTags: ["word.morphology.prefixes"],
          config: {
            instruction: "Tap every word part that means \"again.\" Watch out for the ones that mean something else.",
            words: ["re-", "redo", "rebuild"],
            decoys: ["un-", "pre-", "dis-", "mis-"],
            skillTag: "word.morphology.prefixes",
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
          title: "Build from roots",
          blurb: "Combine roots, read the word, infer the meaning.",
          estMinutes: 12,
          band: "ready",
          skillTags: ["word.morphology.roots"],
          config: {
            focus: "Greek and Latin roots (tele = far, graph = write, geo = earth, port = carry, struct = build, meter = measure)",
            instruction: "Each tile is a root that carries meaning. Build the word, read it, then reason out what it means from its parts.",
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
          skillTags: ["word.morphology.roots", "vocab.context-clues"],
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
          kind: "sightword-game",
          title: "Tap the synonym",
          blurb: "Which words mean almost the same as enormous?",
          estMinutes: 6,
          band: "ready",
          skillTags: ["vocab.shades-of-meaning"],
          config: {
            instruction: "Tap every word that means almost the same as \"enormous.\" Leave the opposites alone.",
            words: ["gigantic", "huge", "massive"],
            decoys: ["tiny", "small", "little"],
            skillTag: "vocab.shades-of-meaning",
          },
        },
        {
          id: "word-r12-a2",
          kind: "reading-comprehension",
          title: "Pick the strongest word",
          blurb: "Order three words from weak to strong.",
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
              },
            ],
          },
        },
      ],
    },
  ],
};
