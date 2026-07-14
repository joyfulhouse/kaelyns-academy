import type { Program } from "../types";
import { DECODABLE_LIBRARY, decodableReaderActivities } from "../decodable";

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
    // ── Strand 1: Reading & Comprehension ──────────────────────────────────
    {
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
    },

    // ── Strand 2: Word Study & Vocabulary ──────────────────────────────────
    {
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
    },

    // ── Strand 3: Writing & Composition (the bridge) ───────────────────────
    {
      id: "writing",
      order: 3,
      title: "Writing & Composition",
      emoji: "🚀",
      world: "space",
      bigIdea:
        "Her ideas are years ahead of her hand. So composition runs at her thinking level today, scribed or typed, while handwriting climbs its own gentle ladder. She is an author from rung one.",
      phonicsFocus: "Sentence → paragraph → revise",
      mathFocus: "Bridged: ideas first",
      project: "Compose, revise, and \"publish\" a real piece, then read it aloud as the author.",
      lessons: [
        {
          id: "writing-r2",
          order: 1,
          title: "One complete sentence",
          activities: [
            {
              id: "writing-r2-a1",
              kind: "journal-prompt",
              title: "Finish the frame",
              blurb: "You bring the idea. The frame holds the words.",
              estMinutes: 8,
              band: "ready",
              skillTags: ["writing.compose.sentence"],
              config: {
                prompt: "Tell one true thing about today's expedition. Say it as a whole sentence.",
                drawing: false,
                mode: "compose",
                frames: ["The volcano erupted because ______.", "I learned that ______."],
                wordBank: ["pressure", "magma", "erupted", "lava", "underground"],
                allowModes: ["scribe", "type", "dictate"],
              },
            },
          ],
        },
        {
          id: "writing-r3",
          order: 2,
          title: "Expand a sentence",
          activities: [
            {
              id: "writing-r3-a1",
              kind: "journal-prompt",
              title: "Grow the sentence",
              blurb: "Add a who, a where, a why. Trade a stronger verb.",
              estMinutes: 10,
              band: "ready",
              skillTags: ["writing.compose.sentence-expand"],
              config: {
                prompt: "Start with \"The boat went on the water.\" Make it richer: add a detail, an adjective, or a stronger verb.",
                drawing: false,
                mode: "compose",
                frames: ["The ______ boat ______ across the ______ water."],
                wordBank: ["little", "raced", "drifted", "crashed", "stormy", "calm", "quickly"],
                allowModes: ["scribe", "type", "dictate"],
              },
            },
          ],
        },
        {
          id: "writing-r5",
          order: 3,
          title: "Three-sentence pieces (narrative, info, opinion)",
          activities: [
            {
              id: "writing-r5-a1",
              kind: "journal-prompt",
              title: "Tiny story",
              blurb: "Beginning, middle, end, in three sentences.",
              estMinutes: 12,
              band: "ready",
              skillTags: ["writing.compose.narrative"],
              config: {
                prompt: "Tell a tiny story about a volcano with a beginning, a middle, and an end.",
                drawing: false,
                mode: "compose",
                frames: ["First, ______.", "Then, ______.", "Finally, ______."],
                wordBank: ["the ground shook", "smoke poured out", "it erupted", "everyone ran to safety"],
                allowModes: ["scribe", "type", "dictate"],
              },
            },
            {
              id: "writing-r5-a2",
              kind: "journal-prompt",
              title: "I think... because",
              blurb: "Give an opinion and back it with reasons.",
              estMinutes: 10,
              band: "ready",
              skillTags: ["writing.compose.opinion"],
              config: {
                prompt: "What is the best ocean animal? Tell me what you think and why.",
                drawing: false,
                mode: "compose",
                frames: ["I think ______ is the best ocean animal because ______."],
                wordBank: ["whales", "huge", "gentle", "they sing", "they are smart"],
                allowModes: ["scribe", "type", "dictate"],
              },
            },
          ],
        },
        {
          id: "writing-r6",
          order: 4,
          title: "A short paragraph",
          activities: [
            {
              id: "writing-r6-a1",
              kind: "journal-prompt",
              title: "Topic + three details",
              blurb: "Open with a topic sentence, then stay on one idea.",
              estMinutes: 14,
              band: "ready",
              skillTags: ["writing.compose.paragraph"],
              config: {
                prompt: "Write a short paragraph about whales. Start with a topic sentence, then add three facts you know, all about whales.",
                drawing: false,
                mode: "compose",
                frames: ["Whales are amazing ocean animals.", "First, ______.", "Also, ______.", "Best of all, ______."],
                wordBank: ["biggest animals", "they breathe air", "they sing songs", "they live in pods"],
                allowModes: ["type", "dictate"],
              },
            },
          ],
        },
        {
          id: "writing-r7",
          order: 5,
          title: "Revise & edit",
          activities: [
            {
              id: "writing-r7-a1",
              kind: "journal-prompt",
              title: "Make it stronger",
              blurb: "Swap a weak word. Add a detail. Say why it's better.",
              estMinutes: 12,
              band: "stretch",
              skillTags: ["writing.compose.revise"],
              config: {
                prompt: "Here is a draft sentence: \"The volcano was big and it went.\" Make it stronger. Swap a bland word for a livelier one and add one detail. Then say why your change is better.",
                drawing: false,
                mode: "compose",
                frames: ["The ______ volcano ______."],
                wordBank: ["enormous", "erupted", "exploded", "towering", "suddenly"],
                allowModes: ["type", "scribe"],
              },
            },
          ],
        },
      ],
    },

    // ── Strand 4: Math ─────────────────────────────────────────────────────
    {
      id: "math",
      order: 4,
      title: "Math",
      emoji: "🎪",
      world: "bigtop",
      bigIdea:
        "She already multiplies and reads place value into the hundreds. So we teach forward: multiplication and division, regrouping, fractions, and reasoning. Growing a mathematician, not a calculator.",
      phonicsFocus: "Multiplication → fractions",
      mathFocus: "11 levels",
      project: "Author a two-step word problem for an expedition and the equation that solves it.",
      lessons: [
        {
          id: "math-r1",
          order: 1,
          title: "Equal groups & arrays",
          activities: [
            {
              id: "math-r1-a1",
              kind: "math-array",
              title: "Build the rocket seats",
              blurb: "4 rows of 5. Skip-count to the total.",
              estMinutes: 8,
              band: "ready",
              skillTags: ["math.equal-groups.arrays"],
              config: {
                instruction: "The rocket has 4 rows of seats, 5 seats in each row. Build it, then skip-count one row at a time to find the total.",
                mode: "build",
                rows: 4,
                cols: 5,
                emoji: "🚀",
              },
            },
          ],
        },
        {
          id: "math-r2",
          order: 2,
          title: "Multiplication means equal groups",
          activities: [
            {
              id: "math-r2-a1",
              kind: "math-array",
              title: "Say it three ways",
              blurb: "Array, repeated addition, and 3 x 4 = 12.",
              estMinutes: 8,
              band: "ready",
              skillTags: ["math.mult.meaning"],
              config: {
                instruction: "Build 3 rows of 4. Then say it as 4 + 4 + 4, as 3 x 4, and find the product.",
                mode: "multiply",
                rows: 3,
                cols: 4,
                answer: 12,
                emoji: "🍪",
              },
            },
            {
              id: "math-r2-a2",
              kind: "math-tenframe",
              title: "Skip-count the groups",
              blurb: "Four groups of five, counted on the frames.",
              estMinutes: 6,
              band: "ready",
              skillTags: ["math.mult.meaning"],
              config: {
                instruction: "Show four groups of five by filling the frames, then count them: 5, 10, 15, 20.",
                mode: "represent",
                target: 20,
                frames: 2,
              },
            },
          ],
        },
        {
          id: "math-r5",
          order: 3,
          title: "Division & fact families",
          activities: [
            {
              id: "math-r5-a1",
              kind: "math-array",
              title: "Share the treasure",
              blurb: "15 gold coins, 3 explorers. How many each?",
              estMinutes: 8,
              band: "ready",
              skillTags: ["math.div.fact-families"],
              config: {
                instruction: "Deal 15 gold coins fairly to 3 explorers. How many does each one get? Then write all four facts this array holds.",
                mode: "divide",
                rows: 3,
                cols: 5,
                answer: 5,
                emoji: "🪙",
              },
            },
          ],
        },
        {
          id: "math-r7",
          order: 4,
          title: "Regrouping (trading tens & ones)",
          activities: [
            {
              id: "math-r7-a1",
              kind: "math-tenframe",
              title: "Trade up",
              blurb: "Combine the ones. Too many? Trade ten for a ten.",
              estMinutes: 10,
              band: "ready",
              skillTags: ["math.regrouping"],
              config: {
                instruction: "Add 7 and 8 on the frames. When the ones fill past ten, trade ten of them for one full ten. That is regrouping.",
                mode: "add",
                target: 7,
                addend: 8,
                frames: 2,
              },
            },
          ],
        },
        {
          id: "math-r8",
          order: 5,
          title: "Fractions: equal parts of a whole",
          activities: [
            {
              id: "math-r8-a1",
              kind: "math-array",
              title: "Area is an array",
              blurb: "Tile the rectangle, then find its area.",
              estMinutes: 8,
              band: "ready",
              skillTags: ["math.geometry.area-arrays", "math.fractions.unit"],
              config: {
                instruction: "Tile this rectangle with unit squares. How many squares cover it? Notice you can multiply the rows by the columns instead of counting each one.",
                mode: "area",
                rows: 3,
                cols: 4,
                answer: 12,
                emoji: "🟦",
              },
            },
            {
              id: "math-r8-a2",
              kind: "math-array",
              title: "Fair shares must be equal",
              blurb: "Split the flatbread into 4 equal parts.",
              estMinutes: 8,
              band: "stretch",
              skillTags: ["math.fractions.unit"],
              config: {
                instruction: "Share the Egyptian flatbread among 4 diggers. Build it as a 1 by 4 row of equal parts, then point to one part: that is 1/4. Would an unequal piece still be 1/4?",
                mode: "area",
                rows: 1,
                cols: 4,
                answer: 4,
                emoji: "🫓",
              },
            },
          ],
        },
      ],
    },

    // ── Life Skills Math (B1): time · money · measurement ──────────────────
    // Foundational tier (new "lifeskills" domain, tags math.time/math.money/
    // math.measure), distinct from the advanced "math.measurement.*" tier
    // that already exists under the "math" domain. Intentional sequencing —
    // this unit is the concrete, everyday-object entry point; the advanced
    // math.measurement skills go further with the same topics later.
    {
      id: "life-skills-math",
      order: 5,
      title: "Life Skills Math",
      emoji: "🕐",
      world: "garden",
      bigIdea: "Math is everywhere — in clocks, coins, and how big things are.",
      phonicsFocus: "",
      mathFocus: "Time to the hour & half-hour, coins to a dollar, comparing & measuring",
      project: "Make a play store: price three toys and 'buy' them with coins.",
      lessons: [
        {
          id: "lsm-time",
          order: 1,
          title: "Telling Time",
          activities: [
            {
              id: "lsm-time-read-1",
              kind: "math-clock",
              title: "What time is it?",
              blurb: "Read the clock to the hour.",
              estMinutes: 6,
              band: "ready",
              skillTags: ["math.time"],
              config: {
                mode: "read",
                instruction: "What time does the clock say?",
                hour: 3,
                minute: 0,
                choices: ["2:00", "3:00", "4:00"],
                answerIndex: 1,
              },
            },
            {
              id: "lsm-time-read-2",
              kind: "math-clock",
              title: "Half past the hour",
              blurb: "Read the clock to the half-hour.",
              estMinutes: 6,
              band: "ready",
              skillTags: ["math.time"],
              config: {
                mode: "read",
                instruction: "What time does the clock say?",
                hour: 7,
                minute: 30,
                choices: ["7:00", "7:30", "8:00"],
                answerIndex: 1,
              },
            },
            {
              id: "lsm-time-set-1",
              kind: "math-clock",
              title: "Make the time",
              blurb: "Move the hands to show the hour.",
              estMinutes: 6,
              band: "ready",
              skillTags: ["math.time"],
              config: {
                mode: "set",
                instruction: "Make the clock say nine o'clock.",
                targetHour: 9,
                targetMinute: 0,
              },
            },
            {
              id: "lsm-time-set-2",
              kind: "math-clock",
              title: "Half past eleven",
              blurb: "Move the hands to show the half-hour.",
              estMinutes: 8,
              band: "stretch",
              skillTags: ["math.time"],
              config: {
                mode: "set",
                instruction: "Make the clock say half past eleven.",
                targetHour: 11,
                targetMinute: 30,
              },
            },
          ],
        },
        {
          id: "lsm-money",
          order: 2,
          title: "Money & Coins",
          activities: [
            {
              id: "lsm-money-id-1",
              kind: "math-money",
              title: "Find the coin",
              blurb: "Tap the coin that's named.",
              estMinutes: 5,
              band: "ready",
              skillTags: ["math.money"],
              config: {
                mode: "identify",
                instruction: "Tap the dime.",
                coins: ["penny", "nickel", "dime", "quarter"],
                targetCoin: "dime",
              },
            },
            {
              id: "lsm-money-id-2",
              kind: "math-money",
              title: "Find the quarter",
              blurb: "Tap the coin that's named.",
              estMinutes: 5,
              band: "ready",
              skillTags: ["math.money"],
              config: {
                mode: "identify",
                instruction: "Tap the quarter.",
                coins: ["nickel", "dime", "quarter"],
                targetCoin: "quarter",
              },
            },
            {
              id: "lsm-money-count-1",
              kind: "math-money",
              title: "Make 15 cents",
              blurb: "Drop coins to reach the total.",
              estMinutes: 8,
              band: "ready",
              skillTags: ["math.money"],
              config: {
                mode: "count",
                instruction: "Drop coins to make 15 cents.",
                palette: ["penny", "nickel", "dime"],
                targetCents: 15,
              },
            },
            {
              id: "lsm-money-count-2",
              kind: "math-money",
              title: "Make 35 cents",
              blurb: "Drop coins to reach the total.",
              estMinutes: 8,
              band: "ready",
              skillTags: ["math.money"],
              config: {
                mode: "count",
                instruction: "Drop coins to make 35 cents.",
                palette: ["nickel", "dime", "quarter"],
                targetCents: 35,
              },
            },
          ],
        },
        {
          id: "lsm-measure",
          order: 3,
          title: "Measuring",
          activities: [
            {
              id: "lsm-measure-cmp-1",
              kind: "math-measure",
              title: "Which is longest?",
              blurb: "Compare three objects by length.",
              estMinutes: 6,
              band: "ready",
              skillTags: ["math.measure"],
              config: {
                mode: "compare",
                instruction: "Which one is the longest?",
                attribute: "length",
                question: "most",
                items: [
                  { label: "pencil", emoji: "✏️", size: 3 },
                  { label: "crayon", emoji: "🖍️", size: 2 },
                  { label: "marker", emoji: "🖊️", size: 4 },
                ],
                answerIndex: 2,
              },
            },
            {
              id: "lsm-measure-cmp-2",
              kind: "math-measure",
              title: "Which is heaviest?",
              blurb: "Compare three objects by weight.",
              estMinutes: 6,
              band: "ready",
              skillTags: ["math.measure"],
              config: {
                mode: "compare",
                instruction: "Which one is the heaviest?",
                attribute: "weight",
                question: "most",
                items: [
                  { label: "feather", emoji: "🪶", size: 1 },
                  { label: "apple", emoji: "🍎", size: 2 },
                  { label: "watermelon", emoji: "🍉", size: 4 },
                ],
                answerIndex: 2,
              },
            },
            {
              id: "lsm-measure-units-1",
              kind: "math-measure",
              title: "How many cubes?",
              blurb: "Measure length in non-standard units.",
              estMinutes: 8,
              band: "ready",
              skillTags: ["math.measure"],
              config: {
                mode: "units",
                instruction: "How many cubes long is the shoe?",
                unit: "cube",
                length: 5,
                choices: [4, 5, 6],
                answerIndex: 1,
              },
            },
            {
              id: "lsm-measure-units-2",
              kind: "math-measure",
              title: "How many paperclips?",
              blurb: "Measure length in a different unit.",
              estMinutes: 8,
              band: "stretch",
              skillTags: ["math.measure"],
              config: {
                mode: "units",
                instruction: "How many paperclips long is the crayon box?",
                unit: "paperclip",
                length: 8,
                choices: [6, 8, 10],
                answerIndex: 1,
              },
            },
          ],
        },
      ],
    },

    // ── Science & Nature (B2): classify · sequence ─────────────────────────
    // Ocean map world (shared theme, its own map path). Two new activity kinds:
    // sort-categories (science.classify) and seq-order (science.sequence). The
    // Players speak only the `instruction`, so card/bin labels need no phoneme
    // overrides; instructions stay in plainly-voiced words. Every seq-order
    // `cards` array is authored in TRUE real-world order (array order = answer
    // key); every sort item.binId references a real bin id in the same activity.
    {
      id: "science-nature",
      order: 6,
      title: "Science & Nature",
      emoji: "🔬",
      world: "ocean",
      bigIdea: "We can look closely, sort things into groups, and put nature's steps in order.",
      phonicsFocus: "",
      mathFocus: "Sorting & classifying, life cycles, day & seasons",
      project: "Make a nature collection: sort five things you find outside into two groups.",
      lessons: [
        {
          id: "sci-sort",
          order: 1,
          title: "Sorting & Classifying",
          activities: [
            {
              id: "sci-sort-living",
              kind: "sort-categories",
              title: "Living or not living?",
              blurb: "Sort each thing into living or nonliving.",
              estMinutes: 6,
              band: "ready",
              skillTags: ["science.classify"],
              config: {
                instruction: "Sort each one: is it living or not living?",
                bins: [
                  { id: "living", label: "Living", emoji: "🌱" },
                  { id: "nonliving", label: "Nonliving", emoji: "🪨" },
                ],
                items: [
                  { label: "Dog", emoji: "🐶", binId: "living" },
                  { label: "Tree", emoji: "🌳", binId: "living" },
                  { label: "Fish", emoji: "🐟", binId: "living" },
                  { label: "Bird", emoji: "🐦", binId: "living" },
                  { label: "Rock", emoji: "🪨", binId: "nonliving" },
                  { label: "Toy car", emoji: "🚗", binId: "nonliving" },
                  { label: "Cup", emoji: "🥤", binId: "nonliving" },
                  { label: "Ball", emoji: "⚽", binId: "nonliving" },
                ],
              },
            },
            {
              id: "sci-sort-animals",
              kind: "sort-categories",
              title: "Animal groups",
              blurb: "Put each animal in its group.",
              estMinutes: 8,
              band: "stretch",
              skillTags: ["science.classify"],
              config: {
                instruction: "Put each animal in its group.",
                bins: [
                  { id: "mammal", label: "Mammal", emoji: "🐶" },
                  { id: "bird", label: "Bird", emoji: "🐦" },
                  { id: "fish", label: "Fish", emoji: "🐟" },
                  { id: "bug", label: "Bug", emoji: "🐛" },
                ],
                items: [
                  { label: "Dog", emoji: "🐶", binId: "mammal" },
                  { label: "Cat", emoji: "🐱", binId: "mammal" },
                  { label: "Robin", emoji: "🐦", binId: "bird" },
                  { label: "Owl", emoji: "🦉", binId: "bird" },
                  { label: "Shark", emoji: "🦈", binId: "fish" },
                  { label: "Goldfish", emoji: "🐟", binId: "fish" },
                  { label: "Ant", emoji: "🐜", binId: "bug" },
                  { label: "Bee", emoji: "🐝", binId: "bug" },
                ],
              },
            },
            {
              id: "sci-sort-materials",
              kind: "sort-categories",
              title: "What is it made of?",
              blurb: "Sort each thing by what it is made of.",
              estMinutes: 8,
              band: "ready",
              skillTags: ["science.classify"],
              config: {
                instruction: "Sort each thing by what it is made of.",
                bins: [
                  { id: "wood", label: "Wood", emoji: "🪵" },
                  { id: "metal", label: "Metal", emoji: "🔩" },
                  { id: "plastic", label: "Plastic", emoji: "🪣" },
                  { id: "cloth", label: "Cloth", emoji: "🧵" },
                ],
                items: [
                  { label: "Log", emoji: "🪵", binId: "wood" },
                  { label: "Pencil", emoji: "✏️", binId: "wood" },
                  { label: "Key", emoji: "🔑", binId: "metal" },
                  { label: "Spoon", emoji: "🥄", binId: "metal" },
                  { label: "Straw", emoji: "🥤", binId: "plastic" },
                  { label: "Bucket", emoji: "🪣", binId: "plastic" },
                  { label: "Shirt", emoji: "👕", binId: "cloth" },
                  { label: "Sock", emoji: "🧦", binId: "cloth" },
                ],
              },
            },
            {
              id: "sci-sort-habitat",
              kind: "sort-categories",
              title: "Land or water home",
              blurb: "Sort each animal by where it lives.",
              estMinutes: 8,
              band: "stretch",
              skillTags: ["science.classify"],
              config: {
                instruction: "Where does each animal live: on land or in the water?",
                bins: [
                  { id: "land", label: "On land", emoji: "🌳" },
                  { id: "water", label: "In water", emoji: "🌊" },
                ],
                items: [
                  { label: "Lion", emoji: "🦁", binId: "land" },
                  { label: "Rabbit", emoji: "🐰", binId: "land" },
                  { label: "Bear", emoji: "🐻", binId: "land" },
                  { label: "Fish", emoji: "🐟", binId: "water" },
                  { label: "Whale", emoji: "🐳", binId: "water" },
                  { label: "Crab", emoji: "🦀", binId: "water" },
                ],
              },
            },
          ],
        },
        {
          id: "sci-cycle",
          order: 2,
          title: "Life Cycles & Order",
          activities: [
            {
              id: "sci-cycle-butterfly",
              kind: "seq-order",
              title: "Butterfly life cycle",
              blurb: "Put the butterfly's life cycle in order.",
              estMinutes: 6,
              band: "ready",
              skillTags: ["science.sequence"],
              config: {
                instruction: "Put the butterfly's life cycle in order, from first to last.",
                cards: [
                  { label: "Egg", emoji: "🥚" },
                  { label: "Caterpillar", emoji: "🐛" },
                  { label: "Chrysalis", emoji: "🛡️" },
                  { label: "Butterfly", emoji: "🦋" },
                ],
              },
            },
            {
              id: "sci-cycle-frog",
              kind: "seq-order",
              title: "Frog life cycle",
              blurb: "Put the frog's life cycle in order.",
              estMinutes: 6,
              band: "ready",
              skillTags: ["science.sequence"],
              config: {
                instruction: "Put the frog's life cycle in order, from first to last.",
                cards: [
                  { label: "Egg", emoji: "🥚" },
                  { label: "Tadpole", emoji: "🐟" },
                  { label: "Froglet", emoji: "🐸" },
                  { label: "Frog", emoji: "🐸" },
                ],
              },
            },
            {
              id: "sci-cycle-plant",
              kind: "seq-order",
              title: "Bean plant life cycle",
              blurb: "Put the bean plant's life cycle in order.",
              estMinutes: 6,
              band: "ready",
              skillTags: ["science.sequence"],
              config: {
                instruction: "Put the bean plant's life cycle in order, from first to last.",
                cards: [
                  { label: "Seed", emoji: "🫘" },
                  { label: "Sprout", emoji: "🌱" },
                  { label: "Plant", emoji: "🪴" },
                  { label: "Flower", emoji: "🌸" },
                ],
              },
            },
            {
              id: "sci-cycle-grow",
              kind: "seq-order",
              title: "Growing up",
              blurb: "Put the stages of growing up in order.",
              estMinutes: 6,
              band: "stretch",
              skillTags: ["science.sequence"],
              config: {
                instruction: "Put the stages of growing up in order, from baby to grown-up.",
                cards: [
                  { label: "Baby", emoji: "👶" },
                  { label: "Kid", emoji: "🧒" },
                  { label: "Teen", emoji: "🧑" },
                  { label: "Grown-up", emoji: "👵" },
                ],
              },
            },
          ],
        },
        {
          id: "sci-nature",
          order: 3,
          title: "Nature & Weather",
          activities: [
            {
              id: "sci-nature-day",
              kind: "seq-order",
              title: "One day in order",
              blurb: "Put the parts of a day in order.",
              estMinutes: 6,
              band: "ready",
              skillTags: ["science.sequence"],
              config: {
                instruction: "Put one day in order, from morning to night.",
                cards: [
                  { label: "Morning", emoji: "🌅" },
                  { label: "Noon", emoji: "☀️" },
                  { label: "Evening", emoji: "🌆" },
                  { label: "Night", emoji: "🌙" },
                ],
              },
            },
            {
              id: "sci-nature-seasons",
              kind: "seq-order",
              title: "The four seasons",
              blurb: "Put the seasons in order, starting with spring.",
              estMinutes: 8,
              band: "stretch",
              skillTags: ["science.sequence"],
              config: {
                instruction: "Put the seasons in order, starting with spring.",
                cards: [
                  { label: "Spring", emoji: "🌷" },
                  { label: "Summer", emoji: "☀️" },
                  { label: "Fall", emoji: "🍂" },
                  { label: "Winter", emoji: "❄️" },
                ],
              },
            },
            {
              id: "sci-nature-read",
              kind: "reading-comprehension",
              title: "Where does rain come from?",
              blurb: "Read a short science page, then answer.",
              estMinutes: 8,
              band: "ready",
              skillTags: ["reading.nonfiction.text-features"],
              config: {
                instruction: "Read the page. Then use the words on the page to answer.",
                title: "Where Does Rain Come From?",
                passage:
                  "The sun warms the water in lakes and oceans. The warm water turns into tiny drops that float up into the sky. Up high, the drops come together and make clouds. When a cloud gets very full, the drops fall back down as rain.",
                questions: [
                  {
                    prompt: "What makes the water turn into tiny drops?",
                    choices: ["The wind", "The warm sun", "The moon"],
                    answerIndex: 1,
                    kind: "literal",
                  },
                  {
                    prompt: "What happens when a cloud gets very full?",
                    choices: ["It rains", "It turns into a rock", "It flies away"],
                    answerIndex: 0,
                    kind: "literal",
                  },
                  {
                    prompt: "What is this page mostly about?",
                    choices: ["How rain is made", "How to swim", "Why the sun is hot"],
                    answerIndex: 0,
                    kind: "main-idea",
                  },
                ],
              },
            },
          ],
        },
      ],
    },

    // ── Decodable Readers: short vowels → digraphs → blends ──────────────
    {
      id: "decodable-readers",
      order: 7,
      title: "Decodable Readers",
      emoji: "🐚",
      world: "ocean",
      bigIdea:
        "Use the sound patterns you know to unlock each sentence, then read it smoothly.",
      phonicsFocus: "Short vowels → digraphs → blends",
      mathFocus: "",
      project: "Read a whole shelf of sound-it-out sentences aloud.",
      lessons: DECODABLE_LIBRARY.map((group, index) => ({
        id: `decodable-${group.pattern}`,
        order: index + 1,
        title: group.lessonTitle,
        activities: decodableReaderActivities(group.pattern),
      })),
    },

    // ── Baseline check-ins (Adventure 2.0 C1) ──────────────────────────────
    // "Show what you know" placement units, one per academic strand. Each
    // activity below probes exactly ONE skill so its first-try outcome is a
    // clean per-skill signal for computePlacement (src/lib/placement). order: 0
    // surfaces each ahead of its strand's regular units. checkpoint: "baseline"
    // routes the attempt's evidence to checkpoint_result instead of skill_state
    // (parent applies the placement afterward) — see src/lib/tutor/store.ts.
    //
    // Kind choice is deliberate, not just "whatever the strand uses": each
    // activity kind's runtime `skillsAffected(config)` (src/activities/*/logic.ts)
    // is what actually gets scored, and it does not always match a content
    // author's declared `skillTags`. reading-comprehension's evidence is fixed
    // by question.kind (literal/inference/main-idea/vocabulary/author → one of
    // 5 reading.* skills) and math-array's by `mode` (build/multiply/divide/area
    // → math.equal-groups.arrays/mult.facts/div.fact-families/geometry.area-arrays).
    // Every item here is authored so its declared skillTags equal that real,
    // runtime-evidenced skill — see docs/claude/... report for the Word Study
    // caveat (phonics-wordbuild/sightword-game don't have this property).
    {
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
              skillTags: ["reading.comprehension.main-idea"],
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
                    kind: "main-idea",
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
                  },
                ],
              },
            },
          ],
        },
      ],
    },

    {
      id: "math-baseline",
      order: 0,
      title: "Math — Show what you know",
      emoji: "🌟",
      world: "bigtop",
      bigIdea: "Let's see what you already know about math — there's no wrong here.",
      phonicsFocus: "",
      mathFocus: "A quick, friendly check-in",
      project: "Just play — I'm watching what you've got.",
      checkpoint: "baseline",
      lessons: [
        {
          id: "math-baseline-l1",
          order: 1,
          title: "Show what you know",
          activities: [
            {
              id: "math-baseline-a1",
              kind: "math-array",
              title: "Build the rows",
              blurb: "3 rows of 4. Skip-count to the total.",
              estMinutes: 5,
              band: "ready",
              skillTags: ["math.equal-groups.arrays"],
              config: {
                instruction: "Build 3 rows of 4 stars. Skip-count to find the total.",
                mode: "build",
                rows: 3,
                cols: 4,
                emoji: "⭐",
              },
            },
            {
              id: "math-baseline-a2",
              kind: "math-array",
              title: "Say it three ways",
              blurb: "Array, repeated addition, and the product.",
              estMinutes: 6,
              band: "ready",
              skillTags: ["math.mult.facts"],
              config: {
                instruction: "Look at 4 rows of 2. Say it as 2 + 2 + 2 + 2, then as 4 x 2, and find the product.",
                mode: "multiply",
                rows: 4,
                cols: 2,
                answer: 8,
                emoji: "🍎",
              },
            },
            {
              id: "math-baseline-a3",
              kind: "math-array",
              title: "Share it fairly",
              blurb: "12 cookies, 4 friends. How many each?",
              estMinutes: 6,
              band: "ready",
              skillTags: ["math.div.fact-families"],
              config: {
                instruction: "Share 12 cookies fairly among 4 friends. How many does each friend get?",
                mode: "divide",
                rows: 4,
                cols: 3,
                answer: 3,
                emoji: "🍪",
              },
            },
            {
              id: "math-baseline-a4",
              kind: "math-array",
              title: "Tile the rectangle",
              blurb: "Cover it with unit squares, then count.",
              estMinutes: 6,
              band: "ready",
              skillTags: ["math.geometry.area-arrays", "math.mult.facts"],
              config: {
                instruction: "Tile this rectangle with unit squares. How many squares cover it?",
                mode: "area",
                rows: 3,
                cols: 4,
                answer: 12,
                emoji: "🟦",
              },
            },
            {
              id: "math-baseline-a5",
              kind: "math-array",
              title: "Fair shares must be equal",
              blurb: "Split the pizza into 5 equal parts.",
              estMinutes: 7,
              band: "ready",
              skillTags: ["math.geometry.area-arrays", "math.mult.facts"],
              config: {
                instruction: "This strip is split into 5 equal parts in a row. How many parts in all?",
                mode: "area",
                rows: 1,
                cols: 5,
                answer: 5,
                emoji: "🍕",
              },
            },
          ],
        },
      ],
    },
  ],
};
