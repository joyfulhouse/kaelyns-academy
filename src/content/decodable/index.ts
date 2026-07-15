import type { Activity } from "../types";

export type PhonicsPattern =
  | "short-a-cvc"
  | "short-e-cvc"
  | "short-i-cvc"
  | "short-o-cvc"
  | "short-u-cvc"
  | "digraph-sh"
  | "digraph-ch"
  | "digraph-th"
  | "blend-initial"
  | "blend-final";

export interface DecodableLibraryGroup {
  pattern: PhonicsPattern;
  lessonTitle: string;
  passages: string[];
}

export const DECODABLE_LIBRARY: DecodableLibraryGroup[] = [
  {
    pattern: "short-a-cvc",
    lessonTitle: "Short a: Cat and Map",
    passages: ["The fat cat sat.", "A man had a map.", "Sam can pat the cat."],
  },
  {
    pattern: "short-e-cvc",
    lessonTitle: "Short e: Hen and Pen",
    passages: [
      "The hen fed the pet.",
      "Ben can get the red pen.",
      "A vet met ten men.",
    ],
  },
  {
    pattern: "short-i-cvc",
    lessonTitle: "Short i: Pig and Dig",
    passages: [
      "A pig can dig.",
      "The kid hid in the bin.",
      "Tim can sit and sip.",
    ],
  },
  {
    pattern: "short-o-cvc",
    lessonTitle: "Short o: Dog and Log",
    passages: [
      "The dog can jog to Tom.",
      "A fox can hop to the log.",
      "Tom got the hot pot.",
    ],
  },
  {
    pattern: "short-u-cvc",
    lessonTitle: "Short u: Cub and Sun",
    passages: [
      "The cub can run in the sun.",
      "The bug dug in mud.",
      "Gus can hug the pup.",
    ],
  },
  {
    pattern: "digraph-sh",
    lessonTitle: "Digraph sh: Fish and Dish",
    passages: [
      "A fish can fit in a dish.",
      "She can shop.",
      "The shed had a cap.",
    ],
  },
  {
    pattern: "digraph-ch",
    lessonTitle: "Digraph ch: Chip and Chat",
    passages: [
      "Chad can chop ham.",
      "Chad had a chip.",
      "The chin had a red dot.",
    ],
  },
  {
    pattern: "digraph-th",
    lessonTitle: "Digraph th: Moth and Bath",
    passages: [
      "The moth sat in the bath.",
      "A thin cat had a bath.",
      "Beth can chat with Chad.",
    ],
  },
  {
    pattern: "blend-initial",
    lessonTitle: "Beginning Blends",
    passages: [
      "The frog can hop.",
      "A crab can snap.",
      "The slug slid on a log.",
    ],
  },
  {
    pattern: "blend-final",
    lessonTitle: "Ending Blends",
    passages: [
      "The sand felt damp.",
      "A frog can jump.",
      "The pink tent had a rip.",
    ],
  },
];

/**
 * One decode skill per phonics pattern so each lesson tracks, recommends, and
 * schedules independently — a single shared tag would mark the whole unit
 * solid at once and stall the CVC → digraph → blend sequence.
 */
function decodableSkillTag(pattern: PhonicsPattern): string {
  return `phonics.decode.${pattern}`;
}

/** Build all readers, or one lesson's readers, in stable authoring order. */
export function decodableReaderActivities(pattern?: PhonicsPattern): Activity[] {
  const groups = pattern
    ? DECODABLE_LIBRARY.filter((group) => group.pattern === pattern)
    : DECODABLE_LIBRARY;

  return groups.flatMap((group) => {
    const skillTag = decodableSkillTag(group.pattern);
    return group.passages.map(
      (passage, index): Activity => ({
        id: `decodable-${group.pattern}-${String(index + 1).padStart(2, "0")}`,
        kind: "oral-reading",
        title: `Sound-it-out sentence ${index + 1}`,
        blurb: "Sound out each word, then read the whole sentence smoothly.",
        estMinutes: 3,
        band: "ready",
        skillTags: [skillTag],
        config: {
          mode: "sentence",
          presentation: "cold",
          instruction: "Read this sentence aloud without hearing it first.",
          passage,
          skillTag,
        },
      }),
    );
  });
}
