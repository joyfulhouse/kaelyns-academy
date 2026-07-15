import type { Skill, SkillTag } from "./types";

/**
 * The leveled skill rubric backing Program 02 — Kaelyn's Adaptive Curriculum.
 * One Skill per rung across the four strands, using the exact slugs the
 * curriculum docs define (docs/curriculum/kaelyn-adaptive/strands/*.md). The
 * tutor reads this rubric to track skill_state (not-yet / emerging / solid) and
 * to generate fresh, leveled practice; activities carry these slugs in skillTags.
 *
 * Domains: reading · word (multisyllable decoding + morphology) · vocab
 * (word depth) · writing (compose + transcription) · math · habits.
 * readyIndicator = the rung's can-do descriptor; stretchIndicator = its reach.
 */
export const SKILLS: Skill[] = [
  // ── Reading & Comprehension (strands/reading.md, R-RD-1..R-RD-8) ──
  {
    slug: "reading.fluency.phrasing",
    domain: "reading",
    label: "Fluency on early-chapter text",
    readyIndicator: "Reads a chapter-book passage in phrases, at a talking rate, with fitting expression, and self-corrects",
    stretchIndicator: "After a smooth read, says in one breath who it was about and what happened",
  },
  {
    slug: "reading.comprehension.retell",
    domain: "reading",
    label: "Story elements & retell (beginning, middle, end)",
    readyIndicator: "Puts the key events of a story in beginning-middle-end order for a coherent retell",
    stretchIndicator: "For one event asks \"why did he do that?\", moving from what happened to what it means",
  },
  {
    slug: "reading.comprehension.inference",
    domain: "reading",
    label: "Inference (feelings, motivation, prediction, cause & effect)",
    readyIndicator: "Infers how a character feels and why, makes an evidence-backed prediction or explains a cause-effect link, and names the clue",
    stretchIndicator: "Asked what a part is mostly about, answers with one idea instead of one detail",
  },
  {
    slug: "reading.comprehension.main-idea",
    domain: "reading",
    label: "Main idea & key details",
    readyIndicator: "Identifies what a passage is mostly about and selects key details that support that idea",
    stretchIndicator: "Uses a heading, picture, or bold word to find the main idea faster",
  },
  {
    slug: "reading.nonfiction.text-features",
    domain: "reading",
    label: "Nonfiction text features & finding text evidence",
    readyIndicator: "Uses headings, captions, diagrams, and bold words to locate an answer and cites the exact text or picture evidence",
    stretchIndicator: "Hits an unknown word and figures it out from the sentence instead of citing",
  },
  {
    slug: "reading.vocabulary.context",
    domain: "reading",
    label: "Vocabulary in context while reading",
    readyIndicator: "Works out an unfamiliar word from context clues, names the clue she used, and checks it by rereading",
    stretchIndicator: "Notices why the author chose a word or wrote the piece at all",
  },
  {
    slug: "reading.comprehension.author-craft",
    domain: "reading",
    label: "Author's purpose, comparing texts & theme",
    readyIndicator: "Tells why an author wrote a text, compares two texts on a real point, or names a defensible theme with support",
    stretchIndicator: "Holds the thread across many pages, tracking and summarizing a whole longer book",
  },
  {
    slug: "reading.comprehension.summarize",
    domain: "reading",
    label: "Sustaining & summarizing across a longer book",
    readyIndicator: "Recalls prior events across sittings, tracks how a character changes, and gives a tight multi-chapter summary in her own words",
    stretchIndicator: "Takes on a genuinely harder book or denser nonfiction and loops inference through summary at the new level",
  },

  // ── Word Study: advanced decoding + spelling + morphology
  //    (strands/word-study-vocabulary.md, R-WS-1..R-WS-11) ──
  {
    slug: "word.vowel-teams.multisyllable",
    domain: "word",
    label: "Vowel teams in longer words",
    readyIndicator: "Reads two-syllable words with a vowel team buried in the middle (railway, seaweed, oatmeal)",
    stretchIndicator: "Handles igh/ough oddballs and three-syllable team words (delight, understanding)",
  },
  {
    slug: "word.r-controlled.multisyllable",
    domain: "word",
    label: "R-controlled vowels in longer words",
    readyIndicator: "Reads multisyllable bossy-r words (garden, forest, perfect, thirsty, turtle)",
    stretchIndicator: "Reads air/are/ear and w+or saying /er/ (chair, bear, work, world)",
  },
  {
    slug: "word.diphthongs.multisyllable",
    domain: "word",
    label: "Diphthongs in longer words",
    readyIndicator: "Reads gliding-vowel words inside longer words (poison, mountain, powerful, enjoyment, awesome)",
    stretchIndicator: "Handles schwa-softened glides in unstressed syllables (\"moun-tn\", \"poi-zn\")",
  },
  {
    slug: "word.syllables.types",
    domain: "word",
    label: "The six syllable types",
    readyIndicator: "Names and reads closed, open, silent-e, vowel-team, r-controlled, and consonant-le syllables and uses the type to know the vowel sound",
    stretchIndicator: "Makes the open-or-closed judgment calls (ro-bot vs rob-in)",
  },
  {
    slug: "word.syllables.division",
    domain: "word",
    label: "Dividing & decoding multisyllable words",
    readyIndicator: "Splits an unfamiliar long word herself (VC/CV, V/CV, C+le), reads each part by its type, and blends to a smooth whole",
    stretchIndicator: "Reads 4+ syllable words and uses the split plus context to say what the word means",
  },
  {
    slug: "word.spelling.generalizations",
    domain: "word",
    label: "Spelling generalizations (doubling, drop-e, y→i)",
    readyIndicator: "Adds endings with the right rule: doubling (hopping), drop-e (baking), and y to i (happier), and can state which rule applies",
    stretchIndicator: "Handles the tricky conditions (crying not criing; beginning vs visiting)",
  },
  {
    slug: "word.morphology.inflections",
    domain: "word",
    label: "Inflectional suffixes (-s, -ed, -ing)",
    readyIndicator: "Reads and explains -s/-es, -ed, -ing, names the base, tells what the ending does, and sorts the three sounds of -ed",
    stretchIndicator: "Reads inflections stacked on spelling rules (hurrying, biggest, copied) and questions irregulars (ran has no -ed)",
  },
  {
    slug: "word.morphology.suffixes-comparative",
    domain: "word",
    label: "Comparative & adverb suffixes (-er, -est, -ly)",
    readyIndicator: "Reads, explains, and uses -er/-est to compare and -ly to make an adverb, noticing the word's job changes",
    stretchIndicator: "Spots the -er that means \"a person who does\" (teacher, farmer)",
  },
  {
    slug: "word.morphology.suffixes-derivational",
    domain: "word",
    label: "Meaning-shifting suffixes (-ful, -less, -ness, -er \"one who\")",
    readyIndicator: "Reads and defines from parts -ful (full of), -less (without), -ness (state of being), and -er/-or (one who)",
    stretchIndicator: "Stacks two suffixes (hopefully, carelessness) and spots a base despite a spelling change (happy → happiness)",
  },
  {
    slug: "word.morphology.prefixes",
    domain: "word",
    label: "Prefixes (un-, re-, pre-, dis-, mis-, non-)",
    readyIndicator: "Reads prefixed words and uses the prefix's meaning to understand them (unhappy, redo, preview, misread)",
    stretchIndicator: "Reads prefix + base + suffix at once (unhelpful, rebuilding) and tells reversing un- from negating un-",
  },
  {
    slug: "word.morphology.roots",
    domain: "word",
    label: "Greek & Latin roots",
    readyIndicator: "Knows roots carry meaning (tele, port, struct, bio, geo, graph, meter) and combines parts to read and infer new words like telegraph",
    stretchIndicator: "Combines two roots (photograph, microscope) and guesses a brand-new word from a root before confirming",
  },

  // ── Vocabulary depth (strands/word-study-vocabulary.md, R-WS-12..R-WS-15) ──
  {
    slug: "vocab.shades-of-meaning",
    domain: "vocab",
    label: "Synonyms, antonyms & shades of meaning",
    readyIndicator: "Recognizes synonyms and antonyms and chooses which near-synonym has the stronger or weaker degree",
    stretchIndicator: "Orders longer gradients and notices connotation (thin vs skinny vs slender)",
  },
  {
    slug: "vocab.multiple-meanings",
    domain: "vocab",
    label: "Multiple-meaning words",
    readyIndicator: "Knows one word can have several meanings and uses the sentence to tell which is in play (bark, trunk, bright)",
    stretchIndicator: "Handles words with 3+ meanings (run, set, point) and homophones (their/there/they're)",
  },
  {
    slug: "vocab.context-clues",
    domain: "vocab",
    label: "Context clues",
    readyIndicator: "Uses a definition, example, synonym, antonym, or general sense around an unknown word to infer its meaning, then checks the guess",
    stretchIndicator: "Handles clues a sentence or two away and combines context with a Greek/Latin root to pin a precise meaning",
  },
  {
    slug: "vocab.tier-2-academic",
    domain: "vocab",
    label: "Tier-2 academic vocabulary",
    readyIndicator: "Learns and uses high-value cross-subject words (observe, predict, compare, eventually, essential) in her own talking and writing",
    stretchIndicator: "Works word families together (observe → observation → observant) and uses a precise Tier-2 word unprompted in a paragraph",
  },

  // ── Writing: composition, Ladder A (strands/writing-composition.md, R-WC-1..R-WC-7) ──
  {
    slug: "writing.compose.label",
    domain: "writing",
    label: "Label & caption (word → phrase)",
    readyIndicator: "Labels a picture with an accurate word and stretches it to a 2-3 word phrase that adds one detail",
    stretchIndicator: "Turns a caption into a whole spoken sentence",
  },
  {
    slug: "writing.compose.sentence",
    domain: "writing",
    label: "One complete sentence",
    readyIndicator: "Produces a complete, sensible sentence (oral-then-scribed or via a frame); judged on completeness and meaning, not transcription",
    stretchIndicator: "Adds a where or when to her sentence",
  },
  {
    slug: "writing.compose.sentence-expand",
    domain: "writing",
    label: "Expand a sentence (detail, stronger words)",
    readyIndicator: "Grows a bare sentence with two or more meaningful additions: a who/what/when/where/why, an adjective, or a stronger verb",
    stretchIndicator: "Writes a second sentence that connects to the first",
  },
  {
    slug: "writing.compose.two-sentences",
    domain: "writing",
    label: "Two related sentences",
    readyIndicator: "Composes two sentences that clearly belong together and uses a connector (and, but, so, because) when it fits",
    stretchIndicator: "Adds a third sentence so it has a beginning, middle, and end",
  },
  {
    slug: "writing.compose.narrative",
    domain: "writing",
    label: "Three-sentence narrative (beginning, middle, end)",
    readyIndicator: "Composes a coherent 3-sentence story with a clear beginning, middle, and end; judged on structure and sense, never neatness",
    stretchIndicator: "Adds a detail sentence to the middle, growing toward a paragraph",
  },
  {
    slug: "writing.compose.informational",
    domain: "writing",
    label: "Informational piece (2-3 facts)",
    readyIndicator: "Composes 2-3 true facts on a topic she knows, in an order that makes sense",
    stretchIndicator: "Opens with a topic sentence before the facts, growing toward a paragraph",
  },
  {
    slug: "writing.compose.opinion",
    domain: "writing",
    label: "Opinion piece (\"I think ___ because ___\")",
    readyIndicator: "States an opinion and backs it with a reason (\"I think ___ because ___\")",
    stretchIndicator: "Gives more than one reason for her opinion",
  },
  {
    slug: "writing.compose.paragraph",
    domain: "writing",
    label: "A short paragraph (topic sentence + details)",
    readyIndicator: "Composes a paragraph with a clear topic sentence and two or more on-topic supporting details, staying on one idea",
    stretchIndicator: "Rereads her own paragraph and improves one word or reorders one sentence",
  },
  {
    slug: "writing.compose.revise",
    domain: "writing",
    label: "Revise & edit (word choice, order, add detail)",
    readyIndicator: "Makes two or more meaningful revisions to her own piece and can say why each is better",
    stretchIndicator: "Takes a revised piece to \"published\": a title, a drawing, read aloud as the author",
  },

  // ── Writing: transcription, Ladder B (strands/writing-composition.md, R-WT-1..R-WT-4) ──
  {
    slug: "writing.transcription.letter-formation",
    domain: "writing",
    label: "Letter formation by stroke groups",
    readyIndicator: "Forms the current stroke family legibly with correct stroke direction on most attempts",
    stretchIndicator: "Tries the next stroke family or writes a short word she chooses from mastered letters",
  },
  {
    slug: "writing.transcription.spacing",
    domain: "writing",
    label: "Consistent spacing & sizing",
    readyIndicator: "Writes a short phrase with clear spaces between words and reasonably consistent letter sizing on the line",
    stretchIndicator: "Copies a two-sentence piece she composed while keeping the spacing",
  },
  {
    slug: "writing.transcription.capitalization-punctuation",
    domain: "writing",
    label: "Capital at the start + end punctuation",
    readyIndicator: "When handwriting a short composed sentence, begins with a capital and ends with the right mark (. ? !)",
    stretchIndicator: "Applies capitals and end marks across two handwritten sentences in a row",
  },
  {
    slug: "writing.transcription.stamina",
    domain: "writing",
    label: "Copying stamina",
    readyIndicator: "Handwrites a 2-3 sentence composed piece in one calm sitting with legible formation, spacing, and punctuation, without frustration",
    stretchIndicator: "Offered (never required) a slightly longer handwritten piece or simple cursive entry strokes",
  },

  // ── Math (strands/math.md, R-MA-1..R-MA-11) ──
  {
    slug: "math.equal-groups.arrays",
    domain: "math",
    label: "Equal groups & arrays",
    readyIndicator: "Builds equal groups or an array and finds the total by revealing and skip-counting the groups",
    stretchIndicator: "Given a total like 12, finds all the equal-group ways to build it (the doorway to factors)",
  },
  {
    slug: "math.mult.meaning",
    domain: "math",
    label: "Multiplication means equal groups",
    readyIndicator: "Connects an equal-groups model to repeated addition and a multiplication equation, then finds the product",
    stretchIndicator: "Writes a multiplication equation for a new word problem and explains why × fits",
  },
  {
    slug: "math.mult.facts",
    domain: "math",
    label: "Multiplication facts with strategies",
    readyIndicator: "Solid on 2s/5s/10s/squares from recall and can rebuild any other fact within 10 with a named strategy",
    stretchIndicator: "Mixed facts to 12 (×11, ×12 patterns) and explains a strategy for a fact \"a robot would just memorize\"",
  },
  {
    slug: "math.mult.commutative",
    domain: "math",
    label: "The commutative property",
    readyIndicator: "Gives the commutative partner of a fact, says the product is unchanged, and justifies it with a turned array",
    stretchIndicator: "Tests whether turning works for subtraction and discovers commutativity is special to × and +",
  },
  {
    slug: "math.div.fact-families",
    domain: "math",
    label: "Division (sharing & grouping); fact families",
    readyIndicator: "Solves a division situation by sharing or grouping and completes the full ×/÷ fact family for the model",
    stretchIndicator: "Interprets a remainder in a story (13 cookies, 4 friends) without formal notation",
  },
  {
    slug: "math.place-value.thousands",
    domain: "math",
    label: "Place value to 1000",
    readyIndicator: "Composes/decomposes a 3-digit number more than one way, compares two with a place-value reason, and rounds to ten and hundred",
    stretchIndicator: "Place value to 10,000 and explaining when rounding gives a wrong-feeling answer (money owed)",
  },
  {
    slug: "math.regrouping",
    domain: "math",
    label: "Multi-digit addition & subtraction with regrouping",
    readyIndicator: "Adds and subtracts 2- and 3-digit numbers that require regrouping and explains a regroup as a trade (or fixes a regrouping error)",
    stretchIndicator: "Three-addend sums, subtraction across a zero (305 - 168), and a quick mental strategy",
  },
  {
    slug: "math.add.make-ten",
    domain: "math",
    label: "Addition: make a ten",
    readyIndicator: "Uses a ten-frame to fill one ten, then combines the ten and leftover ones to solve an addition fact",
    stretchIndicator: "Chooses make-a-ten independently for a new addition fact and explains the split",
  },
  {
    slug: "math.fractions.unit",
    domain: "math",
    label: "Fractions: unit fractions, of a shape and of a set",
    readyIndicator: "Partitions a whole into equal parts and names the unit fraction, finds a unit fraction of a set, and compares same-denominator fractions",
    stretchIndicator: "Non-unit fractions (3/4), a simple equivalence she built (1/2 = 2/4), and placing a fraction on a number line",
  },
  {
    slug: "math.measurement.time",
    domain: "math",
    label: "Measurement: time to the minute & elapsed",
    readyIndicator: "Tells time to the minute and finds a simple elapsed time on a number line",
    stretchIndicator: "Elapsed time crossing the hour and across noon",
  },
  {
    slug: "math.measurement.length",
    domain: "math",
    label: "Measurement: length with units",
    readyIndicator: "Measures a length with correct units and notices the same object gets a bigger number in cm than in inches",
    stretchIndicator: "Estimates a length first, then measures and compares to the estimate",
  },
  {
    slug: "math.measurement.money",
    domain: "math",
    label: "Measurement: money & change",
    readyIndicator: "Makes a money amount more than one way and gives correct change by counting up",
    stretchIndicator: "Makes $1.25 with the fewest coins",
  },
  {
    slug: "math.data.graphs",
    domain: "math",
    label: "Measurement: picture & bar graphs",
    readyIndicator: "Reads and builds picture and bar graphs and answers comparison questions from them",
    stretchIndicator: "Answers a two-step graph question (Monday and Tuesday combined, and how many fewer on Wednesday)",
  },
  {
    slug: "math.geometry.area-arrays",
    domain: "math",
    label: "Geometry: area as arrays",
    readyIndicator: "Tiles a rectangle with equal unit squares and finds its area from the completed rows and columns",
    stretchIndicator: "Perimeter vs area, and composing/decomposing a shape to find the area of an L-shape",
  },
  {
    slug: "math.wordproblems.multistep",
    domain: "math",
    label: "Multi-step word problems & reasoning",
    readyIndicator: "Identifies what's asked, chooses and justifies the operation(s), models the problem, solves it, and judges whether the answer is reasonable",
    stretchIndicator: "Ignores distractor information, finds a missing piece, and explains two different solution paths",
  },

  // ── Habits (carried forward from Program 01) ──
  {
    slug: "habits.stamina",
    domain: "habits",
    label: "Focus & persistence",
    readyIndicator: "Works independently for a focused block and keeps trying when something is hard",
  },

  // ── Life Skills Math (B1): time · money · measurement ──
  {
    slug: "math.time",
    domain: "lifeskills",
    label: "Telling time to the hour & half-hour",
    readyIndicator: "Reads and sets an analog clock to the hour and half-hour, and matches it to the digital time",
    stretchIndicator: "Tells time to the quarter-hour and orders events by clock time",
  },
  {
    slug: "math.money",
    domain: "lifeskills",
    label: "Coins & counting money",
    readyIndicator: "Names penny, nickel, dime, and quarter and counts a small set of coins to a total up to one dollar",
    stretchIndicator: "Makes the same amount with different coin combinations",
  },
  {
    slug: "math.measure",
    domain: "lifeskills",
    label: "Comparing & measuring",
    readyIndicator: "Compares objects by length, height, and weight, and measures length in non-standard units",
    stretchIndicator: "Orders three or more objects and reasons about which unit fits",
  },

  // ── Science & Nature (B2): classify · sequence ──
  {
    slug: "science.classify",
    domain: "science",
    label: "Sorting & classifying",
    readyIndicator: "Sorts objects into groups by an observable attribute such as living/nonliving, land/water, or material",
    stretchIndicator: "Sorts the same set two different ways and names each rule",
  },
  {
    slug: "science.sequence",
    domain: "science",
    label: "Ordering & life cycles",
    readyIndicator: "Puts the stages of a familiar life cycle or a daily/seasonal sequence in the right order",
    stretchIndicator: "Explains what comes before and after a given stage",
  },

  // ── Decodable Readers (Phase 3 Slice 4): one decode skill per phonics
  // pattern, so each lesson tracks and schedules independently instead of
  // collapsing into a single fluency tag. ──
  {
    slug: "phonics.decode.short-a-cvc",
    domain: "phonics",
    label: "Decoding short a (CVC)",
    readyIndicator: "Sounds out and reads a short sentence of short-a CVC words accurately aloud",
    stretchIndicator: "Reads the sentence smoothly on the first try without sounding out",
  },
  {
    slug: "phonics.decode.short-e-cvc",
    domain: "phonics",
    label: "Decoding short e (CVC)",
    readyIndicator: "Sounds out and reads a short sentence of short-e CVC words accurately aloud",
    stretchIndicator: "Reads the sentence smoothly on the first try without sounding out",
  },
  {
    slug: "phonics.decode.short-i-cvc",
    domain: "phonics",
    label: "Decoding short i (CVC)",
    readyIndicator: "Sounds out and reads a short sentence of short-i CVC words accurately aloud",
    stretchIndicator: "Reads the sentence smoothly on the first try without sounding out",
  },
  {
    slug: "phonics.decode.short-o-cvc",
    domain: "phonics",
    label: "Decoding short o (CVC)",
    readyIndicator: "Sounds out and reads a short sentence of short-o CVC words accurately aloud",
    stretchIndicator: "Reads the sentence smoothly on the first try without sounding out",
  },
  {
    slug: "phonics.decode.short-u-cvc",
    domain: "phonics",
    label: "Decoding short u (CVC)",
    readyIndicator: "Sounds out and reads a short sentence of short-u CVC words accurately aloud",
    stretchIndicator: "Reads the sentence smoothly on the first try without sounding out",
  },
  {
    slug: "phonics.decode.digraph-sh",
    domain: "phonics",
    label: "Decoding sh words",
    readyIndicator: "Reads sh as one sound and decodes a short sentence with sh words accurately aloud",
    stretchIndicator: "Reads the sentence smoothly on the first try without sounding out",
  },
  {
    slug: "phonics.decode.digraph-ch",
    domain: "phonics",
    label: "Decoding ch words",
    readyIndicator: "Reads ch as one sound and decodes a short sentence with ch words accurately aloud",
    stretchIndicator: "Reads the sentence smoothly on the first try without sounding out",
  },
  {
    slug: "phonics.decode.digraph-th",
    domain: "phonics",
    label: "Decoding th words",
    readyIndicator: "Reads th as one sound and decodes a short sentence with th words accurately aloud",
    stretchIndicator: "Reads the sentence smoothly on the first try without sounding out",
  },
  {
    slug: "phonics.decode.blend-initial",
    domain: "phonics",
    label: "Decoding beginning blends",
    readyIndicator: "Blends both consonant sounds at the start of a word and reads a short blend sentence accurately aloud",
    stretchIndicator: "Reads the sentence smoothly on the first try without sounding out",
  },
  {
    slug: "phonics.decode.blend-final",
    domain: "phonics",
    label: "Decoding ending blends",
    readyIndicator: "Blends both consonant sounds at the end of a word and reads a short blend sentence accurately aloud",
    stretchIndicator: "Reads the sentence smoothly on the first try without sounding out",
  },

  // ── World Languages: Zhuyin / Bopomofo ──
  // Script-mapping: she already speaks Mandarin and reads pinyin, so this is
  // learning the symbols for sounds she knows, not a new language.
  {
    slug: "zhuyin.symbols.initials",
    domain: "zhuyin",
    label: "Zhuyin initial consonants (ㄅ ㄆ ㄇ ㄈ …)",
    readyIndicator: "Recognizes an initial Zhuyin symbol and matches it to its familiar sound or pinyin cue",
    stretchIndicator: "Hears a syllable and picks the Zhuyin symbol it starts with",
  },
  {
    slug: "zhuyin.symbols.medials-finals",
    domain: "zhuyin",
    label: "Zhuyin medials & finals (ㄧ ㄨ ㄩ · ㄚ ㄛ ㄜ …)",
    readyIndicator: "Recognizes medial and final Zhuyin symbols and matches each one to its familiar sound",
  },
  {
    slug: "zhuyin.tones",
    domain: "zhuyin",
    label: "Zhuyin tone marks (ˉ ˊ ˇ ˋ)",
    readyIndicator: "Hears a familiar syllable and matches it to the Zhuyin tone mark that fits",
    stretchIndicator: "Reads a written syllable with its tone mark at the right pitch",
  },
  {
    slug: "zhuyin.blend",
    domain: "zhuyin",
    label: "Blend Zhuyin into syllables",
    readyIndicator: "Recognizes a familiar spoken syllable and matches it to its bounded Zhuyin parts",
  },
  {
    slug: "zhuyin.read",
    domain: "zhuyin",
    label: "Read words written in Zhuyin",
    readyIndicator: "Recognizes common words written in Zhuyin and matches them to familiar spoken words",
  },

  // ── World Languages: Spanish (new language) ──
  {
    slug: "spanish.greetings",
    domain: "spanish",
    label: "Spanish greetings & courtesy",
    readyIndicator: "Recognizes hola, adiós, gracias, and por favor and matches each greeting to its meaning",
  },
  {
    slug: "spanish.numbers",
    domain: "spanish",
    label: "Spanish numbers 1–10",
    readyIndicator: "Recognizes Spanish number words uno to diez and matches each one to its number meaning",
  },
  {
    slug: "spanish.colors",
    domain: "spanish",
    label: "Spanish colors",
    readyIndicator: "Recognizes common Spanish color words and matches each one to its color meaning",
  },
  {
    slug: "spanish.family",
    domain: "spanish",
    label: "Spanish family & people words",
    readyIndicator: "Recognizes mamá, papá, hermano, and hermana and matches each word to its family meaning",
  },
  {
    slug: "spanish.listening",
    domain: "spanish",
    label: "Spanish listening",
    readyIndicator: "Hears a familiar Spanish word and matches it to the corresponding written word",
  },
  {
    slug: "spanish.phrases",
    domain: "spanish",
    label: "Simple Spanish phrases (introduce yourself)",
    readyIndicator: "Recognizes me llamo… and tengo … años and matches each phrase to its meaning",
  },

  // ── World Languages: Japanese (new language) ──
  {
    slug: "japanese.hiragana-vowels",
    domain: "japanese",
    label: "Hiragana vowels (あ い う え お)",
    readyIndicator: "Recognizes the five hiragana vowels and matches each kana to its sound",
  },
  {
    slug: "japanese.hiragana-k-s-t",
    domain: "japanese",
    label: "Hiragana か・さ・た rows",
    readyIndicator: "Recognizes ka-, sa-, and ta-row hiragana and matches each kana to its sound",
  },
  {
    slug: "japanese.hiragana-n-h-m",
    domain: "japanese",
    label: "Hiragana な・は・ま rows",
    readyIndicator: "Recognizes na-, ha-, and ma-row hiragana and matches each kana to its sound",
  },
  {
    slug: "japanese.katakana-intro",
    domain: "japanese",
    label: "First katakana",
    readyIndicator: "Recognizes the first katakana and matches each one to its familiar sound",
  },
  {
    slug: "japanese.greetings",
    domain: "japanese",
    label: "Japanese greetings",
    readyIndicator: "Recognizes familiar Japanese greetings and matches each one to its meaning",
  },
  {
    slug: "japanese.listening",
    domain: "japanese",
    label: "Japanese listening",
    readyIndicator: "Hears a familiar Japanese sound or word and matches it to the corresponding kana",
  },

  // ── World Languages: Korean (new language) ──
  {
    slug: "korean.vowels",
    domain: "korean",
    label: "Hangul vowels (ㅏ ㅓ ㅗ ㅜ ㅣ)",
    readyIndicator: "Recognizes basic Hangul vowels and matches each jamo to its sound",
  },
  {
    slug: "korean.consonants",
    domain: "korean",
    label: "Hangul consonants (ㄱ ㄴ ㄷ ㄹ ㅁ …)",
    readyIndicator: "Recognizes basic Hangul consonants and matches each jamo to its sound",
  },
  {
    slug: "korean.syllables",
    domain: "korean",
    label: "Build Hangul syllable blocks",
    readyIndicator: "Recognizes a bounded Hangul syllable block and matches it to its component sounds",
  },
  {
    slug: "korean.greetings",
    domain: "korean",
    label: "Korean greetings",
    readyIndicator: "Recognizes 안녕하세요 and 감사합니다 and matches each greeting to its meaning",
  },
  {
    slug: "korean.listening",
    domain: "korean",
    label: "Korean listening",
    readyIndicator: "Hears a familiar Korean sound or word and matches it to the corresponding Hangul",
  },
];

const BY_SLUG = new Map<SkillTag, Skill>(SKILLS.map((s) => [s.slug, s]));

export function getSkill(slug: SkillTag): Skill | undefined {
  return BY_SLUG.get(slug);
}
