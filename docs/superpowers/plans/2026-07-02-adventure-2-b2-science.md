# Adventure 2.0 B2 — Science & Nature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a "Science & Nature" world — two new tap-to-place activity plugins (`sort-categories`, `seq-order`, authored-only) + a 3-lesson content unit in `kaelyn-adaptive` — so the pilot learner practices sorting/classifying and sequencing (life cycles).

**Architecture:** Each plugin is a self-contained `src/activities/<kind>/` module (server-safe `logic.ts` with pure `isCorrect`/`score`/`skillsAffected` via `_shared/scoring.ts`; client `Player.tsx`; tests), following the B1 (Life Skills Math) pattern exactly. Interaction is **tap-to-place** (tap an item then a bin; tap cards in order) — no drag library. Content is authored static TS in `src/content/programs/kaelyn-adaptive.ts`, seeded by the existing `scripts/seed-content.ts`. The adaptive/reward systems consume skill tags + units generically and need no changes.

**Tech Stack:** Next.js 16 App Router, TypeScript (strict), Zod, Vitest, Tailwind v4 static class maps, Phosphor icons, `motion/react`.

**Spec:** `docs/superpowers/specs/2026-07-02-adventure-2-b2-science-design.md` (approved). Read §3 (plugins), §4 (content), §5 (skills), §7 (deploy/seed), §9 (non-goals).

## Global Constraints

- Package manager is **bun** — never npm/yarn/pnpm. Full gate before merge: `bun run lint && bun run typecheck && bun run test && bun run build` + `bun run audit:dead-code`.
- **Build-safety:** never call `getDb()`/`getAuth()` at module top level.
- **`logic.ts` is server-safe** — NO `"use client"`, no React imports; only `Player.tsx` is a client component.
- **Never disable a linter rule** (`eslint-disable`, `@ts-ignore`) — fix the root cause. Beware the React Compiler `react-hooks/set-state-in-effect` rule (setState only in event handlers / `.then`, not directly in effects).
- **Forgiving scoring (PRODUCT.md §2):** every activity finishes with ≥1 star; a wrong tap re-prompts (`useWrongShake` + increment attempts), NEVER auto-completes; no fabricated "skip" that completes. Stars/outcome ONLY from the shared helpers (`firstTryRateFromAttempts` → `starsFromAccuracy`/`outcomeFromAccuracy`/`evenSkillEvidence`), single permitted `stars: 1` floor.
- Icons: **Phosphor only** (`@phosphor-icons/react/dist/ssr`). Styling: **static Tailwind class maps only** (no dynamic class construction). Big tap targets (`min-h-11`, ≥44px), real `aria-label`s.
- **Authored-only:** do NOT add these kinds to `KIND_BRIEF` (it is `Partial<Record<ActivityKind, string>>` — leaving the kinds absent keeps them non-generable via `isGenerableKind`). Do NOT add generation briefs.
- **Tap-to-place** (spec decision) — not drag. `seq-order` presents cards shuffled via the existing deterministic `src/activities/_shared/shuffle.ts` (seeded, no `Math.random()`).
- **No DB migration** — new domain/kinds/content are data (text columns).
- **Ships as ONE PR** (`feature/adventure-2-b2-science`), one commit per task, through the merge-ready gate.
- **Every exhaustive-`Record<ActivityKind>` site must get an entry for each new kind IN THE SAME TASK that adds the kind to `ACTIVITY_CONFIG_SCHEMAS`** — else the full suite goes RED (the B1 lesson: a missed `defaultConfigFor` entry was caught late). The sites are: `src/components/learner/activityMeta.ts` (`ACTIVITY_META` icon+label), `src/app/(parent)/data.ts` (`ACTIVITY_KIND_LABEL`), `src/lib/admin/editor-model.ts` (`defaultConfigFor` skeleton), and the registry (`src/content/registry.ts` via `src/activities/index.ts`). `src/activities/index.test.ts` asserts every kind is registered — so each plugin task must ADD its kind to schemas AND register it AND fill those maps in one commit, keeping the suite green.

## File Structure

- `src/activities/sort-categories/{logic.ts,logic.test.ts,Player.tsx,index.ts}` — CREATE (Task 1)
- `src/activities/seq-order/{logic.ts,logic.test.ts,Player.tsx,index.ts}` — CREATE (Task 2)
- `src/content/activity-configs.ts` — MODIFY: 2 schemas + `*Config` types + `ACTIVITY_CONFIG_SCHEMAS` entries (Tasks 1–2)
- `src/content/types.ts` — MODIFY: 2 `Activity` union members (Tasks 1–2); `"science"` in `SkillDomain` (Task 3)
- `src/components/learner/activityMeta.ts`, `src/app/(parent)/data.ts`, `src/lib/admin/editor-model.ts`, `src/activities/index.ts` — MODIFY: per-kind entries (Tasks 1–2)
- `src/content/skills.ts` — MODIFY: 2 `Skill` entries (Task 3)
- `src/app/(parent)/parent/learners/[id]/page.tsx` — MODIFY: `DOMAIN_ORDER` `science` entry (Task 3)
- `src/content/programs/kaelyn-adaptive.ts` — MODIFY: the Science & Nature unit (Task 4)
- `e2e/specs/science.spec.ts` — CREATE (Task 5)

---

### Task 1: `sort-categories` plugin (complete, wired)

**Files:**
- Modify: `src/content/activity-configs.ts` (schema + type + `ACTIVITY_CONFIG_SCHEMAS` entry), `src/content/types.ts` (`Activity` union member), `src/components/learner/activityMeta.ts`, `src/app/(parent)/data.ts`, `src/lib/admin/editor-model.ts`, `src/activities/index.ts`
- Create: `src/activities/sort-categories/{logic.ts,logic.test.ts,Player.tsx,index.ts}`
- Test: the above `logic.test.ts`; the existing `src/activities/index.test.ts` + `src/lib/admin/editor-model.test.ts` must stay green.

**Interfaces:**
- Produces: kind `"sort-categories"` in `ACTIVITY_CONFIG_SCHEMAS`; `SortCategoriesConfig`; `sortCategories: ActivityType`; `SortCategoriesResponse`; pure `isCorrect`/`score`/`skillsAffected`.

- [ ] **Step 1: Add the config schema** to `src/content/activity-configs.ts` (before `ACTIVITY_CONFIG_SCHEMAS`). This is a plain `z.object`, so a `.refine` for bin-id integrity IS allowed (unlike a discriminated-union member):

```ts
// ── Science & Nature (Adventure 2.0 B2) ──────────────────────────────────────

export const sortCategoriesConfig = z
  .object({
    instruction: z.string(),
    bins: z
      .array(
        z.object({
          id: z.string().min(1).max(24),
          label: z.string().min(1).max(24),
          emoji: z.string().min(1).max(8).optional(),
        }),
      )
      .min(2)
      .max(4),
    items: z
      .array(
        z.object({
          label: z.string().min(1).max(24),
          emoji: z.string().min(1).max(8).optional(),
          /** Must equal one of `bins[].id`. */
          binId: z.string().min(1).max(24),
        }),
      )
      .min(3)
      .max(8),
  })
  .refine((cfg) => cfg.items.every((it) => cfg.bins.some((b) => b.id === it.binId)), {
    message: "every item.binId must match a bins[].id",
    path: ["items"],
  });
export type SortCategoriesConfig = z.input<typeof sortCategoriesConfig>;
```

Then add to `ACTIVITY_CONFIG_SCHEMAS` (after the last existing entry): `"sort-categories": sortCategoriesConfig,`

- [ ] **Step 2: Add the `Activity` union member** in `src/content/types.ts`: import `SortCategoriesConfig` in the existing `from "./activity-configs"` block, and add `| ActivityOf<"sort-categories", SortCategoriesConfig>` to the `Activity` union.

- [ ] **Step 3: Write the failing logic test** — `src/activities/sort-categories/logic.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isCorrect, score, skillsAffected } from "./logic";
import type { SortCategoriesConfig } from "@/content/activity-configs";

const cfg: SortCategoriesConfig = {
  instruction: "Sort the animals.",
  bins: [
    { id: "land", label: "Land", emoji: "🌳" },
    { id: "water", label: "Water", emoji: "🌊" },
  ],
  items: [
    { label: "Frog", emoji: "🐸", binId: "water" },
    { label: "Dog", emoji: "🐶", binId: "land" },
    { label: "Fish", emoji: "🐟", binId: "water" },
  ],
};

describe("isCorrect", () => {
  it("is true when every item's placement matches its binId", () => {
    expect(isCorrect(cfg, { attempts: 1, placements: ["water", "land", "water"] })).toBe(true);
  });
  it("is false on a misplaced item or an incomplete placement", () => {
    expect(isCorrect(cfg, { attempts: 1, placements: ["land", "land", "water"] })).toBe(false);
    expect(isCorrect(cfg, { attempts: 1, placements: ["water", "land"] })).toBe(false);
  });
});

describe("score", () => {
  it("first-try correct → 3 stars solid on science.classify", () => {
    expect(score(cfg, { attempts: 1, placements: ["water", "land", "water"] })).toEqual({
      correct: 1, total: 1, stars: 3,
      skillEvidence: [{ skill: "science.classify", outcome: "solid" }],
    });
  });
  it("finished after retries still earns a star (never 0)", () => {
    const s = score(cfg, { attempts: 3, placements: ["water", "land", "water"] });
    expect(s.correct).toBe(1); expect(s.stars).toBe(1);
    expect(s.skillEvidence[0].outcome).toBe("not_yet");
  });
});

describe("skillsAffected", () => {
  it("is always science.classify", () => {
    expect(skillsAffected(cfg)).toEqual(["science.classify"]);
  });
});
```

- [ ] **Step 4: Run** — `bun run test src/activities/sort-categories/logic.test.ts` → FAIL (module not found). Then create `src/activities/sort-categories/logic.ts`:

```ts
import { sortCategoriesConfig, type SortCategoriesConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import {
  evenSkillEvidence,
  firstTryRateFromAttempts,
  outcomeFromAccuracy,
  starsFromAccuracy,
} from "../_shared/scoring";

export const schema = sortCategoriesConfig;

/** The child's final placement (one binId per item, by item index) + attempts. */
export interface SortCategoriesResponse {
  attempts: number;
  placements: string[];
}

export function isCorrect(config: SortCategoriesConfig, response: SortCategoriesResponse): boolean {
  if (response.placements.length !== config.items.length) return false;
  return config.items.every((item, i) => response.placements[i] === item.binId);
}

export function score(config: SortCategoriesConfig, response: SortCategoriesResponse): ActivityScore {
  const correct = isCorrect(config, response);
  const rate = firstTryRateFromAttempts(correct, response.attempts);
  return {
    correct: correct ? 1 : 0,
    total: 1,
    stars: correct ? starsFromAccuracy(rate) : 1,
    skillEvidence: evenSkillEvidence(skillsAffected(config), outcomeFromAccuracy(rate)),
  };
}

export function skillsAffected(_config: SortCategoriesConfig): SkillTag[] {
  return ["science.classify"];
}
```

- [ ] **Step 5: Run** — PASS.

- [ ] **Step 6: Create `Player.tsx`** — mirror `src/activities/math-money/Player.tsx` (read it first) for structure/chrome: `"use client"`, `useActivity(schema, config)`, `useSpeech`, `useReducedMotion`, `useWrongShake`, `PlayerControls / Prompt / ProgressHint / SpeakerButton` from `../_shared/ActivityChrome`, `RewardOverlay`, `Button`, `cn`, `useSpeakOnce`. Interaction (**tap-to-place, forgiving**):
  - Render the `items` not-yet-placed as a row of big tappable tiles (emoji + label), and the `bins` as labeled drop zones below.
  - The child taps an item to **select** it (highlight), then taps a bin. If the bin id === the selected item's `binId`, the item moves into that bin (record its placement) and clears the selection. If wrong, `useWrongShake` on the bin + increment `attempts`, item stays selected (re-prompt, never fails).
  - Track `placements: string[]` (binId per placed item, in item-index order — keep a per-item slot so `placements[i]` maps to `items[i]`). When ALL items are placed, `onComplete({ attempts, placements }, score(parsed, { attempts, placements }))`.
  - Instruction narrated on mount (`useSpeakOnce`); a `ProgressHint` showing "N of M sorted".
  - Static class maps only; `min-h-11` tiles/bins; `aria-label`s ("Frog", "put in Water bin").

- [ ] **Step 7: Create `index.ts`:**

```ts
import type { SortCategoriesConfig } from "@/content/activity-configs";
import type { ActivityType } from "@/content/types";
import { SortCategoriesPlayer } from "./Player";
import { schema, score, skillsAffected, type SortCategoriesResponse } from "./logic";

/** sort-categories activity-type plugin: tap items into labeled bins. */
export const sortCategories: ActivityType<SortCategoriesConfig, SortCategoriesResponse> = {
  kind: "sort-categories",
  label: "Sort",
  schema,
  Player: SortCategoriesPlayer,
  score,
  skillsAffected,
};
export type { SortCategoriesResponse };
```

- [ ] **Step 8: Fill EVERY exhaustive-`ActivityKind` site** (each is `Record<ActivityKind, …>` and typecheck-fails without the new key). Read each file's existing entries and match their exact shape:
  - `src/activities/index.ts`: add `import { sortCategories } from "./sort-categories";` and `registerActivityType(sortCategories);`.
  - `src/components/learner/activityMeta.ts` `ACTIVITY_META`: add `"sort-categories": { icon: <a real Phosphor icon, e.g. StackIcon or CardsIcon>, label: "Sort" }` (match the map's exact value shape; import the icon from `@phosphor-icons/react/dist/ssr`).
  - `src/app/(parent)/data.ts` `ACTIVITY_KIND_LABEL`: add `"sort-categories": "Sort"` (match its value shape).
  - `src/lib/admin/editor-model.ts` `defaultConfigFor`: add a branch returning a valid skeleton: `{ instruction: "Sort the items.", bins: [{ id: "a", label: "Group A" }, { id: "b", label: "Group B" }], items: [{ label: "Item 1", binId: "a" }, { label: "Item 2", binId: "b" }, { label: "Item 3", binId: "a" }] }` (must satisfy the schema incl. the binId refine).

- [ ] **Step 9: Verify the FULL suite** — `bun run test && bun run lint && bun run typecheck && bun run build` → ALL green (incl. `index.test.ts` "every kind registered" — sort-categories is now registered — and `editor-model.test.ts` — its skeleton parses).

- [ ] **Step 10: Commit**

```bash
git add src/activities/sort-categories/ src/content/activity-configs.ts src/content/types.ts src/activities/index.ts src/components/learner/activityMeta.ts "src/app/(parent)/data.ts" src/lib/admin/editor-model.ts
git commit -m "feat(activities): sort-categories plugin (tap items into bins) + full kind wiring"
```

---

### Task 2: `seq-order` plugin (complete, wired)

**Files:**
- Modify: `src/content/activity-configs.ts`, `src/content/types.ts`, `src/components/learner/activityMeta.ts`, `src/app/(parent)/data.ts`, `src/lib/admin/editor-model.ts`, `src/activities/index.ts`
- Create: `src/activities/seq-order/{logic.ts,logic.test.ts,Player.tsx,index.ts}`

**Interfaces:**
- Consumes: `src/activities/_shared/shuffle.ts` `shuffle<T>(items: T[], seed: number): T[]` (deterministic — reuse it).
- Produces: kind `"seq-order"`; `SeqOrderConfig`; `seqOrder: ActivityType`; `SeqOrderResponse`.

- [ ] **Step 1: Add the schema** to `src/content/activity-configs.ts`:

```ts
export const seqOrderConfig = z.object({
  instruction: z.string(),
  /** ARRAY ORDER is the correct order (1st … last). 3–6 cards. */
  cards: z
    .array(
      z.object({
        label: z.string().min(1).max(24),
        emoji: z.string().min(1).max(8).optional(),
      }),
    )
    .min(3)
    .max(6),
});
export type SeqOrderConfig = z.input<typeof seqOrderConfig>;
```

Add to `ACTIVITY_CONFIG_SCHEMAS`: `"seq-order": seqOrderConfig,`

- [ ] **Step 2: Add the `Activity` union member** in `src/content/types.ts`: import `SeqOrderConfig`, add `| ActivityOf<"seq-order", SeqOrderConfig>`.

- [ ] **Step 3: Write the failing logic test** — `src/activities/seq-order/logic.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isCorrect, score, skillsAffected } from "./logic";
import type { SeqOrderConfig } from "@/content/activity-configs";

const cfg: SeqOrderConfig = {
  instruction: "Put the life cycle in order.",
  cards: [
    { label: "Egg", emoji: "🥚" },
    { label: "Caterpillar", emoji: "🐛" },
    { label: "Chrysalis", emoji: "🛡️" },
    { label: "Butterfly", emoji: "🦋" },
  ],
};

describe("isCorrect", () => {
  it("is true when the tapped order equals the array (config) order", () => {
    expect(isCorrect(cfg, { attempts: 1, order: [0, 1, 2, 3] })).toBe(true);
  });
  it("is false on a wrong order or an incomplete sequence", () => {
    expect(isCorrect(cfg, { attempts: 1, order: [0, 2, 1, 3] })).toBe(false);
    expect(isCorrect(cfg, { attempts: 1, order: [0, 1, 2] })).toBe(false);
  });
});

describe("score", () => {
  it("first-try correct → 3 stars solid on science.sequence", () => {
    expect(score(cfg, { attempts: 1, order: [0, 1, 2, 3] })).toEqual({
      correct: 1, total: 1, stars: 3,
      skillEvidence: [{ skill: "science.sequence", outcome: "solid" }],
    });
  });
  it("second attempt → 2 stars emerging", () => {
    const s = score(cfg, { attempts: 2, order: [0, 1, 2, 3] });
    expect(s.stars).toBe(2); expect(s.skillEvidence[0].outcome).toBe("emerging");
  });
});

describe("skillsAffected", () => {
  it("is always science.sequence", () => {
    expect(skillsAffected(cfg)).toEqual(["science.sequence"]);
  });
});
```

- [ ] **Step 4: Run** → FAIL. Then create `src/activities/seq-order/logic.ts`:

```ts
import { seqOrderConfig, type SeqOrderConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import {
  evenSkillEvidence,
  firstTryRateFromAttempts,
  outcomeFromAccuracy,
  starsFromAccuracy,
} from "../_shared/scoring";

export const schema = seqOrderConfig;

/** The card indices in the order the child tapped them + attempts. */
export interface SeqOrderResponse {
  attempts: number;
  order: number[];
}

/** Correct when the child tapped the cards in their config (array) order:
 *  the pos-th tap must be card index pos, for all positions. */
export function isCorrect(config: SeqOrderConfig, response: SeqOrderResponse): boolean {
  if (response.order.length !== config.cards.length) return false;
  return response.order.every((cardIndex, position) => cardIndex === position);
}

export function score(config: SeqOrderConfig, response: SeqOrderResponse): ActivityScore {
  const correct = isCorrect(config, response);
  const rate = firstTryRateFromAttempts(correct, response.attempts);
  return {
    correct: correct ? 1 : 0,
    total: 1,
    stars: correct ? starsFromAccuracy(rate) : 1,
    skillEvidence: evenSkillEvidence(skillsAffected(config), outcomeFromAccuracy(rate)),
  };
}

export function skillsAffected(_config: SeqOrderConfig): SkillTag[] {
  return ["science.sequence"];
}
```

- [ ] **Step 5: Run** → PASS.

- [ ] **Step 6: Create `Player.tsx`** — mirror `math-money`/`math-measure` Players. Interaction (**tap-to-order, forgiving, deterministic shuffle**):
  - Present the cards SHUFFLED via `shuffle(parsed.cards, seed)` where `seed` is derived from the content deterministically (e.g. `parsed.cards.map((c) => c.label).join("").length` — same idiom as `sightword-game/Player.tsx`; NEVER `Math.random()`).
  - The child taps cards to build the sequence left→right. Maintain `order: number[]` = the ORIGINAL card indices tapped so far. On each tap of a shuffled card whose original index === `order.length` (the next expected position), append it (lock into the sequence strip). Otherwise `useWrongShake` on that card + increment `attempts` (re-prompt, never fails).
  - When `order.length === cards.length`, `onComplete({ attempts, order }, score(parsed, { attempts, order }))`.
  - Show the built sequence (1st, 2nd, …) with position numbers; a `ProgressHint` "N of M in order"; instruction narrated on mount. Static classes; `min-h-11` cards; `aria-label`s ("Egg, tap to place next").

- [ ] **Step 7: Create `index.ts`** (mirror sort-categories', kind `"seq-order"`, label `"Order"`, exporting `seqOrder` + `SeqOrderResponse`).

- [ ] **Step 8: Fill EVERY exhaustive-`ActivityKind` site** for `"seq-order"` (same four as Task 1): register in `src/activities/index.ts`; `ACTIVITY_META` (a real Phosphor icon, e.g. `SortAscendingIcon` or `ListNumbersIcon`, label `"Order"`); `ACTIVITY_KIND_LABEL` `"Order"`; `defaultConfigFor` skeleton `{ instruction: "Put them in order.", cards: [{ label: "First" }, { label: "Second" }, { label: "Third" }] }`.

- [ ] **Step 9: Verify the FULL suite** — `bun run test && bun run lint && bun run typecheck && bun run build` → ALL green (both new kinds registered; index.test + editor-model.test pass).

- [ ] **Step 10: Commit**

```bash
git add src/activities/seq-order/ src/content/activity-configs.ts src/content/types.ts src/activities/index.ts src/components/learner/activityMeta.ts "src/app/(parent)/data.ts" src/lib/admin/editor-model.ts
git commit -m "feat(activities): seq-order plugin (tap cards into order, deterministic shuffle) + wiring"
```

---

### Task 3: `science` skill domain + classify/sequence skill tags

**Files:**
- Modify: `src/content/types.ts` (`SkillDomain`), `src/content/skills.ts` (2 `Skill` entries), `src/app/(parent)/parent/learners/[id]/page.tsx` (`DOMAIN_ORDER`)
- Test: extend `src/content/skills.test.ts`

**Interfaces:**
- Produces: skill tags `"science.classify"`, `"science.sequence"` in `SKILLS`; `"science"` in `SkillDomain` + `DOMAIN_ORDER`.

- [ ] **Step 1: Add `"science"` to `SkillDomain`** in `src/content/types.ts` (after `"lifeskills"`, before the language domains):

```ts
  | "lifeskills" // Life Skills Math (B1): time · money · measurement
  | "science" // Science & Nature (B2): classify · sequence
```

- [ ] **Step 2: Add the `DOMAIN_ORDER` entry** in `src/app/(parent)/parent/learners/[id]/page.tsx` — the compile-time exhaustiveness guard (added in B1) will otherwise fail typecheck. Add `{ key: "science", label: "Science & Nature" }` in the same relative position (after the `lifeskills` entry). Keep the array's `as const` / `satisfies` shape intact.

- [ ] **Step 3: Write the failing skills test** — extend `src/content/skills.test.ts`:

```ts
describe("Science & Nature skills", () => {
  it("registers classify + sequence under the science domain", () => {
    for (const slug of ["science.classify", "science.sequence"]) {
      const skill = SKILLS.find((s) => s.slug === slug);
      expect(skill, slug).toBeDefined();
      expect(skill!.domain).toBe("science");
      expect(skill!.readyIndicator.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 4: Run** → FAIL. Then add the two `Skill` entries to `SKILLS` in `src/content/skills.ts` (a new "Science & Nature" section after the Life Skills Math section):

```ts
  // ── Science & Nature (B2): classify · sequence ──
  {
    slug: "science.classify",
    domain: "science",
    label: "Sorting & classifying",
    readyIndicator: "Sorts objects into groups by an observable attribute (living/nonliving, land/water, material) and explains the rule",
    stretchIndicator: "Sorts the same set two different ways and names each rule",
  },
  {
    slug: "science.sequence",
    domain: "science",
    label: "Ordering & life cycles",
    readyIndicator: "Puts the stages of a familiar life cycle or a daily/seasonal sequence in the right order",
    stretchIndicator: "Explains what comes before and after a given stage",
  },
```

- [ ] **Step 5: Verify** — `bun run test src/content/skills.test.ts && bun run typecheck && bun run lint` → PASS. (The `DOMAIN_ORDER` guard proves the domain is wired.)

- [ ] **Step 6: Commit**

```bash
git add src/content/types.ts src/content/skills.ts "src/app/(parent)/parent/learners/[id]/page.tsx"
git commit -m "feat(content): science skill domain + classify/sequence skill rubric"
```

---

### Task 4: "Science & Nature" content unit in `kaelyn-adaptive`

**Files:**
- Modify: `src/content/programs/kaelyn-adaptive.ts` (append the unit), `src/content/content.test.ts` (focused assertion)

**Read first:** `src/content/programs/kaelyn-adaptive.ts` (the existing `Unit`/`Lesson`/`Activity` shape — copy the Life Skills Math unit's structure, added in B1), `src/content/activity-configs.ts` (the exact `sortCategoriesConfig`/`seqOrderConfig` shapes), `src/content/validate.ts` (what content validation enforces).

- [ ] **Step 1: Author the unit.** Append a `Unit` to the `kaelynAdaptive` program's `units` array:

```ts
{
  id: "science-nature",
  order: <next order number — after life-skills-math>,
  title: "Science & Nature",
  emoji: "🔬",
  world: "ocean",
  bigIdea: "We can look closely, sort things into groups, and put nature's steps in order.",
  phonicsFocus: "",
  mathFocus: "",
  project: "Make a nature collection: sort five things you find outside into two groups.",
  lessons: [
    { id: "sci-sort", order: 1, title: "Sorting & Classifying", activities: [ /* 3–4 */ ] },
    { id: "sci-cycle", order: 2, title: "Life Cycles & Order", activities: [ /* 3–4 */ ] },
    { id: "sci-nature", order: 3, title: "Nature & Weather", activities: [ /* 3–4 */ ] },
  ],
}
```

Author **3–4 activities per lesson** (10–12 total). Every activity: unique `id` (e.g. `sci-sort-1`), `title`, `skillTags` (a single matching tag: `science.classify` for sort activities, `science.sequence` for order activities; a `reading-comprehension` science-text activity carries its existing `reading.*` tag), `band: "ready"` (a couple `"stretch"`), and a valid `config`. Worked templates (follow these; vary values; keep facts correct + age-appropriate for entering grade 1):

```ts
// sort-categories
{ id: "sci-sort-1", title: "Living or not?", band: "ready", skillTags: ["science.classify"],
  kind: "sort-categories",
  config: { instruction: "Sort each one: is it living or nonliving?",
    bins: [{ id: "living", label: "Living", emoji: "🌱" }, { id: "nonliving", label: "Nonliving", emoji: "🪨" }],
    items: [{ label: "Dog", emoji: "🐶", binId: "living" }, { label: "Rock", emoji: "🪨", binId: "nonliving" },
            { label: "Tree", emoji: "🌳", binId: "living" }, { label: "Cup", emoji: "🥤", binId: "nonliving" }] } },
// seq-order
{ id: "sci-cycle-1", title: "Butterfly life cycle", band: "ready", skillTags: ["science.sequence"],
  kind: "seq-order",
  config: { instruction: "Put the butterfly's life cycle in order.",
    cards: [{ label: "Egg", emoji: "🥚" }, { label: "Caterpillar", emoji: "🐛" },
            { label: "Chrysalis", emoji: "🛡️" }, { label: "Butterfly", emoji: "🦋" }] } },
```

Life-cycle / sequence facts MUST be correct (egg→caterpillar→chrysalis→butterfly; seed→sprout→plant→flower; day→afternoon→night; spring→summer→fall→winter). Sort `binId`s MUST reference a real bin id (the schema's refine also enforces this).

- [ ] **Step 2: Add a focused validation test** — in `src/content/content.test.ts`:

```ts
it("Science & Nature unit uses registered kinds + real skills", () => {
  const unit = kaelynAdaptive.units.find((u) => u.id === "science-nature");
  expect(unit).toBeDefined();
  const acts = unit!.lessons.flatMap((l) => l.activities);
  expect(acts.length).toBeGreaterThanOrEqual(9);
  const skills = new Set(SKILLS.map((s) => s.slug));
  expect(acts.every((a) => a.skillTags.every((t) => skills.has(t)))).toBe(true);
});
```

- [ ] **Step 3: Run the content validation** — `bun run test src/content` → PASS (the `validate` walker proves every config parses against its schema — incl. the sort-categories bin-id refine — and every kind/skill is registered). Then `bun run test && bun run lint && bun run typecheck && bun run build` → FULL suite green.

- [ ] **Step 4: Commit**

```bash
git add src/content/programs/kaelyn-adaptive.ts src/content/content.test.ts
git commit -m "feat(content): Science & Nature unit — sorting, life cycles, nature (10-12 activities)"
```

---

### Task 5: E2E smoke + ship (incl. required prod re-seed)

**Files:**
- Create: `e2e/specs/science.spec.ts`

- [ ] **Step 1: E2E smoke** — following `e2e/specs/life-skills-math.spec.ts` (the B1 smoke — read it and mirror it): assert the "Science & Nature" world tile renders on `/learn/kaelyn-adaptive`, and deep-link one activity of each new kind (e.g. `sci-sort-1`, `sci-cycle-1`) to confirm it loads. Wire it into `playwright.config.ts`'s `public` project `testMatch` if that's how B1's spec was registered (check). Verify discovered via `bunx playwright test --list` (do NOT run against prod).

- [ ] **Step 2: Full local gate** — `bun run lint && bun run typecheck && bun run test && bun run build` + `bun run audit:dead-code` → ALL clean.

- [ ] **Step 3: Commit**

```bash
git add e2e/ playwright.config.ts
git commit -m "test(e2e): Science & Nature world smoke"
```

- [ ] **Step 4: Ship.** Push `feature/adventure-2-b2-science`, open the PR, run the merge-ready gate (`scripts/merge-ready.sh check --pr <n>` — frontend detector applies; the pipeline is simplifier + opus + codex + build + docs + knip + impeccable). After merge + GitOps roll (~15–25 min; the E2E gate runs `science.spec.ts` against its seeded content — no gate change needed since it rides seed-content).

- [ ] **Step 5: REQUIRED prod re-seed (the B1 lesson).** Curriculum is DB-preferred, so the new "Science & Nature" unit will NOT appear on prod until the prod DB is re-seeded. After the roll, run `scripts/seed-content.ts` against prod:
  - `export KUBECONFIG=~/.kube/config-k3s`
  - Build the local DB URL: the `kaelyns-academy-db-app` secret's `uri`, host rewritten to `127.0.0.1:55432`, sslmode dropped.
  - `kubectl -n kaelyns-academy port-forward svc/kaelyns-academy-db-rw 55432:5432 &`
  - `DATABASE_URL=<local url> bun scripts/seed-content.ts` (idempotent `onConflictDoUpdate`; upserts `kaelyn-adaptive@v1` in place — safe; verify it reports the new unit).
  - Verify: query the prod DB for `unit.unitKey = 'science-nature'` (present, 3 lessons) and skills `science.classify`/`science.sequence` (present), and that `sort-categories`/`seq-order` activities exist.

- [ ] **Step 6: Canary** — `/learn/kaelyn-adaptive` 200, the Science & Nature world present; pod logs clean; `/api/health` 200.

---

## Self-Review Notes (already applied)

- **Spec coverage:** §3.1 sort-categories → Task 1; §3.2 seq-order → Task 2 (deterministic shuffle via the existing `_shared/shuffle.ts`); §5 skills+domain → Task 3; §4 content → Task 4; §6 exhaustive-`ActivityKind` wiring → folded into Tasks 1–2 (the B1 lesson: same-commit wiring keeps the suite green, no loosen/restore dance); §7 deploy + **required prod re-seed** → Task 5 Steps 5–6; §8 testing → per-task logic tests + Task 4 validation + Task 5 gate; §9 non-goals honored (tap-to-place not drag; authored-only — kinds absent from `KIND_BRIEF`; no assessment).
- **Type consistency:** `isCorrect(config, response)`, `score`, `skillsAffected`, `SortCategoriesResponse` (`placements: string[]`), `SeqOrderResponse` (`order: number[]`), `firstTryRateFromAttempts` are consistent; the 2 kind strings match across `ACTIVITY_CONFIG_SCHEMAS`, the `Activity` union, `index.ts` `kind`, registry, the 4 exhaustive maps, and content `config`.
- **Ordering:** plugins (Tasks 1–2, each complete + fully wired in one commit) → skills/domain (Task 3) → content (Task 4, needs both kinds + skills) → ship (Task 5, incl. the prod re-seed). Each task ends full-suite green (no RED window, unlike B1).
- **Judgment calls implementers must not "fix":** tap-to-place (not drag); single-interaction configs (no `mode`); `seq-order` array order = correct order, presented via the deterministic seeded shuffle (never `Math.random()`); authored-only (no `KIND_BRIEF` entries); forgiving scoring via shared helpers only; `sort-categories` bin-id integrity enforced by the `.refine` (allowed — plain object, not a discriminated-union member).
