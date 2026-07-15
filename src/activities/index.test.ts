import { describe, it, expect } from "vitest";
import {
  registerActivityTypes,
  getActivityType,
  allActivityTypes,
  isActivityKindRegistered,
} from "./index";
import { ACTIVITY_CONFIG_SCHEMAS, type ActivityKind } from "@/content/activity-configs";

const KINDS = Object.keys(ACTIVITY_CONFIG_SCHEMAS) as ActivityKind[];

const VALID_RESPONSES = {
  "phonics-wordbuild": { builds: [{ word: "cat", tries: 1 }] },
  "sightword-game": { found: ["the"], decoyTaps: 0 },
  "math-tenframe": { count: 3, attempts: 1 },
  "journal-prompt": { text: "A cat.", didDraw: false },
  "reading-comprehension": { firstTry: [true], retold: false },
  "math-array": { entered: 6, attempts: 1 },
  "lang-symbol-intro": { verifyAnswers: [0] },
  "lang-listen-match": { answers: [0] },
  "math-clock": { attempts: 1, selectedIndex: 0 },
  "math-money": { attempts: 1, tappedCoin: "penny" },
  "math-measure": { attempts: 1, selectedIndex: 0 },
  "sort-categories": { attempts: 1, placements: ["animals", "plants", "animals"] },
  "seq-order": { attempts: 1, order: [0, 1, 2] },
  "oral-reading": { attempts: 1, results: ["matched"], fallbackUsed: false },
} satisfies Record<ActivityKind, unknown>;

const OVER_BOUNDED_RESPONSES = {
  "phonics-wordbuild": {
    builds: Array.from({ length: 13 }, (_, index) => ({ word: `word-${index}`, tries: 1 })),
  },
  "sightword-game": {
    found: Array.from({ length: 65 }, (_, index) => `word-${index}`),
    decoyTaps: 0,
  },
  "math-tenframe": { count: 3, attempts: 101 },
  "journal-prompt": { text: "x".repeat(2_001), didDraw: false },
  "reading-comprehension": { firstTry: Array.from({ length: 33 }, () => true), retold: false },
  "math-array": { entered: 6, attempts: 101 },
  "lang-symbol-intro": { verifyAnswers: Array.from({ length: 7 }, () => 0) },
  "lang-listen-match": { answers: Array.from({ length: 13 }, () => 0) },
  "math-clock": { attempts: 101, selectedIndex: 0 },
  "math-money": {
    attempts: 1,
    tappedCoins: Array.from({ length: 101 }, () => "penny"),
  },
  "math-measure": { attempts: 1, selectedIndex: 4 },
  "sort-categories": {
    attempts: 1,
    placements: Array.from({ length: 9 }, () => "animals"),
  },
  "seq-order": { attempts: 1, order: Array.from({ length: 7 }, (_, index) => index) },
  "oral-reading": {
    attempts: 3,
    results: ["unclear", "unclear", "matched"],
    fallbackUsed: false,
  },
} satisfies Record<ActivityKind, unknown>;

describe("activity-type registration", () => {
  it("registers a well-formed plugin for every kind in ACTIVITY_CONFIG_SCHEMAS (no orphan kinds)", () => {
    // Every kind in ACTIVITY_CONFIG_SCHEMAS must have a registered plugin — a
    // schema landing without its Player/logic module would silently fall back
    // to the activity host's "coming soon" placeholder for real content, which
    // is not acceptable once a kind is authored into curriculum. This asserts
    // full coverage, plus that each registered plugin is well-formed.
    registerActivityTypes();
    for (const kind of KINDS) {
      expect(isActivityKindRegistered(kind)).toBe(true);
      const type = getActivityType(kind);
      expect(type?.kind).toBe(kind);
      expect(typeof type?.score).toBe("function");
      expect(typeof type?.skillsAffected).toBe("function");
      expect(type?.responseSchema.safeParse(VALID_RESPONSES[kind]).success, kind).toBe(true);
      expect(type?.Player).toBeTypeOf("function");
      expect(type?.label).toBeTruthy();
    }
    expect(allActivityTypes()).toHaveLength(KINDS.length);
  });

  it("is idempotent (re-registering does not duplicate)", () => {
    registerActivityTypes();
    const before = allActivityTypes().length;
    registerActivityTypes();
    expect(allActivityTypes()).toHaveLength(before);
  });

  it("each registered schema parses a minimal valid config", () => {
    registerActivityTypes();
    expect(() =>
      getActivityType("math-tenframe")?.schema.parse({
        instruction: "Show 3.",
        mode: "represent",
        target: 3,
      }),
    ).not.toThrow();
  });

  it("rejects missing, over-bounded, and client-authored scoring response fields", () => {
    registerActivityTypes();
    for (const kind of KINDS) {
      const responseSchema = getActivityType(kind)?.responseSchema;
      expect(responseSchema?.safeParse({}).success, kind).toBe(false);
      expect(responseSchema?.safeParse(OVER_BOUNDED_RESPONSES[kind]).success, kind).toBe(false);
      expect(
        responseSchema?.safeParse({
          ...VALID_RESPONSES[kind],
          stars: 3,
          skillEvidence: [{ skill: "forged.skill", outcome: "solid" }],
        }).success,
        kind,
      ).toBe(false);
    }
  });
});
