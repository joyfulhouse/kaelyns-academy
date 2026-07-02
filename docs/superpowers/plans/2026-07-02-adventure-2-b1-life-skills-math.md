# Adventure 2.0 B1 — Life Skills Math Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a "Life Skills Math" world — three new activity-type plugins (`math-clock`, `math-money`, `math-measure`, two modes each, authored-only) plus a 3-lesson content unit in the `kaelyn-adaptive` program — so the pilot learner learns to tell time, count money, and measure.

**Architecture:** Each plugin is a self-contained module under `src/activities/<kind>/` following the existing contract exactly (config zod schema in `@/content/activity-configs` → server-safe `logic.ts` with pure `score`/`skillsAffected` → `Player.tsx` client interaction → `logic.test.ts`), scored through the forgiving `_shared/scoring.ts` helpers. Content is authored static TS appended to `src/content/programs/kaelyn-adaptive.ts`, seeded by the existing `scripts/seed-content.ts`. The mastery engine, recommender, quest, and reward systems consume skill tags + units generically and need no changes.

**Tech Stack:** Next.js 16 App Router, TypeScript (strict), Zod, Vitest, Tailwind v4 static class maps, Phosphor icons, `motion/react`.

**Spec:** `docs/superpowers/specs/2026-07-02-adventure-2-b1-life-skills-math-design.md` (approved). Read §3 (plugins), §4 (content), §5 (skills), §9 (non-goals) before starting.

## Global Constraints

- Package manager is **bun** — never npm/yarn/pnpm. Full gate before merge: `bun run lint && bun run typecheck && bun run test && bun run build`.
- **Build-safety:** never call `getDb()`/`getAuth()` at module top level.
- **Never disable a linter rule** (`eslint-disable`, `@ts-ignore`) — fix the root cause. Beware the React Compiler `react-hooks/set-state-in-effect` rule (setState only in event handlers / `.then`, not directly in effects).
- **`logic.ts` is server-safe** — NO `"use client"`, no React imports. Only `Player.tsx` is a client component.
- Icons: **Phosphor only** (`@phosphor-icons/react/dist/ssr`), never Lucide. Styling: **static Tailwind class maps only** (no dynamic class construction). Big tap targets (`min-h-11`, ≥44px).
- **Forgiving scoring (PRODUCT.md §2):** every activity finishes with ≥1 star; a wrong answer re-prompts, never fails. Stars/outcome come ONLY from the shared helpers.
- New spoken vocabulary that the default G2P mis-voices gets a `[label](/IPA/)` pronunciation override (Kokoro convention); most words need none.
- **Authored-only:** do NOT add these kinds to `KIND_BRIEF` or the AI practice generator (that's an explicit non-goal — spec §9).
- **No DB migration** — `skill.domain` and `activity.kind` are text columns; new domain/kinds/content are data.
- **Ships as ONE PR** (`feature/adventure-2-b1-life-skills-math`), one commit per task, through the merge-ready gate.
- The content in this slice rides `seed-content.ts`, which the homelab E2E gate already seeds — **no CI-gate change needed** (unlike Phase A's `seed-motivation`).

## File Structure

- `src/content/activity-configs.ts` — MODIFY: add 3 config schemas + `*Config` types + `ACTIVITY_CONFIG_SCHEMAS` entries (this auto-extends `ActivityKind`).
- `src/content/types.ts` — MODIFY: add 3 `ActivityOf<kind, Config>` members to the `Activity` union; add `"lifeskills"` to `SkillDomain`.
- `src/activities/_shared/scoring.ts` — MODIFY: add `firstTryRateFromAttempts` helper (DRY; adopted by the 3 new plugins and refactored into tenframe).
- `src/activities/{math-clock,math-money,math-measure}/` — CREATE each: `index.ts`, `logic.ts`, `logic.test.ts`, `Player.tsx`.
- `src/activities/index.ts` — MODIFY: register the 3 new plugins.
- `src/content/skills.ts` — MODIFY: add 3 `Skill` entries.
- `src/content/programs/kaelyn-adaptive.ts` — MODIFY: append the "Life Skills Math" unit.
- `src/content/domain-labels.ts` (or wherever the parent report maps domain→label — GREP first) — MODIFY: add the `lifeskills` label.
- `e2e/specs/life-skills-math.spec.ts` — CREATE (optional smoke).

---

### Task 1: Config schemas + Activity union for the 3 kinds

**Files:**
- Modify: `src/content/activity-configs.ts` (add before the `ACTIVITY_CONFIG_SCHEMAS` const, then extend that const)
- Modify: `src/content/types.ts` (the `Activity` discriminated union + its `activity-configs` type imports)
- Test: `src/content/activity-configs.test.ts` (create if absent; else extend)

**Interfaces:**
- Produces (imported by Tasks 3–6): kinds `"math-clock" | "math-money" | "math-measure"` in `ACTIVITY_CONFIG_SCHEMAS`; types `MathClockConfig`, `MathMoneyConfig`, `MathMeasureConfig`; the `Coin` type + `COIN_CENTS` map are defined in Task 3 (money logic), NOT here.

- [ ] **Step 1: Write the failing schema tests** — `src/content/activity-configs.test.ts` (add a describe block; import the three schemas):

```ts
import { describe, expect, it } from "vitest";
import {
  mathClockConfig,
  mathMoneyConfig,
  mathMeasureConfig,
} from "./activity-configs";

describe("math-clock config", () => {
  it("accepts a read item to the half-hour", () => {
    expect(mathClockConfig.safeParse({
      mode: "read", instruction: "What time?", hour: 3, minute: 30,
      choices: ["3:00", "3:30", "4:00"], answerIndex: 1,
    }).success).toBe(true);
  });
  it("accepts a set item", () => {
    expect(mathClockConfig.safeParse({
      mode: "set", instruction: "Make 6 o'clock.", targetHour: 6, targetMinute: 0,
    }).success).toBe(true);
  });
  it("rejects a minute that isn't 0 or 30, and an out-of-range hour", () => {
    expect(mathClockConfig.safeParse({ mode: "read", instruction: "x", hour: 3, minute: 15, choices: ["3:00","3:15"], answerIndex: 0 }).success).toBe(false);
    expect(mathClockConfig.safeParse({ mode: "set", instruction: "x", targetHour: 13, targetMinute: 0 }).success).toBe(false);
  });
});

describe("math-money config", () => {
  it("accepts identify + count items", () => {
    expect(mathMoneyConfig.safeParse({ mode: "identify", instruction: "Tap the dime.", coins: ["penny","dime","nickel"], targetCoin: "dime" }).success).toBe(true);
    expect(mathMoneyConfig.safeParse({ mode: "count", instruction: "Make 15 cents.", palette: ["penny","nickel","dime"], targetCents: 15 }).success).toBe(true);
  });
  it("rejects an unknown coin and an over-a-dollar target", () => {
    expect(mathMoneyConfig.safeParse({ mode: "identify", instruction: "x", coins: ["penny","doubloon"], targetCoin: "penny" }).success).toBe(false);
    expect(mathMoneyConfig.safeParse({ mode: "count", instruction: "x", palette: ["penny"], targetCents: 101 }).success).toBe(false);
  });
});

describe("math-measure config", () => {
  it("accepts compare + units items", () => {
    expect(mathMeasureConfig.safeParse({ mode: "compare", instruction: "Which is longest?", attribute: "length", question: "most", items: [{ label: "pencil", emoji: "✏️", size: 3 }, { label: "crayon", emoji: "🖍️", size: 2 }], answerIndex: 0 }).success).toBe(true);
    expect(mathMeasureConfig.safeParse({ mode: "units", instruction: "How many cubes?", unit: "cube", length: 5, choices: [4,5,6], answerIndex: 1 }).success).toBe(true);
  });
  it("rejects an unknown attribute", () => {
    expect(mathMeasureConfig.safeParse({ mode: "compare", instruction: "x", attribute: "temperature", question: "most", items: [{label:"a",emoji:"a",size:1},{label:"b",emoji:"b",size:2}], answerIndex: 0 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `bun run test src/content/activity-configs.test.ts` → FAIL (schemas not exported).

- [ ] **Step 3: Add the schemas** to `src/content/activity-configs.ts` (before the `ACTIVITY_CONFIG_SCHEMAS` const). NOTE: `z.discriminatedUnion` members must be plain `ZodObject`s — do NOT `.refine()` a member (that produces a `ZodEffects` and breaks the union); `answerIndex` bounds are enforced in each plugin's `logic.ts` defensively (authored content is hand-verified + content-validated).

```ts
// ── Life Skills Math (Adventure 2.0 B1) ──────────────────────────────────────

export const mathClockConfig = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("read"),
    instruction: z.string(),
    hour: z.number().int().min(1).max(12),
    minute: z.union([z.literal(0), z.literal(30)]),
    /** Digital-time choices like "3:00" / "3:30". */
    choices: z.array(z.string().min(1).max(8)).min(2).max(4),
    answerIndex: z.number().int().min(0),
  }),
  z.object({
    mode: z.literal("set"),
    instruction: z.string(),
    targetHour: z.number().int().min(1).max(12),
    targetMinute: z.union([z.literal(0), z.literal(30)]),
  }),
]);
export type MathClockConfig = z.input<typeof mathClockConfig>;

const coinEnum = z.enum(["penny", "nickel", "dime", "quarter"]);
export const mathMoneyConfig = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("identify"),
    instruction: z.string(),
    coins: z.array(coinEnum).min(2).max(6),
    targetCoin: coinEnum,
  }),
  z.object({
    mode: z.literal("count"),
    instruction: z.string(),
    /** Coin types the child can tap into the tray. */
    palette: z.array(coinEnum).min(1).max(4),
    targetCents: z.number().int().min(1).max(100),
  }),
]);
export type MathMoneyConfig = z.input<typeof mathMoneyConfig>;

export const mathMeasureConfig = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("compare"),
    instruction: z.string(),
    attribute: z.enum(["length", "height", "weight"]),
    /** "most" → longest/tallest/heaviest; "least" → shortest/…/lightest. */
    question: z.enum(["most", "least"]),
    items: z
      .array(
        z.object({
          label: z.string().min(1).max(24),
          emoji: z.string().min(1).max(8),
          /** Visual proportion only (renders the bar/size); NOT the answer. */
          size: z.number(),
        }),
      )
      .min(2)
      .max(4),
    answerIndex: z.number().int().min(0),
  }),
  z.object({
    mode: z.literal("units"),
    instruction: z.string(),
    unit: z.enum(["cube", "paperclip", "block", "hand"]),
    /** True length in units (the visual renders this many unit icons). */
    length: z.number().int().min(1).max(12),
    choices: z.array(z.number().int().min(0).max(20)).min(2).max(4),
    answerIndex: z.number().int().min(0),
  }),
]);
export type MathMeasureConfig = z.input<typeof mathMeasureConfig>;
```

Then extend the `ACTIVITY_CONFIG_SCHEMAS` object (add the three entries after `"lang-listen-match"`):

```ts
  "math-clock": mathClockConfig,
  "math-money": mathMoneyConfig,
  "math-measure": mathMeasureConfig,
```

- [ ] **Step 4: Add the `Activity` union members** in `src/content/types.ts`. Add the three imports to the existing `import type { … } from "./activity-configs"` block: `MathClockConfig, MathMoneyConfig, MathMeasureConfig`. Then add three members to the `Activity` union (after `lang-listen-match`):

```ts
  | ActivityOf<"math-clock", MathClockConfig>
  | ActivityOf<"math-money", MathMoneyConfig>
  | ActivityOf<"math-measure", MathMeasureConfig>;
```

(Move the `;` to the last member.)

- [ ] **Step 5: Run** — `bun run test src/content/activity-configs.test.ts` → PASS. Then `bun run typecheck` → PASS (the `Activity` union + `ActivityKind` now include the 3 kinds).

- [ ] **Step 6: Commit**

```bash
git add src/content/activity-configs.ts src/content/activity-configs.test.ts src/content/types.ts
git commit -m "feat(content): math-clock/money/measure config schemas + Activity union"
```

---

### Task 2: Skill tags + `lifeskills` domain + parent-report label

**Files:**
- Modify: `src/content/types.ts` (`SkillDomain` union)
- Modify: `src/content/skills.ts` (3 `Skill` entries)
- Modify: the domain→label map (GREP `SkillDomain` and `"habits"` across `src/` to find where the parent report labels domains — likely `src/content/*` or `src/lib/tutor/*` or a parent component; add the `lifeskills` label there)
- Test: extend `src/content/skills.test.ts` if present, else `src/content/validate.test.ts`

**Interfaces:**
- Produces (used by Tasks 3–6): skill tags `"math.time"`, `"math.money"`, `"math.measure"` present in `SKILLS`; `SkillDomain` includes `"lifeskills"`.

- [ ] **Step 1: Add `"lifeskills"` to `SkillDomain`** in `src/content/types.ts` (after `"habits"`, before the language domains):

```ts
  | "habits"
  | "lifeskills" // Life Skills Math (B1): time · money · measurement
```

- [ ] **Step 2: Write the failing skills test** — add to `src/content/skills.test.ts` (create if absent):

```ts
import { describe, expect, it } from "vitest";
import { SKILLS } from "./skills";

describe("Life Skills Math skills", () => {
  it("registers time/money/measure under the lifeskills domain", () => {
    for (const slug of ["math.time", "math.money", "math.measure"]) {
      const skill = SKILLS.find((s) => s.slug === slug);
      expect(skill, slug).toBeDefined();
      expect(skill!.domain).toBe("lifeskills");
      expect(skill!.readyIndicator.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 3: Run** → FAIL (skills absent).

- [ ] **Step 4: Add the three `Skill` entries** to the `SKILLS` array in `src/content/skills.ts` (a new "Life Skills Math" section):

```ts
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
```

- [ ] **Step 5: Add the parent-report label.** GREP for the domain-label map (`grep -rn '"habits"' src/ | grep -i label` and `grep -rn "SkillDomain" src/`). In whichever map renders a friendly domain name, add `lifeskills: "Life Skills Math"`. If the report derives labels from the `Skill.label` rather than a domain map, no change is needed — verify and note which is true in the report.

- [ ] **Step 6: Run** — `bun run test src/content/skills.test.ts && bun run typecheck` → PASS.

- [ ] **Step 7: Commit**

```bash
git add src/content/types.ts src/content/skills.ts
git commit -m "feat(content): lifeskills skill domain + time/money/measure skill rubric"
```

---

### Task 3: `math-money` plugin (logic + Player + register)

(Money first among the three because it defines the shared `Coin`/`COIN_CENTS` used only within its own module, and its counting `logic` is the richest test target.)

**Files:**
- Modify: `src/activities/_shared/scoring.ts` (add `firstTryRateFromAttempts`)
- Modify: `src/activities/math-tenframe/logic.ts` (adopt the new helper — proves it matches)
- Create: `src/activities/math-money/{logic.ts,logic.test.ts,Player.tsx,index.ts}`
- Modify: `src/activities/index.ts` (register)

**Interfaces:**
- Consumes: `MathMoneyConfig` (Task 1); `starsFromAccuracy`, `outcomeFromAccuracy`, `evenSkillEvidence` (`_shared/scoring`).
- Produces: `firstTryRateFromAttempts(correct: boolean, attempts: number): number` in `_shared/scoring.ts` (used by Tasks 4–5); `mathMoney: ActivityType`; `MathMoneyResponse`.

- [ ] **Step 1: Add the shared helper** to `src/activities/_shared/scoring.ts`:

```ts
/**
 * First-try success rate for a single-check activity from the attempt count:
 * finished on the first check → 1 (solid), second → 0.5 (emerging), later → 0.2
 * (finished, not-yet). Not finished → 0. Shared by every single-check plugin so
 * the stars/outcome ladder is identical everywhere.
 */
export function firstTryRateFromAttempts(correct: boolean, attempts: number): number {
  if (!correct) return 0;
  if (attempts <= 1) return 1;
  if (attempts === 2) return 0.5;
  return 0.2;
}
```

- [ ] **Step 2: Refactor tenframe to use it** — in `src/activities/math-tenframe/logic.ts`, replace the inline `firstTryRate` computation with `firstTryRateFromAttempts(reached, response.attempts)` and import the helper. Run `bun run test src/activities/math-tenframe` → still PASS (behavior identical). Commit is folded into this task's final commit.

- [ ] **Step 3: Write the failing money logic test** — `src/activities/math-money/logic.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { COIN_CENTS, coinsTotal, isCorrect, score, skillsAffected } from "./logic";

describe("coinsTotal + COIN_CENTS", () => {
  it("sums a coin multiset", () => {
    expect(coinsTotal(["dime", "nickel", "penny"])).toBe(16);
    expect(coinsTotal([])).toBe(0);
    expect(COIN_CENTS.quarter).toBe(25);
  });
});

describe("isCorrect", () => {
  it("identify matches the target coin", () => {
    const c = { mode: "identify" as const, instruction: "", coins: ["penny","dime"], targetCoin: "dime" as const };
    expect(isCorrect(c, { attempts: 1, tappedCoin: "dime" })).toBe(true);
    expect(isCorrect(c, { attempts: 1, tappedCoin: "penny" })).toBe(false);
  });
  it("count matches the target total", () => {
    const c = { mode: "count" as const, instruction: "", palette: ["nickel","penny"], targetCents: 12 };
    expect(isCorrect(c, { attempts: 1, tappedCoins: ["nickel","nickel","penny","penny"] })).toBe(true);
    expect(isCorrect(c, { attempts: 1, tappedCoins: ["nickel"] })).toBe(false);
  });
});

describe("score", () => {
  const c = { mode: "count" as const, instruction: "", palette: ["penny"], targetCents: 3 };
  it("first-try correct → 3 stars solid on math.money", () => {
    const s = score(c, { attempts: 1, tappedCoins: ["penny","penny","penny"] });
    expect(s).toEqual({ correct: 1, total: 1, stars: 3, skillEvidence: [{ skill: "math.money", outcome: "solid" }] });
  });
  it("finished after retries still earns a star (never 0)", () => {
    const s = score(c, { attempts: 3, tappedCoins: ["penny","penny","penny"] });
    expect(s.correct).toBe(1); expect(s.stars).toBe(1);
    expect(s.skillEvidence[0].outcome).toBe("not_yet");
  });
});

describe("skillsAffected", () => {
  it("is always math.money", () => {
    expect(skillsAffected({ mode: "identify", instruction: "", coins: ["penny","dime"], targetCoin: "dime" })).toEqual(["math.money"]);
  });
});
```

- [ ] **Step 4: Run** → FAIL. Then create `src/activities/math-money/logic.ts`:

```ts
import { mathMoneyConfig, type MathMoneyConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import {
  evenSkillEvidence,
  firstTryRateFromAttempts,
  outcomeFromAccuracy,
  starsFromAccuracy,
} from "../_shared/scoring";

export const schema = mathMoneyConfig;

export type Coin = "penny" | "nickel" | "dime" | "quarter";
export const COIN_CENTS: Record<Coin, number> = { penny: 1, nickel: 5, dime: 10, quarter: 25 };

export function coinsTotal(coins: Coin[]): number {
  return coins.reduce((sum, c) => sum + COIN_CENTS[c], 0);
}

/** The child's final action + how many checks it took (≥1). */
export interface MathMoneyResponse {
  attempts: number;
  /** identify mode: the coin the child tapped. */
  tappedCoin?: Coin;
  /** count mode: the coins the child dropped into the tray. */
  tappedCoins?: Coin[];
}

export function isCorrect(config: MathMoneyConfig, response: MathMoneyResponse): boolean {
  if (config.mode === "identify") return response.tappedCoin === config.targetCoin;
  return coinsTotal(response.tappedCoins ?? []) === config.targetCents;
}

export function score(config: MathMoneyConfig, response: MathMoneyResponse): ActivityScore {
  const correct = isCorrect(config, response);
  const rate = firstTryRateFromAttempts(correct, response.attempts);
  return {
    correct: correct ? 1 : 0,
    total: 1,
    stars: correct ? starsFromAccuracy(rate) : 1,
    skillEvidence: evenSkillEvidence(skillsAffected(config), outcomeFromAccuracy(rate)),
  };
}

export function skillsAffected(_config: MathMoneyConfig): SkillTag[] {
  return ["math.money"];
}
```

- [ ] **Step 5: Run** — `bun run test src/activities/math-money/logic.test.ts` → PASS.

- [ ] **Step 6: Create `Player.tsx`** — mirror `src/activities/math-tenframe/Player.tsx` EXACTLY for structure (read it first): `"use client"`, `useActivity(schema, config)`, `useSpeech`, `useReducedMotion`, `useWrongShake`, the `PlayerControls / Prompt / ProgressHint / SpeakerButton` chrome from `../_shared/ActivityChrome`, `RewardOverlay`, `Button`, `cn`, and `onComplete(response, score(parsed, response))` on a correct check. Interaction:
  - **identify:** render `config.coins` as big tappable coin tiles (emoji/label per coin: penny 🟤 "1¢", nickel ⚪ "5¢", dime "10¢", quarter "25¢" — use a static `COIN_META` map in the Player: `{ penny: { label: "Penny", cents: "1¢" }, … }`). Tapping the wrong coin → `useWrongShake` + increment attempts; tapping `targetCoin` → complete with `{ attempts, tappedCoin }`.
  - **count:** render the `palette` coins as a tap-to-add source and a "tray" showing dropped coins with a running total (`coinsTotal`). A "Check" button (in `PlayerControls`) scores: if total === `targetCents` → complete `{ attempts, tappedCoins }`; else shake + `attempts++` and let the child adjust (allow removing a coin by tapping it in the tray). Never lock; the running total is always visible (no dark pattern).
  - Instruction spoken via `SpeakerButton` / `useSpeakOnce` on mount, as tenframe does.

- [ ] **Step 7: Create `index.ts`:**

```ts
import type { MathMoneyConfig } from "@/content/activity-configs";
import type { ActivityType } from "@/content/types";
import { MathMoneyPlayer } from "./Player";
import { schema, score, skillsAffected, type MathMoneyResponse } from "./logic";

/** math-money activity-type plugin: identify coins / count coins to a total. */
export const mathMoney: ActivityType<MathMoneyConfig, MathMoneyResponse> = {
  kind: "math-money",
  label: "Money",
  schema,
  Player: MathMoneyPlayer,
  score,
  skillsAffected,
};
export type { MathMoneyResponse };
```

- [ ] **Step 8: Register** in `src/activities/index.ts` — add `import { mathMoney } from "./math-money";` and `registerActivityType(mathMoney);` (alongside the others).

- [ ] **Step 9: Verify** — `bun run lint && bun run typecheck && bun run test src/activities/math-money && bun run build` → PASS.

- [ ] **Step 10: Commit**

```bash
git add src/activities/_shared/scoring.ts src/activities/math-tenframe/logic.ts src/activities/math-money/ src/activities/index.ts
git commit -m "feat(activities): math-money plugin (identify + count) + shared firstTryRate helper"
```

---

### Task 4: `math-clock` plugin (logic + Player + register)

**Files:**
- Create: `src/activities/math-clock/{logic.ts,logic.test.ts,Player.tsx,index.ts}`
- Modify: `src/activities/index.ts` (register)

**Interfaces:**
- Consumes: `MathClockConfig` (Task 1); the scoring helpers incl. `firstTryRateFromAttempts` (Task 3).
- Produces: `mathClock: ActivityType`; `MathClockResponse`.

- [ ] **Step 1: Write the failing logic test** — `src/activities/math-clock/logic.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isCorrect, score, skillsAffected } from "./logic";

describe("isCorrect", () => {
  it("read matches the chosen digital time index", () => {
    const c = { mode: "read" as const, instruction: "", hour: 3, minute: 30 as const, choices: ["3:00","3:30"], answerIndex: 1 };
    expect(isCorrect(c, { attempts: 1, selectedIndex: 1 })).toBe(true);
    expect(isCorrect(c, { attempts: 1, selectedIndex: 0 })).toBe(false);
  });
  it("set matches the target hour AND minute", () => {
    const c = { mode: "set" as const, instruction: "", targetHour: 6, targetMinute: 0 as const };
    expect(isCorrect(c, { attempts: 1, setHour: 6, setMinute: 0 })).toBe(true);
    expect(isCorrect(c, { attempts: 1, setHour: 6, setMinute: 30 })).toBe(false);
    expect(isCorrect(c, { attempts: 1, setHour: 5, setMinute: 0 })).toBe(false);
  });
});

describe("score", () => {
  it("first-try read → 3 stars solid on math.time", () => {
    const c = { mode: "read" as const, instruction: "", hour: 3, minute: 0 as const, choices: ["3:00","4:00"], answerIndex: 0 };
    expect(score(c, { attempts: 1, selectedIndex: 0 })).toEqual({
      correct: 1, total: 1, stars: 3, skillEvidence: [{ skill: "math.time", outcome: "solid" }],
    });
  });
});

describe("skillsAffected", () => {
  it("is always math.time", () => {
    expect(skillsAffected({ mode: "set", instruction: "", targetHour: 1, targetMinute: 0 })).toEqual(["math.time"]);
  });
});
```

- [ ] **Step 2: Run** → FAIL. Then create `src/activities/math-clock/logic.ts`:

```ts
import { mathClockConfig, type MathClockConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import {
  evenSkillEvidence,
  firstTryRateFromAttempts,
  outcomeFromAccuracy,
  starsFromAccuracy,
} from "../_shared/scoring";

export const schema = mathClockConfig;

export interface MathClockResponse {
  attempts: number;
  /** read mode: the digital-time choice index the child tapped. */
  selectedIndex?: number;
  /** set mode: the clock the child made. */
  setHour?: number;
  setMinute?: number;
}

export function isCorrect(config: MathClockConfig, response: MathClockResponse): boolean {
  if (config.mode === "read") return response.selectedIndex === config.answerIndex;
  return response.setHour === config.targetHour && response.setMinute === config.targetMinute;
}

export function score(config: MathClockConfig, response: MathClockResponse): ActivityScore {
  const correct = isCorrect(config, response);
  const rate = firstTryRateFromAttempts(correct, response.attempts);
  return {
    correct: correct ? 1 : 0,
    total: 1,
    stars: correct ? starsFromAccuracy(rate) : 1,
    skillEvidence: evenSkillEvidence(skillsAffected(config), outcomeFromAccuracy(rate)),
  };
}

export function skillsAffected(_config: MathClockConfig): SkillTag[] {
  return ["math.time"];
}
```

- [ ] **Step 3: Run** → PASS.

- [ ] **Step 4: Create `Player.tsx`** (mirror tenframe's structure + chrome). Interaction:
  - Render an **analog clock face** (12 hour marks, an hour hand and a minute hand) as inline SVG with static classes (a pure presentational `<ClockFace hour minute />` sub-component in the same file, no external dep). Half-hour → minute hand at 6, hour hand halfway to the next hour.
  - **read:** show the clock at `config.hour:config.minute`; render `config.choices` as big tappable digital-time buttons; correct index → complete `{ attempts, selectedIndex }`; wrong → shake + `attempts++`.
  - **set:** show an interactive clock; the child taps hour-mark buttons (1–12) to set the hour and a toggle for `:00`/`:30` (drag is a fast-follow — tap-to-set is simpler and reliable for a 6-year-old; document this). A "Check" scores against `targetHour/targetMinute`.
  - Instruction narrated on mount.

- [ ] **Step 5: Create `index.ts`** (mirror money's, kind `"math-clock"`, label `"Clock"`, exporting `mathClock` + `MathClockResponse`).

- [ ] **Step 6: Register** `mathClock` in `src/activities/index.ts`.

- [ ] **Step 7: Verify** — `bun run lint && bun run typecheck && bun run test src/activities/math-clock && bun run build` → PASS.

- [ ] **Step 8: Commit**

```bash
git add src/activities/math-clock/ src/activities/index.ts
git commit -m "feat(activities): math-clock plugin (read + set, to the half-hour)"
```

---

### Task 5: `math-measure` plugin (logic + Player + register)

**Files:**
- Create: `src/activities/math-measure/{logic.ts,logic.test.ts,Player.tsx,index.ts}`
- Modify: `src/activities/index.ts` (register)

**Interfaces:**
- Consumes: `MathMeasureConfig` (Task 1); the scoring helpers (Task 3).
- Produces: `mathMeasure: ActivityType`; `MathMeasureResponse`.

- [ ] **Step 1: Write the failing logic test** — `src/activities/math-measure/logic.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isCorrect, score, skillsAffected } from "./logic";

const compareCfg = {
  mode: "compare" as const, instruction: "", attribute: "length" as const, question: "most" as const,
  items: [{ label: "pencil", emoji: "✏️", size: 3 }, { label: "crayon", emoji: "🖍️", size: 2 }], answerIndex: 0,
};
const unitsCfg = { mode: "units" as const, instruction: "", unit: "cube" as const, length: 5, choices: [4,5,6], answerIndex: 1 };

describe("isCorrect", () => {
  it("both modes match the selected choice index", () => {
    expect(isCorrect(compareCfg, { attempts: 1, selectedIndex: 0 })).toBe(true);
    expect(isCorrect(compareCfg, { attempts: 1, selectedIndex: 1 })).toBe(false);
    expect(isCorrect(unitsCfg, { attempts: 1, selectedIndex: 1 })).toBe(true);
  });
});

describe("score", () => {
  it("first-try → 3 stars solid on math.measure", () => {
    expect(score(compareCfg, { attempts: 1, selectedIndex: 0 })).toEqual({
      correct: 1, total: 1, stars: 3, skillEvidence: [{ skill: "math.measure", outcome: "solid" }],
    });
  });
  it("second try → 2 stars emerging", () => {
    const s = score(unitsCfg, { attempts: 2, selectedIndex: 1 });
    expect(s.stars).toBe(2); expect(s.skillEvidence[0].outcome).toBe("emerging");
  });
});

describe("skillsAffected", () => {
  it("is always math.measure", () => {
    expect(skillsAffected(unitsCfg)).toEqual(["math.measure"]);
  });
});
```

- [ ] **Step 2: Run** → FAIL. Then create `src/activities/math-measure/logic.ts`:

```ts
import { mathMeasureConfig, type MathMeasureConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import {
  evenSkillEvidence,
  firstTryRateFromAttempts,
  outcomeFromAccuracy,
  starsFromAccuracy,
} from "../_shared/scoring";

export const schema = mathMeasureConfig;

/** Both modes are tap-a-choice; the child's pick + attempts. */
export interface MathMeasureResponse {
  attempts: number;
  selectedIndex: number;
}

export function isCorrect(config: MathMeasureConfig, response: MathMeasureResponse): boolean {
  return response.selectedIndex === config.answerIndex;
}

export function score(config: MathMeasureConfig, response: MathMeasureResponse): ActivityScore {
  const correct = isCorrect(config, response);
  const rate = firstTryRateFromAttempts(correct, response.attempts);
  return {
    correct: correct ? 1 : 0,
    total: 1,
    stars: correct ? starsFromAccuracy(rate) : 1,
    skillEvidence: evenSkillEvidence(skillsAffected(config), outcomeFromAccuracy(rate)),
  };
}

export function skillsAffected(_config: MathMeasureConfig): SkillTag[] {
  return ["math.measure"];
}
```

- [ ] **Step 3: Run** → PASS.

- [ ] **Step 4: Create `Player.tsx`** (mirror tenframe). Interaction:
  - **compare:** render `config.items` as emoji tiles sized proportionally to `item.size` (map `size` to one of a FEW static height classes — e.g. `h-12/h-16/h-20/h-24` by rank — never inline styles; compute the rank order in the Player and pick from a static class array by index). Prompt reflects `attribute` + `question` ("Which is the **longest**?"). Tapping the tile at `answerIndex` → complete `{ attempts, selectedIndex }`; wrong → shake + `attempts++`.
  - **units:** render a ruler of `config.length` unit icons (cube/paperclip emoji) beside the object, then the `choices` as big number buttons; correct index → complete.
  - Instruction narrated on mount.

- [ ] **Step 5: Create `index.ts`** (mirror, kind `"math-measure"`, label `"Measure"`, exporting `mathMeasure` + `MathMeasureResponse`).

- [ ] **Step 6: Register** `mathMeasure` in `src/activities/index.ts`.

- [ ] **Step 7: Verify** — `bun run lint && bun run typecheck && bun run test src/activities/math-measure && bun run build` → PASS.

- [ ] **Step 8: Commit**

```bash
git add src/activities/math-measure/ src/activities/index.ts
git commit -m "feat(activities): math-measure plugin (compare + units)"
```

---

### Task 6: "Life Skills Math" content unit in `kaelyn-adaptive`

**Files:**
- Modify: `src/content/programs/kaelyn-adaptive.ts` (append the unit)
- Modify/verify: `src/content/validate.ts` test (the existing content-validation test must pass with the new unit)
- Test: `src/content/content.test.ts` (or wherever the program is validated — add a focused assertion)

**Interfaces:**
- Consumes: the three kinds (Tasks 1,3,4,5), the three skill tags (Task 2).
- Produces: a new `Unit` in the `kaelynAdaptive` program named "Life Skills Math".

**Read first:** `src/content/programs/kaelyn-adaptive.ts` (existing `Unit`/`Lesson`/`Activity` authoring shape), `src/content/types.ts` (`Unit`, `Lesson`, `Activity`, `World`), and `src/content/validate.ts` (what it checks: every `activity.kind` registered, every `skillTag` in `SKILLS`, unique activity ids, etc.).

- [ ] **Step 1: Author the unit.** Append a `Unit` to the `kaelynAdaptive` program's `units` array. Shape (fill activities per the templates below):

```ts
{
  id: "life-skills-math",
  order: <next order number>,
  title: "Life Skills Math",
  emoji: "🕐",
  world: "garden",
  bigIdea: "Math is everywhere — in clocks, coins, and how big things are.",
  phonicsFocus: "",
  mathFocus: "Time to the hour & half-hour, coins to a dollar, comparing & measuring",
  project: "Make a play store: price three toys and 'buy' them with coins.",
  lessons: [
    { id: "lsm-time", order: 1, title: "Telling Time", activities: [ /* 3–4 */ ] },
    { id: "lsm-money", order: 2, title: "Money & Coins", activities: [ /* 3–4 */ ] },
    { id: "lsm-measure", order: 3, title: "Measuring", activities: [ /* 3–4 */ ] },
  ],
}
```

Author **3–4 activities per lesson** (10–12 total). Every activity needs a unique `id` (e.g. `lsm-time-read-1`), `title`, `skillTags` (the matching single tag), `band: "ready"` (a couple `"stretch"`), and a valid `config` for its `kind`. Worked templates (one per new kind — follow these shapes, vary the values, keep them decodable/age-appropriate for end-of-K→grade-1):

```ts
// math-clock (read)
{ id: "lsm-time-read-1", title: "What time is it?", band: "ready", skillTags: ["math.time"],
  kind: "math-clock",
  config: { mode: "read", instruction: "What time does the clock say?", hour: 3, minute: 0, choices: ["2:00","3:00","4:00"], answerIndex: 1 } },
// math-clock (set)
{ id: "lsm-time-set-1", title: "Make the time", band: "ready", skillTags: ["math.time"],
  kind: "math-clock",
  config: { mode: "set", instruction: "Make the clock say half past six.", targetHour: 6, targetMinute: 30 } },
// math-money (identify)
{ id: "lsm-money-id-1", title: "Find the coin", band: "ready", skillTags: ["math.money"],
  kind: "math-money",
  config: { mode: "identify", instruction: "Tap the dime.", coins: ["penny","nickel","dime","quarter"], targetCoin: "dime" } },
// math-money (count)
{ id: "lsm-money-count-1", title: "Make 15 cents", band: "ready", skillTags: ["math.money"],
  kind: "math-money",
  config: { mode: "count", instruction: "Drop coins to make 15 cents.", palette: ["penny","nickel","dime"], targetCents: 15 } },
// math-measure (compare)
{ id: "lsm-measure-cmp-1", title: "Which is longest?", band: "ready", skillTags: ["math.measure"],
  kind: "math-measure",
  config: { mode: "compare", instruction: "Which one is the longest?", attribute: "length", question: "most",
    items: [{ label: "pencil", emoji: "✏️", size: 3 }, { label: "crayon", emoji: "🖍️", size: 2 }, { label: "marker", emoji: "🖊️", size: 4 }], answerIndex: 2 } },
// math-measure (units)
{ id: "lsm-measure-units-1", title: "How many cubes?", band: "ready", skillTags: ["math.measure"],
  kind: "math-measure",
  config: { mode: "units", instruction: "How many cubes long is the shoe?", unit: "cube", length: 5, choices: [4,5,6], answerIndex: 1 } },
```

Coin names ("penny","nickel","dime","quarter") voice correctly in the default G2P — no `[label](/IPA/)` override needed; add one only if a review of the spoken instructions surfaces a mis-read.

- [ ] **Step 2: Add a focused validation test** — in the content test file, assert the new unit is well-formed:

```ts
it("Life Skills Math unit uses registered kinds + real skills", () => {
  const unit = kaelynAdaptive.units.find((u) => u.id === "life-skills-math");
  expect(unit).toBeDefined();
  const acts = unit!.lessons.flatMap((l) => l.activities);
  expect(acts.length).toBeGreaterThanOrEqual(9);
  const kinds = new Set(["math-clock","math-money","math-measure"]);
  expect(acts.every((a) => kinds.has(a.kind))).toBe(true);
  const skills = new Set(SKILLS.map((s) => s.slug));
  expect(acts.every((a) => a.skillTags.every((t) => skills.has(t)))).toBe(true);
});
```

- [ ] **Step 3: Run the whole content validation** — `bun run test src/content` → PASS (the existing `validate` walker + the new assertion). This is the real gate: it proves every authored config parses against its schema and every kind/skill is registered.

- [ ] **Step 4: Verify + build** — `bun run lint && bun run typecheck && bun run test && bun run build` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/programs/kaelyn-adaptive.ts src/content/content.test.ts
git commit -m "feat(content): Life Skills Math unit — time, money, measuring (10-12 activities)"
```

---

### Task 7: E2E smoke + ship

**Files:**
- Create (optional): `e2e/specs/life-skills-math.spec.ts`

- [ ] **Step 1: Optional e2e smoke** — following `e2e/specs/` conventions (read a sibling spec; guest-visitable learner routes need no auth), assert the "Life Skills Math" world tile renders on `/learn/kaelyn-adaptive` and that opening it reaches a lesson. Keep it idempotent + resilient (the world is seeded via `seed-content`, which the CI gate already runs — no gate change needed). If the e2e harness makes a guest-mode world assertion awkward, SKIP this step and rely on the content-validation + unit tests (note the decision in the report).

- [ ] **Step 2: Full local gate** — `bun run lint && bun run typecheck && bun run test && bun run build` → ALL PASS. Also `bun run audit:dead-code` → clean (the 3 new plugins are consumed via the registry; no dead exports).

- [ ] **Step 3: Commit** (if step 1 produced a file)

```bash
git add e2e/
git commit -m "test(e2e): Life Skills Math world smoke"
```

- [ ] **Step 4: Ship.** Push `feature/adventure-2-b1-life-skills-math`, open the PR (link the spec + this plan), run the merge-ready gate (`scripts/merge-ready.sh check --pr <n>` — frontend detector applies since `src/app`/components render new Players via the activity host). After merge + GitOps roll (~15 min), the new unit is live automatically (it seeds via `seed-content`; **no separate prod seed step and no CI-gate change** — the Phase A motivation-seed gotcha does not apply here). Canary `/learn/kaelyn-adaptive` shows the new world; open one activity of each new kind.

---

## Self-Review Notes (already applied)

- **Spec coverage:** §3 plugins → Tasks 1,3,4,5; §4 content → Task 6; §5 skills+domain → Task 2; §6 integration (registry/configs/no-migration) → Tasks 1,3–5; §7 deploy (no CI-gate change) → Task 7; §8 testing → per-task `logic.test.ts` + Task 6 validation + Task 7 gate; §9 non-goals honored (authored-only — no `KIND_BRIEF`; no interest theming; no assessment).
- **Type consistency:** `firstTryRateFromAttempts(correct, attempts)`, `isCorrect(config, response)`, `score`, `skillsAffected`, `MathClockResponse`/`MathMoneyResponse`/`MathMeasureResponse`, `Coin`/`COIN_CENTS`/`coinsTotal` are defined once and referenced consistently; the three kinds string-match across `ACTIVITY_CONFIG_SCHEMAS`, the `Activity` union, `index.ts` `kind`, registry, and content `config`.
- **Ordering:** Task 1 (types) → Task 2 (skills) → Task 3 (money, defines the shared helper) → Tasks 4–5 (clock, measure — consume the helper) → Task 6 (content, needs all kinds+skills) → Task 7 (ship). Task 3 precedes 4/5 because it introduces `firstTryRateFromAttempts`.
- **Judgment calls implementers must not "fix":** authored-only (no AI briefs), tap-to-set clock (not drag) for v1, `size` is visual-only (`answerIndex` authoritative), forgiving scoring via shared helpers only, `discriminatedUnion` members carry no `.refine` (bounds enforced in logic).
