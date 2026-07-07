import { describe, expect, it } from "vitest";
import type {
  MathClockConfig,
  MathMeasureConfig,
  MathMoneyConfig,
  SeqOrderConfig,
  SortCategoriesConfig,
} from "@/content/activity-configs";
import { validateGeneratedFor } from "./generated-validators";

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

  it("passes a units item whose marked choice equals the true length", () => {
    const c: MathMeasureConfig = {
      mode: "units",
      instruction: "How many cubes long?",
      unit: "cube",
      length: 5,
      choices: [5, 3],
      answerIndex: 0,
    };
    expect(validateGeneratedFor("math-measure", c)).toBeNull();
  });

  it("rejects a units item whose marked choice is not the true length", () => {
    const c: MathMeasureConfig = {
      mode: "units",
      instruction: "How many cubes long?",
      unit: "cube",
      length: 5,
      choices: [3, 4],
      answerIndex: 0, // 3 != 5
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

describe("validateGeneratedFor — kinds without a validator", () => {
  it("passes through (null) any kind with no answer-key check", () => {
    // Already-generable kinds (no validateGenerated) must be a no-op passthrough.
    expect(validateGeneratedFor("phonics-wordbuild", { anything: true })).toBeNull();
    expect(validateGeneratedFor("math-tenframe", {})).toBeNull();
  });
});
