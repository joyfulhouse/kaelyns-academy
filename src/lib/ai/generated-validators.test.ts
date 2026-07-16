import { describe, expect, it } from "vitest";
import type {
  ActivityKind,
  MathClockConfig,
  MathMeasureConfig,
  MathMoneyConfig,
  SeqOrderConfig,
  SortCategoriesConfig,
} from "@/content/activity-configs";
import type { SkillTag } from "@/content/types";
import { worldLanguages } from "@/content/programs/world-languages";
import { isGenerableKind } from "./generable";
import { prepareGeneratedItems, validateGeneratedFor } from "./generated-validators";

// B3 §6: the deterministic answer-key net for AI-generated configs. A valid item
// returns null; each corruption mode returns a non-null reason so the generator
// drops it before it can mark a capable child wrong.

describe("validateGeneratedFor — math-money", () => {
  it("passes an identify item whose target is among the coins", () => {
    const c: MathMoneyConfig = {
      mode: "identify",
      instruction: "Tap the dime.",
      coins: ["penny", "dime", "quarter"],
      targetCoin: "dime",
    };
    expect(validateGeneratedFor("math-money", c)).toBeNull();
  });

  it("rejects an identify item whose target is not among the coins", () => {
    const c: MathMoneyConfig = {
      mode: "identify",
      instruction: "Tap the dime.",
      coins: ["penny", "quarter"],
      targetCoin: "dime",
    };
    expect(validateGeneratedFor("math-money", c)).not.toBeNull();
  });

  it("passes a count item whose target is payable from the palette", () => {
    const c: MathMoneyConfig = {
      mode: "count",
      instruction: "Make 6 cents.",
      palette: ["penny", "nickel"],
      targetCents: 6, // 5 + 1
    };
    expect(validateGeneratedFor("math-money", c)).toBeNull();
  });

  it("rejects a count item whose target is unreachable from the palette", () => {
    const c: MathMoneyConfig = {
      mode: "count",
      instruction: "Make 7 cents.",
      palette: ["nickel"], // only multiples of 5
      targetCents: 7,
    };
    expect(validateGeneratedFor("math-money", c)).not.toBeNull();
  });
});

describe("validateGeneratedFor — math-clock", () => {
  it("passes a read item whose marked choice renders the stated time", () => {
    const c: MathClockConfig = {
      mode: "read",
      instruction: "What time is it?",
      hour: 3,
      minute: 0,
      choices: ["3:00", "4:00"],
      answerIndex: 0,
    };
    expect(validateGeneratedFor("math-clock", c)).toBeNull();
  });

  it("rejects a read item whose marked choice is the wrong time", () => {
    const c: MathClockConfig = {
      mode: "read",
      instruction: "What time is it?",
      hour: 3,
      minute: 0,
      choices: ["4:00", "3:00"],
      answerIndex: 0, // points at 4:00, not the true 3:00
    };
    expect(validateGeneratedFor("math-clock", c)).not.toBeNull();
  });

  it("rejects a read item with duplicate choices", () => {
    const c: MathClockConfig = {
      mode: "read",
      instruction: "What time is it?",
      hour: 3,
      minute: 30,
      choices: ["3:30", "3:30"],
      answerIndex: 0,
    };
    expect(validateGeneratedFor("math-clock", c)).not.toBeNull();
  });

  it("passes a set item (no answer key beyond the schema)", () => {
    const c: MathClockConfig = {
      mode: "set",
      instruction: "Make it 6:30.",
      targetHour: 6,
      targetMinute: 30,
    };
    expect(validateGeneratedFor("math-clock", c)).toBeNull();
  });
});

describe("validateGeneratedFor — math-measure", () => {
  it("passes a compare item whose answer is the unique extreme", () => {
    const c: MathMeasureConfig = {
      mode: "compare",
      instruction: "Which is longest?",
      attribute: "length",
      question: "most",
      items: [
        { label: "pencil", emoji: "✏️", size: 10 },
        { label: "snake", emoji: "🐍", size: 50 },
        { label: "worm", emoji: "🪱", size: 20 },
      ],
      answerIndex: 1,
    };
    expect(validateGeneratedFor("math-measure", c)).toBeNull();
  });

  it("rejects a compare item whose extreme is tied (not unique)", () => {
    const c: MathMeasureConfig = {
      mode: "compare",
      instruction: "Which is longest?",
      attribute: "length",
      question: "most",
      items: [
        { label: "a", emoji: "🅰️", size: 50 },
        { label: "b", emoji: "🅱️", size: 50 },
        { label: "c", emoji: "🇨", size: 20 },
      ],
      answerIndex: 0,
    };
    expect(validateGeneratedFor("math-measure", c)).not.toBeNull();
  });

  it("rejects a compare item pointing at a non-extreme answer", () => {
    const c: MathMeasureConfig = {
      mode: "compare",
      instruction: "Which is longest?",
      attribute: "length",
      question: "most",
      items: [
        { label: "pencil", emoji: "✏️", size: 10 },
        { label: "snake", emoji: "🐍", size: 50 },
      ],
      answerIndex: 0, // 10 is not the max
    };
    expect(validateGeneratedFor("math-measure", c)).not.toBeNull();
  });

  it("passes a direct-placement units item whose target comes from one length fact", () => {
    const c: MathMeasureConfig = {
      mode: "units",
      instruction: "Measure the pencil with cubes.",
      objectLabel: "pencil",
      unit: "cube",
      length: 5,
    };
    expect(validateGeneratedFor("math-measure", c)).toBeNull();
  });

  it("rejects legacy multiple-choice fields on a direct-placement units item", () => {
    const c = {
      mode: "units",
      instruction: "How many cubes long?",
      unit: "cube",
      length: 5,
      choices: [3, 4],
      answerIndex: 0,
    };
    expect(validateGeneratedFor("math-measure", c)).not.toBeNull();
  });
});

describe("validateGeneratedFor — sort-categories", () => {
  it("passes a config with unique bins that are all used", () => {
    const c: SortCategoriesConfig = {
      instruction: "Sort them.",
      bins: [
        { id: "land", label: "Land" },
        { id: "water", label: "Water" },
      ],
      items: [
        { label: "fish", binId: "water" },
        { label: "dog", binId: "land" },
        { label: "duck", binId: "water" },
      ],
    };
    expect(validateGeneratedFor("sort-categories", c)).toBeNull();
  });

  it("rejects a config with an empty bin", () => {
    const c: SortCategoriesConfig = {
      instruction: "Sort them.",
      bins: [
        { id: "land", label: "Land" },
        { id: "water", label: "Water" },
      ],
      items: [
        { label: "dog", binId: "land" },
        { label: "cat", binId: "land" },
        { label: "cow", binId: "land" },
      ], // nothing in "water"
    };
    expect(validateGeneratedFor("sort-categories", c)).not.toBeNull();
  });

  it("rejects a config with duplicate bin ids", () => {
    const c: SortCategoriesConfig = {
      instruction: "Sort them.",
      bins: [
        { id: "land", label: "Land" },
        { id: "land", label: "Ground" },
      ],
      items: [
        { label: "dog", binId: "land" },
        { label: "cat", binId: "land" },
        { label: "cow", binId: "land" },
      ],
    };
    expect(validateGeneratedFor("sort-categories", c)).not.toBeNull();
  });
});

describe("validateGeneratedFor — seq-order", () => {
  it("passes a config with unique card labels", () => {
    const c: SeqOrderConfig = {
      instruction: "Put them in order.",
      cards: [{ label: "seed" }, { label: "sprout" }, { label: "flower" }],
    };
    expect(validateGeneratedFor("seq-order", c)).toBeNull();
  });

  it("rejects a config with duplicate card labels (case/space-insensitive)", () => {
    const c: SeqOrderConfig = {
      instruction: "Put them in order.",
      cards: [{ label: "Seed" }, { label: " seed " }, { label: "flower" }],
    };
    expect(validateGeneratedFor("seq-order", c)).not.toBeNull();
  });
});

describe("validateGeneratedFor — shared playability", () => {
  it("rejects malformed configs for kinds the old narrow switch skipped", () => {
    expect(validateGeneratedFor("phonics-wordbuild", { anything: true })).not.toBeNull();
    expect(validateGeneratedFor("math-tenframe", {})).not.toBeNull();
  });

  it("accepts a schema-valid, internally playable config", () => {
    expect(
      validateGeneratedFor("math-tenframe", {
        instruction: "Make a ten.",
        mode: "make-ten",
        target: 7,
        addend: 8,
        frames: 2,
      }),
    ).toBeNull();
  });
});

interface GenerableCase {
  kind: ActivityKind;
  config: unknown;
  skillHints: SkillTag[];
}

const authoredLanguageActivities = worldLanguages.units.flatMap((unit) =>
  unit.lessons.flatMap((lesson) => lesson.activities),
);
const symbolIntro = authoredLanguageActivities.find(
  (activity) => activity.kind === "lang-symbol-intro",
);
const listenMatch = authoredLanguageActivities.find(
  (activity) => activity.kind === "lang-listen-match",
);
if (symbolIntro?.kind !== "lang-symbol-intro" || listenMatch?.kind !== "lang-listen-match") {
  throw new Error("test setup: authored language fixtures missing");
}

const GENERABLE_CASES: GenerableCase[] = [
  {
    kind: "phonics-wordbuild",
    skillHints: ["phonics.decode.short-a-cvc"],
    config: {
      focus: "short a CVC words",
      instruction: "Build the word.",
      skillTag: "phonics.decode.short-e-cvc",
      tiles: ["c", "a", "t"],
      words: [{ word: "cat" }],
    },
  },
  {
    kind: "sightword-game",
    skillHints: [],
    config: {
      instruction: "Listen, then find the word.",
      rounds: [{ target: "the", choices: ["the", "they"] }],
    },
  },
  {
    kind: "math-tenframe",
    skillHints: ["math.add.make-ten"],
    config: { instruction: "Make a ten.", mode: "make-ten", target: 7, addend: 8, frames: 2 },
  },
  {
    kind: "journal-prompt",
    skillHints: [],
    config: { prompt: "Draw or tell one idea." },
  },
  {
    kind: "reading-comprehension",
    skillHints: ["reading.comprehension.main-idea"],
    config: {
      instruction: "Read, then answer.",
      passage: "Cats nap in warm places.",
      questions: [
        {
          prompt: "What is this mostly about?",
          choices: ["Cats resting", "Dogs running"],
          answerIndex: 0,
          kind: "main-idea",
          skillTag: "reading.comprehension.main-idea",
        },
      ],
    },
  },
  {
    kind: "math-array",
    skillHints: ["math.equal-groups.arrays"],
    config: { instruction: "Build two rows of three.", mode: "build", rows: 2, cols: 3 },
  },
  {
    kind: "lang-symbol-intro",
    skillHints: [...symbolIntro.skillTags],
    config: symbolIntro.config,
  },
  {
    kind: "lang-listen-match",
    skillHints: [...listenMatch.skillTags],
    config: listenMatch.config,
  },
  {
    kind: "math-clock",
    skillHints: ["math.time"],
    config: {
      mode: "read",
      instruction: "What time is it?",
      hour: 3,
      minute: 0,
      choices: ["3:00", "4:00"],
      answerIndex: 0,
    },
  },
  {
    kind: "math-money",
    skillHints: ["math.money"],
    config: {
      mode: "identify",
      instruction: "Find the dime.",
      coins: ["penny", "dime"],
      targetCoin: "dime",
    },
  },
  {
    kind: "math-measure",
    skillHints: ["math.measure"],
    config: {
      mode: "units",
      instruction: "Measure with cubes.",
      objectLabel: "pencil",
      unit: "cube",
      length: 4,
    },
  },
];

function generableCase(kind: ActivityKind): GenerableCase {
  const fixture = GENERABLE_CASES.find((candidate) => candidate.kind === kind);
  if (!fixture) throw new Error(`test setup: ${kind} fixture missing`);
  return fixture;
}

function expectNestedUnknownSiblingDropped(fixture: GenerableCase, raw: unknown): void {
  expect(
    prepareGeneratedItems(fixture.kind, [raw, fixture.config], {
      skillHints: fixture.skillHints,
    }),
  ).toHaveLength(1);
}

describe("prepareGeneratedItems — exhaustive generable boundary", () => {
  it("covers every generable kind and keeps ungrounded kinds authored-only", () => {
    const actual = GENERABLE_CASES.map(({ kind }) => kind).sort();
    const expected = Object.keys({
      "phonics-wordbuild": true,
      "sightword-game": true,
      "math-tenframe": true,
      "journal-prompt": true,
      "reading-comprehension": true,
      "math-array": true,
      "lang-symbol-intro": true,
      "lang-listen-match": true,
      "math-clock": true,
      "math-money": true,
      "math-measure": true,
    }).sort();
    expect(actual).toEqual(expected);
    for (const { kind } of GENERABLE_CASES) expect(isGenerableKind(kind), kind).toBe(true);
    expect(isGenerableKind("math-fraction-bar")).toBe(false);
    expect(isGenerableKind("oral-reading")).toBe(false);
    expect(isGenerableKind("sort-categories")).toBe(false);
    expect(isGenerableKind("seq-order")).toBe(false);
  });

  it.each(GENERABLE_CASES)(
    "$kind parses siblings independently and returns only shared-playable output",
    ({ kind, config, skillHints }) => {
      const rawWithExtraField = { ...(config as Record<string, unknown>), rawModelField: true };
      const result = prepareGeneratedItems(kind, [rawWithExtraField, config], { skillHints });
      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty("rawModelField");
      expect(validateGeneratedFor(kind, result[0])).toBeNull();
    },
  );

  it("rejects unknown fields recursively inside every nested generated shape", () => {
    const phonics = generableCase("phonics-wordbuild");
    const phonicsConfig = phonics.config as { words: Record<string, unknown>[] };
    expectNestedUnknownSiblingDropped(phonics, {
      ...phonicsConfig,
      words: [{ ...phonicsConfig.words[0], rawModelField: true }],
    });

    const sight = generableCase("sightword-game");
    const sightConfig = sight.config as { rounds: Record<string, unknown>[] };
    expectNestedUnknownSiblingDropped(sight, {
      ...sightConfig,
      rounds: [{ ...sightConfig.rounds[0], rawModelField: true }],
    });

    const reading = generableCase("reading-comprehension");
    const readingConfig = reading.config as { questions: Record<string, unknown>[] };
    expectNestedUnknownSiblingDropped(reading, {
      ...readingConfig,
      questions: [{ ...readingConfig.questions[0], rawModelField: true }],
    });

    const intro = generableCase("lang-symbol-intro");
    const introConfig = intro.config as {
      symbols: Record<string, unknown>[];
      verify: Record<string, unknown>[];
    };
    expectNestedUnknownSiblingDropped(intro, {
      ...introConfig,
      symbols: [{ ...introConfig.symbols[0], rawModelField: true }, ...introConfig.symbols.slice(1)],
      verify: [{ ...introConfig.verify[0], rawModelField: true }],
    });

    const listen = generableCase("lang-listen-match");
    const listenConfig = listen.config as { items: Record<string, unknown>[] };
    expectNestedUnknownSiblingDropped(listen, {
      ...listenConfig,
      items: [{ ...listenConfig.items[0], rawModelField: true }],
    });

    const measure = generableCase("math-measure");
    expectNestedUnknownSiblingDropped(measure, {
      mode: "compare",
      instruction: "Which is longest?",
      attribute: "length",
      question: "most",
      items: [
        { label: "pencil", emoji: "✏️", size: 8, rawModelField: true },
        { label: "crayon", emoji: "🖍️", size: 5 },
      ],
      answerIndex: 0,
    });

  });

  it("isolates a canonicalizer failure to its malformed sibling", () => {
    const sight = generableCase("sightword-game");
    let calls = 0;
    const result = prepareGeneratedItems(
      sight.kind,
      [sight.config, sight.config],
      {
        skillHints: sight.skillHints,
        canonicalize: (parsed) => {
          calls += 1;
          if (calls === 1) throw new Error("malformed sibling");
          return parsed;
        },
      },
    );
    expect(result).toHaveLength(1);
  });

  it("rejects known but out-of-scope runtime skills", () => {
    const array = GENERABLE_CASES.find(({ kind }) => kind === "math-array");
    if (!array) throw new Error("test setup: array fixture missing");
    expect(() =>
      prepareGeneratedItems(array.kind, [array.config], { skillHints: ["math.time"] }),
    ).toThrow(/failed shared validation/);
  });

  it("pins phonics evidence to a current server hint and strips it without one", () => {
    const phonics = generableCase("phonics-wordbuild");
    const [targeted] = prepareGeneratedItems(phonics.kind, [phonics.config], {
      skillHints: phonics.skillHints,
    });
    expect(targeted).toHaveProperty("skillTag", "phonics.decode.short-a-cvc");

    const [neutral] = prepareGeneratedItems(phonics.kind, [phonics.config], { skillHints: [] });
    expect(neutral).not.toHaveProperty("skillTag");
  });

  it("rejects unknown model-routed comprehension evidence", () => {
    const invalid = {
      instruction: "Read, then answer.",
      passage: "Cats nap.",
      questions: [
        {
          prompt: "What happened?",
          choices: ["Cats nap", "Cats run"],
          answerIndex: 0,
          kind: "main-idea",
          skillTag: "made.up.skill",
        },
      ],
    };
    expect(() =>
      prepareGeneratedItems("reading-comprehension", [invalid], {
        skillHints: ["reading.comprehension.main-idea"],
      }),
    ).toThrow(/failed shared validation/);
  });

  it("rejects targeted items that emit no observable evidence", () => {
    const phonics = GENERABLE_CASES.find(({ kind }) => kind === "phonics-wordbuild");
    if (!phonics) throw new Error("test setup: phonics fixture missing");
    expect(() =>
      prepareGeneratedItems(phonics.kind, [phonics.config], {
        skillHints: ["word.syllables.division"],
      }),
    ).toThrow(/failed shared validation/);
  });
});
