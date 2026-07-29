# Keyboard Club — Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the typing foundation — a `typing` skill domain, the `keyboard-club` program (units 1–4), a shared typing toolkit with a keyboard gate, and the first two activity kinds (`typing-keys`, `typing-catch`) — playable end to end.

**Architecture:** Two new activity-kind plugins over a shared `src/activities/_shared/typing/` toolkit. All game rules live in **pure, clock-injected modules** (`state.ts`, `keys.ts`, `wpm.ts`), because the vitest environment is `node` — components are only assertable via `renderToStaticMarkup`, so anything interactive must be testable without a DOM. React components stay thin: they own timers, focus, and painting, nothing else.

**Tech Stack:** Next.js 16 App Router (RSC + Client Components), TypeScript strict, Zod, Tailwind v4 with static class maps, Phosphor icons, vitest (node env), Playwright.

**Spec:** `docs/superpowers/specs/2026-07-28-typing-tutor-design.md`

> **Erratum — closing-round correction (2026-07-28):** This plan preserves
> its original implementation history below, but two details are superseded.
> `typing.keys.shift-space` was split into `typing.keys.space` and
> `typing.keys.shift` because the shared tag allowed the space bar to complete
> the Shift lesson. Child-facing finger copy now says “pointer finger,” not
> “index finger.” The design spec linked above is the current source of truth.

## Global Constraints

Every task's requirements implicitly include this section.

- **bun only.** `bun install`, `bun run test`. Never npm/yarn/pnpm.
- **Never disable a linter rule.** No `eslint-disable`, no `@ts-ignore`, no unused-var underscore hacks beyond the existing `_config` convention. Fix the root cause.
- **No top-level `getDb()` / `getAuth()`** or any service connection at module scope — it breaks `next build`.
- **Static Tailwind class maps only** (`const TONE: Record<K, string> = {...}`). Never construct class strings — JIT will not see them.
- **Phosphor icons only** (`@phosphor-icons/react/dist/ssr`). Never Lucide.
- **Kid tap targets ≥64px**; WCAG AA contrast.
- **`skillsAffected(config)` must equal the authored `skillTags` EXACTLY as a set** — `src/activities/skill-routing.ts` compares the two unique sets for equality, not subset. A mismatch makes the activity unplayable.
- **Keystroke privacy (§8):** responses record only the **expected** target character and whether it was missed. Never record which key was actually pressed, never free text. Actual keypresses stay in component state.
- **WPM never feeds mastery.** It is display + parent-chart only. `score()` must not read any timing field.
- **Typing-only rule exceptions** (timers, visible rate, letter-forward UI, round-ending misses) are scoped to `keyboard-club`. Never leak them into shared components used by other programs.
- **Slice-1 narrowings of the spec, deliberate:**
  - `typing-catch` targets are **single characters only** (`z.string().length(1)`). Word targets arrive in slice 2 with per-target typed progress.
  - `typing-keys` responses carry **no `ms` field**. It is a calm drill with no clock, nothing consumes the timing, and less child data is the better default. The slice-3 heatmap uses `retries`.
  - No content-hash lock for `keyboard-club` (unlike `kaelynAdaptive` in `content.test.ts`). The program grows across slices 2–3; a hash lock would be pure churn. Schema-parse, unique-id, and skill-resolution guards still apply automatically.
- **Gate before merge:** `bun run lint && bun run typecheck && bun run test && bun run build` all green.

## File Structure

**Create — shared toolkit** (`src/activities/_shared/typing/`)
| File | Responsibility |
|---|---|
| `keys.ts` | `KEY_FINGERS`, `TYPING_ROWS`, `rowOf`, `skillForKey`, `skillsForTargets`. Pure, server-safe. |
| `keys.test.ts` | Bidirectional completeness of the key/finger tables; skill mapping. |
| `wpm.ts` | `wpm(chars, elapsedMs)`. Pure, clockless. |
| `wpm.test.ts` | Rate math, guards, clamp. |
| `typingKey.ts` | `classifyKeydown`, `preventsDefault`. Pure — no DOM types. |
| `typingKey.test.ts` | Modifier / repeat / IME / dead-key cases. |
| `gate.ts` | `gateState({ coarsePointerOnly, keyboardProven })`. Pure. |
| `gate.test.ts` | The three gate states. |
| `useCoarsePointerOnly.ts` | `useSyncExternalStore` media-query hook, SSR-safe. |
| `useTypingKeys.ts` | Client hook: window keydown → `classifyKeydown` → callback. |
| `KeyboardMap.tsx` | SVG-ish keyboard board; highlights target, tints by finger. |
| `KeyboardMap.test.tsx` | Static markup assertions. |
| `TypingStage.tsx` | The gate + stage wrapper every typing Player renders through. |
| `TypingStage.test.tsx` | Static markup for blocked / prove states. |

**Create — activity kinds**
| File | Responsibility |
|---|---|
| `src/content/activity-configs/typing-keys.ts` | Config schema. |
| `src/content/activity-configs/typing-catch.ts` | Config schema. |
| `src/activities/typing-keys/{logic.ts,state.ts,Player.tsx,index.ts}` + `{logic,state}.test.ts` | Key Camp. |
| `src/activities/typing-catch/{logic.ts,state.ts,Player.tsx,index.ts}` + `{logic,state}.test.ts` | Star Catch. |

**Create — content**
`src/content/programs/keyboard-club/{home-base,sky-row,under-ground,big-letters}.ts` and `src/content/programs/keyboard-club.ts`.

**Modify**
| File | Change |
|---|---|
| `src/content/types.ts` | `SkillDomain` += `"typing"`; `Activity` union += two `ActivityOf<…>` members. |
| `src/content/skills.ts` | Six typing skills. |
| `src/app/(parent)/parent/learners/[id]/page.tsx:49` | `DOMAIN_ORDER` += Typing row (typecheck-forced). |
| `src/content/activity-configs.ts` | Import, re-export, register both schemas. |
| `src/content/index.ts` | `PROGRAMS` += `keyboardClub`. |
| `src/activities/definitions.ts` | Register both server definitions. |
| `src/activities/index.ts` | Register both Players. |
| `src/lib/admin/editor-model.ts` | `defaultConfigFor` cases (exhaustive switch). |
| `src/content/activity-configs.test.ts:42` | Exhaustive `Record<ActivityKind, …>`. |
| `src/activities/index.test.ts` | `VALID_RESPONSES` + `OVER_BOUNDED_RESPONSES`. |
| `src/content/skills.test.ts` | Typing rubric test. |
| `e2e/specs/typing.spec.ts` | Create — guest-playable specs. |

---

### Task 1: Typing skill domain, rubric, and parent row

**Files:**
- Modify: `src/content/types.ts:25-39` (`SkillDomain`)
- Modify: `src/content/skills.ts` (append to `SKILLS`)
- Modify: `src/app/(parent)/parent/learners/[id]/page.tsx:49-64` (`DOMAIN_ORDER`)
- Test: `src/content/skills.test.ts` (append a describe block)

**Interfaces:**
- Consumes: nothing.
- Produces: six `SkillTag` string literals used by every later task —
  `typing.keys.home-row`, `typing.keys.top-row`, `typing.keys.bottom-row`,
  `typing.keys.shift-space`, `typing.words.familiar`, `typing.fluency.rate`.
  `SkillDomain` gains the `"typing"` member.

- [ ] **Step 1: Write the failing test**

Append to `src/content/skills.test.ts`:

```ts
describe("Keyboard Club skills", () => {
  it("registers the six typing rungs under the typing domain", () => {
    for (const slug of [
      "typing.keys.home-row",
      "typing.keys.top-row",
      "typing.keys.bottom-row",
      "typing.keys.shift-space",
      "typing.words.familiar",
      "typing.fluency.rate",
    ]) {
      const skill = SKILLS.find((s) => s.slug === slug);
      expect(skill, slug).toBeDefined();
      expect(skill!.domain).toBe("typing");
      expect(skill!.readyIndicator.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/content/skills.test.ts`
Expected: FAIL — `expected undefined to be defined` for `typing.keys.home-row`.

- [ ] **Step 3: Add the domain**

In `src/content/types.ts`, add to the `SkillDomain` union after `"science"`:

```ts
  | "typing" // Keyboard Club: keyboarding & touch typing
```

- [ ] **Step 4: Add the rubric**

Append to the `SKILLS` array in `src/content/skills.ts`:

```ts
  // ── Keyboard Club (typing) ──────────────────────────────────────────
  {
    slug: "typing.keys.home-row",
    domain: "typing",
    label: "Home row",
    readyIndicator: "Finds a-s-d-f and j-k-l-; from the F and J bumps without hunting for them",
    stretchIndicator: "Returns her fingers to the bumps after each word without being reminded",
  },
  {
    slug: "typing.keys.top-row",
    domain: "typing",
    label: "Top row",
    readyIndicator: "Reaches up to q-w-e-r-t-y-u-i-o-p and comes back to the home row",
    stretchIndicator: "Reaches up without her whole hand leaving home position",
  },
  {
    slug: "typing.keys.bottom-row",
    domain: "typing",
    label: "Bottom row",
    readyIndicator: "Reaches down to z-x-c-v-b-n-m and comes back to the home row",
    stretchIndicator: "Keeps her wrists still while the fingers do the reaching",
  },
  {
    slug: "typing.keys.shift-space",
    domain: "typing",
    label: "Space & capitals",
    readyIndicator: "Spaces with a thumb and makes a capital with the far-hand shift key",
    stretchIndicator: "Chooses the shift key opposite the letter instead of the nearer one",
  },
  {
    slug: "typing.words.familiar",
    domain: "typing",
    label: "Typing familiar words",
    readyIndicator: "Types words she can already read and spell, letter for letter",
    stretchIndicator: "Notices a typo as she makes it and fixes it without being told",
  },
  {
    slug: "typing.fluency.rate",
    domain: "typing",
    label: "Comfortable rate",
    readyIndicator: "Keeps a steady, unhurried rate on familiar words instead of stopping at each key",
    stretchIndicator: "Holds that rate while looking at the screen rather than her hands",
  },
```

- [ ] **Step 5: Add the parent row**

In `src/app/(parent)/parent/learners/[id]/page.tsx`, add to `DOMAIN_ORDER` after the `science` entry (before the World Languages block):

```ts
  { key: "typing", label: "Keyboard Club" },
```

- [ ] **Step 6: Run tests and typecheck**

Run: `bun run test src/content/skills.test.ts && bun run typecheck`
Expected: PASS. (Typecheck would fail on `_MissingDomain` if step 5 were skipped — that backstop is the point.)

- [ ] **Step 7: Commit**

```bash
git add src/content/types.ts src/content/skills.ts src/content/skills.test.ts "src/app/(parent)/parent/learners/[id]/page.tsx"
git commit -m "feat(typing): add the typing skill domain, rubric, and parent report row"
```

---

### Task 2: Key/finger tables and rate math

**Files:**
- Create: `src/activities/_shared/typing/keys.ts`
- Create: `src/activities/_shared/typing/keys.test.ts`
- Create: `src/activities/_shared/typing/wpm.ts`
- Create: `src/activities/_shared/typing/wpm.test.ts`

**Interfaces:**
- Consumes: `SkillTag` from `@/content/types`; the six skill slugs from Task 1.
- Produces:
  - `type Hand = "left" | "right"`
  - `type Finger = "pinky" | "ring" | "middle" | "index" | "thumb"`
  - `type TypingRow = "top" | "home" | "bottom" | "space"`
  - `const KEY_FINGERS: Record<string, { hand: Hand; finger: Finger }>`
  - `const TYPING_ROWS: Record<Exclude<TypingRow, "space">, readonly string[]>`
  - `function isTeachableKey(char: string): boolean`
  - `function rowOf(char: string): TypingRow`
  - `function skillForKey(char: string): SkillTag`
  - `function skillsForTargets(targets: readonly string[]): SkillTag[]`
  - `function wpm(chars: number, elapsedMs: number): number`

- [ ] **Step 1: Write the failing tests**

Create `src/activities/_shared/typing/keys.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  KEY_FINGERS,
  TYPING_ROWS,
  isTeachableKey,
  rowOf,
  skillForKey,
  skillsForTargets,
} from "./keys";

describe("key/finger tables", () => {
  it("assigns a finger to every key on the board, and boards every fingered key", () => {
    const board = [...Object.values(TYPING_ROWS).flat(), " "];
    for (const key of board) expect(KEY_FINGERS[key], key).toBeDefined();
    expect(new Set(board).size).toBe(board.length);
    expect(Object.keys(KEY_FINGERS).sort()).toEqual([...board].sort());
  });

  it("puts the home-row anchors under the index fingers", () => {
    expect(KEY_FINGERS["f"]).toEqual({ hand: "left", finger: "index" });
    expect(KEY_FINGERS["j"]).toEqual({ hand: "right", finger: "index" });
    expect(KEY_FINGERS[" "]).toEqual({ hand: "right", finger: "thumb" });
  });

  it("classifies rows", () => {
    expect(rowOf("a")).toBe("home");
    expect(rowOf("q")).toBe("top");
    expect(rowOf("z")).toBe("bottom");
    expect(rowOf(" ")).toBe("space");
  });

  it("treats any capital as shift work, whatever row the letter sits on", () => {
    expect(skillForKey("a")).toBe("typing.keys.home-row");
    expect(skillForKey("A")).toBe("typing.keys.shift-space");
    expect(skillForKey(" ")).toBe("typing.keys.shift-space");
    expect(skillForKey("q")).toBe("typing.keys.top-row");
    expect(skillForKey("z")).toBe("typing.keys.bottom-row");
  });

  it("derives a sorted, deduped skill set from single-character targets", () => {
    expect(skillsForTargets(["a", "s", "d", "f"])).toEqual(["typing.keys.home-row"]);
    expect(skillsForTargets(["a", "q"])).toEqual([
      "typing.keys.home-row",
      "typing.keys.top-row",
    ]);
  });

  it("treats any multi-character target as word typing", () => {
    expect(skillsForTargets(["sad", "dad"])).toEqual(["typing.words.familiar"]);
    expect(skillsForTargets(["a", "sad"])).toEqual(["typing.words.familiar"]);
  });

  it("rejects untaught keys", () => {
    expect(isTeachableKey("a")).toBe(true);
    expect(isTeachableKey("A")).toBe(true);
    expect(isTeachableKey("4")).toBe(false);
    expect(isTeachableKey("é")).toBe(false);
  });
});
```

Create `src/activities/_shared/typing/wpm.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { wpm } from "./wpm";

describe("wpm", () => {
  it("uses the standard five-character word", () => {
    expect(wpm(50, 60_000)).toBe(10);
    expect(wpm(25, 60_000)).toBe(5);
  });

  it("rounds to a whole number", () => {
    expect(wpm(13, 60_000)).toBe(3);
  });

  it("returns 0 rather than Infinity for a zero or negative span", () => {
    expect(wpm(10, 0)).toBe(0);
    expect(wpm(10, -5)).toBe(0);
  });

  it("clamps a bogus client clock instead of trusting it", () => {
    expect(wpm(100, 1)).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/activities/_shared/typing`
Expected: FAIL — `Cannot find module './keys'` and `'./wpm'`.

- [ ] **Step 3: Implement `keys.ts`**

```ts
import type { SkillTag } from "@/content/types";

/**
 * US-QWERTY key geography for Keyboard Club. Pure and server-safe: scoring,
 * content validation, and the KeyboardMap all read these same tables, so the
 * board a child sees and the skills an attempt claims can never disagree.
 *
 * Scope is slice-1 deliberate: letters, space, and the four punctuation keys
 * that sit on the lettered rows. The number row and symbols are out of scope.
 */

export type Hand = "left" | "right";
export type Finger = "pinky" | "ring" | "middle" | "index" | "thumb";
export type TypingRow = "top" | "home" | "bottom" | "space";

export const TYPING_ROWS = {
  top: ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  home: ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";"],
  bottom: ["z", "x", "c", "v", "b", "n", "m", ",", ".", "/"],
} as const satisfies Record<Exclude<TypingRow, "space">, readonly string[]>;

/** Touch-typing finger assignment. `g`/`h` are the index-finger reaches. */
export const KEY_FINGERS: Record<string, { hand: Hand; finger: Finger }> = {
  q: { hand: "left", finger: "pinky" },
  a: { hand: "left", finger: "pinky" },
  z: { hand: "left", finger: "pinky" },
  w: { hand: "left", finger: "ring" },
  s: { hand: "left", finger: "ring" },
  x: { hand: "left", finger: "ring" },
  e: { hand: "left", finger: "middle" },
  d: { hand: "left", finger: "middle" },
  c: { hand: "left", finger: "middle" },
  r: { hand: "left", finger: "index" },
  f: { hand: "left", finger: "index" },
  v: { hand: "left", finger: "index" },
  t: { hand: "left", finger: "index" },
  g: { hand: "left", finger: "index" },
  b: { hand: "left", finger: "index" },
  y: { hand: "right", finger: "index" },
  h: { hand: "right", finger: "index" },
  n: { hand: "right", finger: "index" },
  u: { hand: "right", finger: "index" },
  j: { hand: "right", finger: "index" },
  m: { hand: "right", finger: "index" },
  i: { hand: "right", finger: "middle" },
  k: { hand: "right", finger: "middle" },
  ",": { hand: "right", finger: "middle" },
  o: { hand: "right", finger: "ring" },
  l: { hand: "right", finger: "ring" },
  ".": { hand: "right", finger: "ring" },
  p: { hand: "right", finger: "pinky" },
  ";": { hand: "right", finger: "pinky" },
  "/": { hand: "right", finger: "pinky" },
  " ": { hand: "right", finger: "thumb" },
};

const ROW_SKILL: Record<TypingRow, SkillTag> = {
  top: "typing.keys.top-row",
  home: "typing.keys.home-row",
  bottom: "typing.keys.bottom-row",
  space: "typing.keys.shift-space",
};

/** Case-insensitive: "A" is the same physical key as "a". */
export function isTeachableKey(char: string): boolean {
  return KEY_FINGERS[char.toLowerCase()] !== undefined;
}

export function rowOf(char: string): TypingRow {
  const lower = char.toLowerCase();
  if (lower === " ") return "space";
  if ((TYPING_ROWS.top as readonly string[]).includes(lower)) return "top";
  if ((TYPING_ROWS.home as readonly string[]).includes(lower)) return "home";
  if ((TYPING_ROWS.bottom as readonly string[]).includes(lower)) return "bottom";
  throw new Error(`untaught key: ${char}`);
}

/**
 * A capital is shift work no matter which row the letter lives on — reaching
 * for the far-hand shift is the skill being practiced, not the letter.
 */
export function skillForKey(char: string): SkillTag {
  if (char === " ") return ROW_SKILL.space;
  if (char !== char.toLowerCase()) return ROW_SKILL.space;
  return ROW_SKILL[rowOf(char)];
}

/**
 * The single skill-derivation rule both typing kinds use, so a config and its
 * authored `skillTags` can be checked against one another. Multi-character
 * targets are word typing; the individual letters are assumed by then.
 */
export function skillsForTargets(targets: readonly string[]): SkillTag[] {
  if (targets.some((target) => target.length !== 1)) return ["typing.words.familiar"];
  return [...new Set(targets.map(skillForKey))].sort();
}
```

- [ ] **Step 4: Implement `wpm.ts`**

```ts
/** Words per minute at the standard five-character word. */
const CHARS_PER_WORD = 5;
/** No child types this fast; a higher number means a bogus client clock. */
const MAX_PLAUSIBLE_WPM = 200;

/**
 * Clockless by construction — the caller passes the elapsed span, so this is
 * unit-testable and cannot drift with the machine clock. Client-measured and
 * therefore INDICATIVE ONLY: display it, chart it, never let it reach `score()`.
 */
export function wpm(chars: number, elapsedMs: number): number {
  if (elapsedMs <= 0 || chars <= 0) return 0;
  const rate = chars / CHARS_PER_WORD / (elapsedMs / 60_000);
  return Math.min(MAX_PLAUSIBLE_WPM, Math.round(rate));
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test src/activities/_shared/typing`
Expected: PASS (10 tests).

- [ ] **Step 6: Commit**

```bash
git add src/activities/_shared/typing
git commit -m "feat(typing): add key/finger geography tables and rate math"
```

---

### Task 3: Hardened keydown classification

**Files:**
- Create: `src/activities/_shared/typing/typingKey.ts`
- Create: `src/activities/_shared/typing/typingKey.test.ts`
- Create: `src/activities/_shared/typing/useTypingKeys.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface KeydownLike { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; repeat: boolean; isComposing?: boolean }`
  - `type KeyIntent = { type: "ignore" } | { type: "char"; char: string } | { type: "backspace" }`
  - `function classifyKeydown(event: KeydownLike): KeyIntent`
  - `function preventsDefault(event: KeydownLike): boolean`
  - `function useTypingKeys(onIntent: (intent: KeyIntent) => void, active: boolean): void`

- [ ] **Step 1: Write the failing test**

Create `src/activities/_shared/typing/typingKey.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyKeydown, preventsDefault, type KeydownLike } from "./typingKey";

function press(overrides: Partial<KeydownLike> & { key: string }): KeydownLike {
  return {
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    repeat: false,
    isComposing: false,
    ...overrides,
  };
}

describe("classifyKeydown", () => {
  it("reads a plain letter as that character", () => {
    expect(classifyKeydown(press({ key: "f" }))).toEqual({ type: "char", char: "f" });
  });

  it("keeps the capital a capital", () => {
    expect(classifyKeydown(press({ key: "F" }))).toEqual({ type: "char", char: "F" });
  });

  it("reads the space bar as a space character", () => {
    expect(classifyKeydown(press({ key: " " }))).toEqual({ type: "char", char: " " });
  });

  it("ignores shortcuts so browser and OS keys never count as typing", () => {
    for (const modifier of ["ctrlKey", "metaKey", "altKey"] as const) {
      expect(classifyKeydown(press({ key: "f", [modifier]: true }))).toEqual({ type: "ignore" });
    }
  });

  it("ignores auto-repeat — a held key is one intent, not a stream", () => {
    expect(classifyKeydown(press({ key: "f", repeat: true }))).toEqual({ type: "ignore" });
  });

  it("ignores IME composition and dead keys", () => {
    expect(classifyKeydown(press({ key: "f", isComposing: true }))).toEqual({ type: "ignore" });
    expect(classifyKeydown(press({ key: "Dead" }))).toEqual({ type: "ignore" });
    expect(classifyKeydown(press({ key: "Process" }))).toEqual({ type: "ignore" });
  });

  it("never treats a bare modifier or navigation key as a miss", () => {
    for (const key of ["Shift", "Tab", "Enter", "ArrowLeft", "CapsLock", "Escape"]) {
      expect(classifyKeydown(press({ key })), key).toEqual({ type: "ignore" });
    }
  });

  it("reads backspace as its own intent", () => {
    expect(classifyKeydown(press({ key: "Backspace" }))).toEqual({ type: "backspace" });
  });
});

describe("preventsDefault", () => {
  it("swallows the keys that would scroll the page or open browser find", () => {
    for (const key of [" ", "'", "/", "Backspace"]) {
      expect(preventsDefault(press({ key })), key).toBe(true);
    }
  });

  it("leaves ordinary letters and real shortcuts alone", () => {
    expect(preventsDefault(press({ key: "f" }))).toBe(false);
    expect(preventsDefault(press({ key: "r", ctrlKey: true }))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/activities/_shared/typing/typingKey.test.ts`
Expected: FAIL — `Cannot find module './typingKey'`.

- [ ] **Step 3: Implement `typingKey.ts`**

```ts
/**
 * Keydown hardening for the typing games, as a PURE function over a plain
 * object — so every case is unit-testable in the node test environment with no
 * DOM. `KeyboardEvent` is structurally assignable to `KeydownLike`.
 *
 * The rules exist because a child's hands find every one of these: a held key,
 * a stray Cmd, CapsLock, the space bar scrolling the page out from under the
 * game. None of them may ever score as a miss.
 */

export interface KeydownLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  repeat: boolean;
  isComposing?: boolean;
}

export type KeyIntent =
  | { type: "ignore" }
  | { type: "char"; char: string }
  | { type: "backspace" };

const IGNORE: KeyIntent = { type: "ignore" };

/** Keys the browser would otherwise act on mid-game. */
const SWALLOWED = new Set([" ", "'", "/"]);

export function classifyKeydown(event: KeydownLike): KeyIntent {
  if (event.ctrlKey || event.metaKey || event.altKey) return IGNORE;
  if (event.repeat) return IGNORE;
  if (event.isComposing === true) return IGNORE;
  if (event.key === "Dead" || event.key === "Process") return IGNORE;
  if (event.key === "Backspace") return { type: "backspace" };
  // Every printable key reports a single-character `key`; named keys
  // ("Shift", "ArrowLeft", "F3") are longer and are not typing.
  if (event.key.length === 1) return { type: "char", char: event.key };
  return IGNORE;
}

export function preventsDefault(event: KeydownLike): boolean {
  const intent = classifyKeydown(event);
  if (intent.type === "backspace") return true;
  return intent.type === "char" && SWALLOWED.has(intent.char);
}
```

- [ ] **Step 4: Implement `useTypingKeys.ts`**

```ts
"use client";

import { useEffect, useRef } from "react";
import { classifyKeydown, preventsDefault, type KeyIntent } from "./typingKey";

/**
 * Window-level keydown for a typing Player. Window-level (not an input element)
 * because the child must simply type — there is no field to focus, and no typed
 * text is ever collected. The callback rides a ref so a changing handler does
 * not detach and reattach the listener between keystrokes.
 */
export function useTypingKeys(onIntent: (intent: KeyIntent) => void, active: boolean): void {
  const handler = useRef(onIntent);
  handler.current = onIntent;

  useEffect(() => {
    if (!active) return;
    function onKeyDown(event: KeyboardEvent) {
      if (preventsDefault(event)) event.preventDefault();
      const intent = classifyKeydown(event);
      if (intent.type !== "ignore") handler.current(intent);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active]);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test src/activities/_shared/typing && bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/activities/_shared/typing
git commit -m "feat(typing): add hardened keydown classification and the window key hook"
```

---

### Task 4: The keyboard gate

**Files:**
- Create: `src/activities/_shared/typing/gate.ts`
- Create: `src/activities/_shared/typing/gate.test.ts`
- Create: `src/activities/_shared/typing/useCoarsePointerOnly.ts`
- Create: `src/activities/_shared/typing/TypingStage.tsx`
- Create: `src/activities/_shared/typing/TypingStage.test.tsx`

**Interfaces:**
- Consumes: `useTypingKeys` (Task 3).
- Produces:
  - `type GateState = "blocked" | "prove" | "open"`
  - `function gateState(input: { coarsePointerOnly: boolean; keyboardProven: boolean }): GateState`
  - `function useCoarsePointerOnly(): boolean`
  - `function TypingStage({ children }: { children: ReactNode }): JSX.Element`
  - Exported constant `PROVE_KEY = "f"`.

- [ ] **Step 1: Write the failing tests**

Create `src/activities/_shared/typing/gate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { gateState } from "./gate";

describe("gateState", () => {
  it("opens once a real keypress has proven a keyboard", () => {
    expect(gateState({ coarsePointerOnly: false, keyboardProven: true })).toBe("open");
  });

  it("opens for a tablet too, if a keyboard is attached and used", () => {
    expect(gateState({ coarsePointerOnly: true, keyboardProven: true })).toBe("open");
  });

  it("explains itself on a touch-only device", () => {
    expect(gateState({ coarsePointerOnly: true, keyboardProven: false })).toBe("blocked");
  });

  it("asks for proof on a device that looks like it has a keyboard", () => {
    expect(gateState({ coarsePointerOnly: false, keyboardProven: false })).toBe("prove");
  });
});
```

Create `src/activities/_shared/typing/TypingStage.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TypingStage } from "./TypingStage";

describe("TypingStage", () => {
  it("asks for the home-row anchor before revealing the game", () => {
    const markup = renderToStaticMarkup(
      <TypingStage>
        <p>the game</p>
      </TypingStage>,
    );

    // The server snapshot is "not coarse, not proven" — the prove screen.
    expect(markup).toContain("Press the");
    expect(markup).not.toContain("the game");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/activities/_shared/typing`
Expected: FAIL — `Cannot find module './gate'` and `'./TypingStage'`.

- [ ] **Step 3: Implement `gate.ts`**

```ts
/**
 * The typing gate, as a pure decision. Typing is the one place in the product
 * that requires a physical keyboard (spec: the sole exception to touch-first
 * design), so a tablet gets an explanation rather than a broken game.
 *
 * "blocked" is a message, not a dead end — the stage keeps listening for a
 * keypress, so an iPad with a keyboard case opens the moment a key is pressed.
 */
export type GateState = "blocked" | "prove" | "open";

/** The home-row anchor doubles as the proof-of-keyboard key. */
export const PROVE_KEY = "f";

export function gateState(input: {
  coarsePointerOnly: boolean;
  keyboardProven: boolean;
}): GateState {
  if (input.keyboardProven) return "open";
  return input.coarsePointerOnly ? "blocked" : "prove";
}
```

- [ ] **Step 4: Implement `useCoarsePointerOnly.ts`**

```ts
"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(any-pointer: fine)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return !window.matchMedia(QUERY).matches;
}

/**
 * True when the device reports NO fine pointer — a phone or tablet with no
 * mouse or trackpad, which almost always means no keyboard either. Mirrors
 * `useReducedMotion`'s `useSyncExternalStore` shape. SSR-safe: the server
 * snapshot is `false`, so the first paint is the friendly "press F" screen
 * rather than a block that flashes at laptop users.
 */
export function useCoarsePointerOnly(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
```

- [ ] **Step 5: Implement `TypingStage.tsx`**

```tsx
"use client";

import { useState, type ReactNode } from "react";
import { KeyboardIcon } from "@phosphor-icons/react/dist/ssr";
import { PROVE_KEY, gateState } from "./gate";
import { useCoarsePointerOnly } from "./useCoarsePointerOnly";
import { useTypingKeys } from "./useTypingKeys";

/**
 * The gate + stage wrapper EVERY typing Player renders through.
 *
 * Deliberately not a route layout: generated and shelf hosts mount Players
 * directly, and a layout-only gate would leak straight through them (the same
 * mistake the parent PIN gate had to correct). Gating at the Player boundary is
 * the only placement that cannot be bypassed.
 */
export function TypingStage({ children }: { children: ReactNode }) {
  const coarsePointerOnly = useCoarsePointerOnly();
  const [keyboardProven, setKeyboardProven] = useState(false);
  const state = gateState({ coarsePointerOnly, keyboardProven });

  // Keep listening even while blocked: attaching a keyboard case to a tablet
  // should just work, with no reload and no settings toggle.
  useTypingKeys((intent) => {
    if (intent.type === "char") setKeyboardProven(true);
  }, state !== "open");

  if (state === "open") return <>{children}</>;

  return (
    <div className="flex flex-col items-center gap-6 py-12 text-center">
      <KeyboardIcon size={72} weight="duotone" className="text-honey" aria-hidden />
      {state === "blocked" ? (
        <>
          <h2 className="text-2xl font-semibold text-ink">Typing needs a keyboard</h2>
          <p className="max-w-sm text-ink-soft">
            This game is for a computer with real keys. See you there!
          </p>
        </>
      ) : (
        <>
          <h2 className="text-2xl font-semibold text-ink">
            Press the <kbd className="rounded-xl bg-honey/30 px-3 py-1">{PROVE_KEY.toUpperCase()}</kbd> key to start
          </h2>
          <p className="max-w-sm text-ink-soft">
            Feel the little bump on it? That is where your left pointer finger lives.
          </p>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun run test src/activities/_shared/typing && bun run typecheck && bun run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/activities/_shared/typing
git commit -m "feat(typing): gate every typing player on a proven physical keyboard"
```

---

### Task 5: The keyboard map

**Files:**
- Create: `src/activities/_shared/typing/KeyboardMap.tsx`
- Create: `src/activities/_shared/typing/KeyboardMap.test.tsx`

**Interfaces:**
- Consumes: `KEY_FINGERS`, `TYPING_ROWS` (Task 2).
- Produces: `function KeyboardMap({ target, showHands }: { target: string | null; showHands?: boolean }): JSX.Element`

- [ ] **Step 1: Write the failing test**

Create `src/activities/_shared/typing/KeyboardMap.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KeyboardMap } from "./KeyboardMap";

describe("KeyboardMap", () => {
  it("draws every lettered key plus the space bar", () => {
    const markup = renderToStaticMarkup(<KeyboardMap target={null} />);
    for (const key of ["q", "a", "z", "p", ";", "/"]) {
      expect(markup, key).toContain(`data-key="${key}"`);
    }
    expect(markup).toContain('data-key=" "');
  });

  it("marks the target key so it is not colour alone", () => {
    const markup = renderToStaticMarkup(<KeyboardMap target="f" />);
    expect(markup).toContain('data-target="true"');
    expect(markup).toContain('aria-label="Press F, left index finger"');
  });

  it("names the space bar in words rather than as a blank", () => {
    const markup = renderToStaticMarkup(<KeyboardMap target=" " />);
    expect(markup).toContain('aria-label="Press the space bar, right thumb"');
  });

  it("treats a capital as its own key on the board", () => {
    const markup = renderToStaticMarkup(<KeyboardMap target="F" />);
    expect(markup).toContain('data-target="true"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/activities/_shared/typing/KeyboardMap.test.tsx`
Expected: FAIL — `Cannot find module './KeyboardMap'`.

- [ ] **Step 3: Implement `KeyboardMap.tsx`**

```tsx
import { cn } from "@/lib/cn";
import { KEY_FINGERS, TYPING_ROWS, type Finger } from "./keys";

/**
 * A picture of the keyboard, not an input. Each key is tinted by the finger
 * that owns it, so the child learns finger assignment by looking rather than by
 * being told. The target key is marked by tint AND a ring AND a label, never by
 * colour alone (DESIGN.md accessibility floor).
 *
 * Static class maps only — Tailwind's JIT cannot see constructed strings.
 */
const FINGER_TINT: Record<Finger, string> = {
  pinky: "bg-berry/20",
  ring: "bg-sky/20",
  middle: "bg-sprout/20",
  index: "bg-honey/30",
  thumb: "bg-coral/20",
};

const ROW_ORDER = ["top", "home", "bottom"] as const;

function fingerOf(key: string) {
  return KEY_FINGERS[key.toLowerCase()];
}

function keyLabel(key: string): string {
  const assignment = fingerOf(key);
  const hand = assignment?.hand === "left" ? "left" : "right";
  const finger = assignment?.finger ?? "index";
  if (key === " ") return `Press the space bar, ${hand} ${finger}`;
  return `Press ${key.toUpperCase()}, ${hand} ${finger}`;
}

function Key({ char, target }: { char: string; target: string | null }) {
  const isTarget = target !== null && target.toLowerCase() === char.toLowerCase();
  const assignment = fingerOf(char);
  return (
    <span
      data-key={char}
      data-target={isTarget ? "true" : undefined}
      aria-label={isTarget ? keyLabel(target) : undefined}
      className={cn(
        "grid place-items-center rounded-xl text-lg font-semibold text-ink",
        char === " " ? "h-12 w-64" : "size-12",
        assignment ? FINGER_TINT[assignment.finger] : "bg-paper-deep",
        isTarget && "ring-4 ring-coral ring-offset-2 ring-offset-paper",
      )}
    >
      {char === " " ? "" : char}
    </span>
  );
}

export function KeyboardMap({ target }: { target: string | null }) {
  return (
    <div className="flex flex-col items-center gap-2" role="img" aria-label="Keyboard">
      {ROW_ORDER.map((row) => (
        <div key={row} className="flex gap-2">
          {TYPING_ROWS[row].map((char) => (
            <Key key={char} char={char} target={target} />
          ))}
        </div>
      ))}
      <Key char=" " target={target} />
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/activities/_shared/typing && bun run lint`
Expected: PASS.

Note: the `showHands` config field is honoured in Task 7 by the Player choosing whether to render `KeyboardMap` at all; the map itself has no hands variant in slice 1.

- [ ] **Step 5: Commit**

```bash
git add src/activities/_shared/typing
git commit -m "feat(typing): add the finger-tinted keyboard map"
```

---

### Task 6: `typing-keys` — schema, scoring, and full registration

This task lands the kind end-to-end on the server. It cannot be split: adding a key to `ACTIVITY_CONFIG_SCHEMAS` breaks four exhaustive `Record<ActivityKind, …>` sites at once, so the codebase does not typecheck until all of them are updated together.

**Files:**
- Create: `src/content/activity-configs/typing-keys.ts`
- Create: `src/activities/typing-keys/logic.ts`
- Create: `src/activities/typing-keys/logic.test.ts`
- Modify: `src/content/activity-configs.ts`
- Modify: `src/content/types.ts` (`Activity` union)
- Modify: `src/activities/definitions.ts`
- Modify: `src/lib/admin/editor-model.ts` (`defaultConfigFor` switch)
- Modify: `src/content/activity-configs.test.ts`
- Modify: `src/activities/index.test.ts`

**Interfaces:**
- Consumes: `isTeachableKey`, `skillsForTargets` (Task 2); `starsFromAccuracy`, `outcomeFromAccuracy`, `evenSkillEvidence` from `../_shared/scoring`.
- Produces:
  - `typingKeysConfig` / `type TypingKeysConfig`
  - `function expectedPrompts(config: TypingKeysConfig): string[]` — the canonical prompt order, shared by Player and scoring.
  - `responseSchema` / `type TypingKeysResponse = { prompts: { key: string; ok: boolean; retries: number }[] }`
  - `score`, `skillsAffected`, `validateGenerated`

- [ ] **Step 1: Write the failing test**

Create `src/activities/typing-keys/logic.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { TypingKeysConfig } from "@/content/activity-configs";
import { expectedPrompts, score, skillsAffected, validateGenerated } from "./logic";

const CONFIG: TypingKeysConfig = {
  instruction: "Press the glowing key.",
  keys: ["f", "j"],
  reps: 2,
};

function prompts(spec: { key: string; ok?: boolean; retries?: number }[]) {
  return { prompts: spec.map((s) => ({ key: s.key, ok: s.ok ?? true, retries: s.retries ?? 0 })) };
}

describe("expectedPrompts", () => {
  it("cycles the keys once per rep, so Player and scoring agree on the order", () => {
    expect(expectedPrompts(CONFIG)).toEqual(["f", "j", "f", "j"]);
  });

  it("defaults reps so an author can omit it", () => {
    expect(expectedPrompts({ instruction: "Go.", keys: ["a"] })).toEqual(["a", "a"]);
  });
});

describe("score", () => {
  it("awards three stars when every key landed first try", () => {
    const result = score(CONFIG, prompts([{ key: "f" }, { key: "j" }, { key: "f" }, { key: "j" }]));
    expect(result).toEqual({
      correct: 4,
      total: 4,
      stars: 3,
      skillEvidence: [{ skill: "typing.keys.home-row", outcome: "solid" }],
    });
  });

  it("drops to emerging when half needed a retry", () => {
    const result = score(
      CONFIG,
      prompts([
        { key: "f" },
        { key: "j", retries: 2 },
        { key: "f" },
        { key: "j", retries: 1 },
      ]),
    );
    expect(result.stars).toBe(2);
    expect(result.skillEvidence).toEqual([
      { skill: "typing.keys.home-row", outcome: "emerging" },
    ]);
  });

  it("yields no evidence when the prompt order does not match the config", () => {
    const result = score(CONFIG, prompts([{ key: "j" }, { key: "f" }, { key: "f" }, { key: "j" }]));
    expect(result.correct).toBe(0);
    expect(result.skillEvidence).toEqual([]);
  });

  it("yields no evidence when the prompt count does not match the config", () => {
    const result = score(CONFIG, prompts([{ key: "f" }]));
    expect(result.correct).toBe(0);
    expect(result.skillEvidence).toEqual([]);
  });

  it("yields no evidence when a prompt was never satisfied", () => {
    const result = score(
      CONFIG,
      prompts([{ key: "f" }, { key: "j" }, { key: "f" }, { key: "j", ok: false }]),
    );
    expect(result.correct).toBe(0);
    expect(result.skillEvidence).toEqual([]);
  });
});

describe("skillsAffected", () => {
  it("derives one skill per row touched, sorted", () => {
    expect(skillsAffected(CONFIG)).toEqual(["typing.keys.home-row"]);
    expect(skillsAffected({ ...CONFIG, keys: ["f", "q"] })).toEqual([
      "typing.keys.home-row",
      "typing.keys.top-row",
    ]);
  });

  it("counts a capital as shift work", () => {
    expect(skillsAffected({ ...CONFIG, keys: ["F"] })).toEqual(["typing.keys.shift-space"]);
  });
});

describe("validateGenerated", () => {
  it("accepts teachable keys", () => {
    expect(validateGenerated(CONFIG)).toBeNull();
  });

  it("rejects a key that is not on the board", () => {
    expect(validateGenerated({ ...CONFIG, keys: ["4"] })).toBe("untaught key: 4");
  });

  it("rejects a duplicated key", () => {
    expect(validateGenerated({ ...CONFIG, keys: ["f", "f"] })).toBe("duplicate key: f");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/activities/typing-keys`
Expected: FAIL — `Cannot find module './logic'`.

- [ ] **Step 3: Create the config schema**

Create `src/content/activity-configs/typing-keys.ts`:

```ts
import { z } from "zod";

export const typingKeysConfig = z
  .object({
    instruction: z.string().trim().min(1).max(240),
    /** The keys this drill teaches, each a single character. */
    keys: z.array(z.string().length(1)).min(1).max(10),
    /** How many times the child cycles the whole set. */
    reps: z.number().int().min(1).max(3).default(2),
    /** Show the keyboard map. Off once she should be looking away. */
    showHands: z.boolean().default(true),
  })
  .strict();
export type TypingKeysConfig = z.input<typeof typingKeysConfig>;
```

- [ ] **Step 4: Implement the logic**

Create `src/activities/typing-keys/logic.ts`:

```ts
import { typingKeysConfig, type TypingKeysConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import { z } from "zod";
import { isTeachableKey, skillsForTargets } from "../_shared/typing/keys";
import {
  evenSkillEvidence,
  outcomeFromAccuracy,
  starsFromAccuracy,
} from "../_shared/scoring";

/** Server-safe schema + scoring for typing-keys. No "use client". */
export const schema = typingKeysConfig;

const DEFAULT_REPS = 2;

/**
 * The canonical prompt order: the whole key set, once per rep. Both the Player
 * and `score` derive it from this one function, so a response can be checked
 * against the exact sequence the child was actually shown.
 */
export function expectedPrompts(config: TypingKeysConfig): string[] {
  const reps = config.reps ?? DEFAULT_REPS;
  return Array.from({ length: reps }, () => config.keys).flat();
}

/**
 * §8: only the EXPECTED key is recorded, plus how many retries it took. Which
 * key the child actually pressed never leaves the component.
 */
export const responseSchema = z
  .object({
    prompts: z
      .array(
        z
          .object({
            key: z.string().length(1),
            ok: z.boolean(),
            retries: z.number().int().min(0).max(20),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict();
export type TypingKeysResponse = z.infer<typeof responseSchema>;

/** Zero evidence, one star for showing up — the fail-closed shape. */
function noEvidence(total: number): ActivityScore {
  return { correct: 0, total, stars: 1, skillEvidence: [] };
}

export function score(
  config: TypingKeysConfig,
  response: TypingKeysResponse,
): ActivityScore {
  const expected = expectedPrompts(config);
  const matchesDrill =
    response.prompts.length === expected.length &&
    response.prompts.every((prompt, index) => prompt.key === expected[index]);
  if (!matchesDrill) return noEvidence(expected.length);
  // Key Camp is retry-until-right, so a genuine completion has every prompt
  // satisfied. Anything else is malformed, and `completionPolicy: "full-score"`
  // rejects it at the server boundary.
  if (!response.prompts.every((prompt) => prompt.ok)) return noEvidence(expected.length);

  const firstTry = response.prompts.filter((prompt) => prompt.retries === 0).length;
  const rate = firstTry / expected.length;
  return {
    correct: expected.length,
    total: expected.length,
    stars: starsFromAccuracy(rate),
    skillEvidence: evenSkillEvidence(skillsAffected(config), outcomeFromAccuracy(rate)),
  };
}

export function skillsAffected(config: TypingKeysConfig): SkillTag[] {
  return skillsForTargets(config.keys);
}

export function validateGenerated(config: TypingKeysConfig): string | null {
  const seen = new Set<string>();
  for (const key of config.keys) {
    if (!isTeachableKey(key)) return `untaught key: ${key}`;
    if (seen.has(key)) return `duplicate key: ${key}`;
    seen.add(key);
  }
  return null;
}
```

- [ ] **Step 5: Register the schema**

In `src/content/activity-configs.ts`, add the import (alphabetical, after `sortCategories`), the `export *`, and the `ACTIVITY_CONFIG_SCHEMAS` entry:

```ts
import { typingKeysConfig } from "./activity-configs/typing-keys";
export * from "./activity-configs/typing-keys";
// …inside ACTIVITY_CONFIG_SCHEMAS:
  "typing-keys": typingKeysConfig,
```

In `src/content/types.ts`, add to the imported config types and to the `Activity` union:

```ts
  TypingKeysConfig,
// …in the union:
  | ActivityOf<"typing-keys", TypingKeysConfig>
```

- [ ] **Step 6: Register the server definition**

In `src/activities/definitions.ts`, add the import and the entry:

```ts
import * as typingKeys from "./typing-keys/logic";
// …inside SERVER_ACTIVITY_TYPES:
  "typing-keys": defineServerActivity("typing-keys", typingKeys, "full-score"),
```

- [ ] **Step 7: Satisfy the exhaustive records**

In `src/lib/admin/editor-model.ts`, add a case to the `defaultConfigFor` switch:

```ts
    case "typing-keys":
      return { instruction: "Press the glowing key.", keys: ["f", "j"], reps: 2 };
```

In `src/content/activity-configs.test.ts`, add to the exhaustive record at line 42:

```ts
  "typing-keys": typingKeysConfig,
```

In `src/activities/index.test.ts`, add to `VALID_RESPONSES`:

```ts
  "typing-keys": { prompts: [{ key: "f", ok: true, retries: 0 }] },
```

and to `OVER_BOUNDED_RESPONSES`:

```ts
  "typing-keys": {
    prompts: Array.from({ length: 31 }, () => ({ key: "f", ok: true, retries: 0 })),
  },
```

- [ ] **Step 8: Run the tests**

Run: `bun run test src/activities src/content && bun run typecheck`
Expected: PASS. `src/activities/index.test.ts` will still fail on the missing Player registration — that is Task 7. If it does, note it and continue; every other suite must be green.

- [ ] **Step 9: Commit**

```bash
git add src/content src/activities src/lib/admin/editor-model.ts
git commit -m "feat(typing): add the typing-keys config, scoring, and server registration"
```

---

### Task 7: `typing-keys` — the Key Camp Player

**Files:**
- Create: `src/activities/typing-keys/state.ts`
- Create: `src/activities/typing-keys/state.test.ts`
- Create: `src/activities/typing-keys/Player.tsx`
- Create: `src/activities/typing-keys/index.ts`
- Modify: `src/activities/index.ts`

**Interfaces:**
- Consumes: `expectedPrompts`, `schema`, `TypingKeysResponse` (Task 6); `TypingStage` (Task 4); `KeyboardMap` (Task 5); `useTypingKeys` (Task 3).
- Produces:
  - `interface KeysState { index: number; retries: number; done: { key: string; ok: boolean; retries: number }[] }`
  - `function initialKeysState(): KeysState`
  - `function pressKey(state: KeysState, expected: string, char: string): KeysState`
  - `function isKeysComplete(state: KeysState, total: number): boolean`
  - `const typingKeys: ActivityType<TypingKeysConfig, TypingKeysResponse>`

- [ ] **Step 1: Write the failing test**

Create `src/activities/typing-keys/state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { initialKeysState, isKeysComplete, pressKey } from "./state";

describe("Key Camp state", () => {
  it("advances on the right key and banks a clean prompt", () => {
    const next = pressKey(initialKeysState(), "f", "f");
    expect(next.index).toBe(1);
    expect(next.retries).toBe(0);
    expect(next.done).toEqual([{ key: "f", ok: true, retries: 0 }]);
  });

  it("counts a wrong key as a retry and stays put — no penalty, no advance", () => {
    const next = pressKey(initialKeysState(), "f", "d");
    expect(next.index).toBe(0);
    expect(next.retries).toBe(1);
    expect(next.done).toEqual([]);
  });

  it("carries the retry count onto the prompt it belongs to", () => {
    let state = initialKeysState();
    state = pressKey(state, "f", "d");
    state = pressKey(state, "f", "g");
    state = pressKey(state, "f", "f");
    expect(state.done).toEqual([{ key: "f", ok: true, retries: 2 }]);
    expect(state.retries).toBe(0);
  });

  it("is case-forgiving: a stray CapsLock must not fail a lowercase drill", () => {
    expect(pressKey(initialKeysState(), "f", "F").index).toBe(1);
  });

  it("still demands the shift when the drill IS the capital", () => {
    expect(pressKey(initialKeysState(), "F", "f").index).toBe(0);
    expect(pressKey(initialKeysState(), "F", "F").index).toBe(1);
  });

  it("caps retries so a mashed keyboard cannot overflow the response schema", () => {
    let state = initialKeysState();
    for (let i = 0; i < 30; i += 1) state = pressKey(state, "f", "d");
    expect(state.retries).toBe(20);
  });

  it("knows when the drill is finished", () => {
    const state = { index: 4, retries: 0, done: [] };
    expect(isKeysComplete(state, 4)).toBe(true);
    expect(isKeysComplete(state, 5)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/activities/typing-keys/state.test.ts`
Expected: FAIL — `Cannot find module './state'`.

- [ ] **Step 3: Implement `state.ts`**

```ts
import type { TypingKeysResponse } from "./logic";

/**
 * Key Camp's rules as a pure reducer, so every case is testable in the node
 * test environment. The Player owns painting and focus; it owns nothing else.
 */
export interface KeysState {
  index: number;
  retries: number;
  done: TypingKeysResponse["prompts"];
}

/** Matches the response schema's ceiling — a mashed keyboard must not overflow it. */
const MAX_RETRIES = 20;

export function initialKeysState(): KeysState {
  return { index: 0, retries: 0, done: [] };
}

/**
 * Case-forgiving when the target is lowercase (a stray CapsLock is not a
 * mistake worth failing a child over), exact when the target is a capital —
 * because then reaching for shift IS the skill.
 */
function matches(expected: string, char: string): boolean {
  if (expected === expected.toLowerCase()) return char.toLowerCase() === expected;
  return char === expected;
}

export function pressKey(state: KeysState, expected: string, char: string): KeysState {
  if (!matches(expected, char)) {
    return { ...state, retries: Math.min(MAX_RETRIES, state.retries + 1) };
  }
  return {
    index: state.index + 1,
    retries: 0,
    done: [...state.done, { key: expected, ok: true, retries: state.retries }],
  };
}

export function isKeysComplete(state: KeysState, total: number): boolean {
  return state.index >= total;
}
```

- [ ] **Step 4: Implement the Player**

Create `src/activities/typing-keys/Player.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { TypingKeysConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { Prompt, ProgressHint } from "../_shared/ActivityChrome";
import { useActivity } from "../_shared/useActivity";
import { useSpeakOnce } from "../_shared/useSpeakOnce";
import { useSpeech } from "../_shared/useSpeech";
import { KeyboardMap } from "../_shared/typing/KeyboardMap";
import { TypingStage } from "../_shared/typing/TypingStage";
import { useTypingKeys } from "../_shared/typing/useTypingKeys";
import { expectedPrompts, schema, type TypingKeysResponse } from "./logic";
import { initialKeysState, isKeysComplete, pressKey } from "./state";

export function TypingKeysPlayer({
  config,
  onComplete,
}: ActivityPlayerProps<TypingKeysConfig, TypingKeysResponse>) {
  const parsed = useActivity(schema, config);
  const speech = useSpeech();
  const prompts = expectedPrompts(parsed);
  const [state, setState] = useState(initialKeysState);
  const complete = isKeysComplete(state, prompts.length);
  const target = complete ? null : (prompts[state.index] ?? null);

  useSpeakOnce(speech.speak, parsed.instruction);

  useTypingKeys((intent) => {
    if (intent.type !== "char" || target === null) return;
    const next = pressKey(state, target, intent.char);
    setState(next);
    if (isKeysComplete(next, prompts.length)) onComplete({ prompts: next.done });
  }, !complete);

  return (
    <TypingStage>
      <div className="flex flex-col items-center gap-8">
        <Prompt speech={speech} instruction={parsed.instruction} />
        <p className="text-6xl font-bold text-ink" aria-live="polite">
          {target === null ? "🎉" : target === " " ? "space" : target.toUpperCase()}
        </p>
        {(parsed.showHands ?? true) && <KeyboardMap target={target} />}
        <ProgressHint>
          {Math.min(state.index + 1, prompts.length)} of {prompts.length}
        </ProgressHint>
      </div>
    </TypingStage>
  );
}
```

- [ ] **Step 5: Register the Player**

Create `src/activities/typing-keys/index.ts`:

```ts
import type { TypingKeysConfig } from "@/content/activity-configs";
import type { ActivityType } from "@/content/types";
import { TypingKeysPlayer } from "./Player";
import {
  responseSchema,
  schema,
  score,
  skillsAffected,
  validateGenerated,
  type TypingKeysResponse,
} from "./logic";

/** Key Camp: a calm, clockless drill on one set of keys. */
export const typingKeys: ActivityType<TypingKeysConfig, TypingKeysResponse> = {
  kind: "typing-keys",
  label: "Key Camp",
  schema,
  responseSchema,
  Player: TypingKeysPlayer,
  score,
  skillsAffected,
  validateGenerated,
};
export type { TypingKeysResponse };
```

In `src/activities/index.ts`, add the import and the `registerActivityType(typingKeys);` call.

- [ ] **Step 6: Run the tests**

Run: `bun run test && bun run typecheck && bun run lint`
Expected: PASS, including `src/activities/index.test.ts` (no orphan kinds).

- [ ] **Step 7: Commit**

```bash
git add src/activities
git commit -m "feat(typing): add the Key Camp player"
```

---

### Task 8: `typing-catch` — schema, scoring, and full registration

Same rationale as Task 6: the exhaustive records force this to land as one unit.

**Files:**
- Create: `src/content/activity-configs/typing-catch.ts`
- Create: `src/activities/typing-catch/logic.ts`
- Create: `src/activities/typing-catch/logic.test.ts`
- Modify: `src/content/activity-configs.ts`, `src/content/types.ts`, `src/activities/definitions.ts`, `src/lib/admin/editor-model.ts`, `src/content/activity-configs.test.ts`, `src/activities/index.test.ts`

**Interfaces:**
- Consumes: `isTeachableKey`, `skillsForTargets` (Task 2).
- Produces:
  - `typingCatchConfig` / `type TypingCatchConfig`
  - `const FALL_SECONDS: Record<"gentle" | "steady" | "zippy", number>`
  - `function spawnIntervalMs(config: TypingCatchConfig): number`
  - `function maxPrompts(config: TypingCatchConfig): number`
  - `responseSchema` / `type TypingCatchResponse`
  - `score`, `skillsAffected`, `validateGenerated`

- [ ] **Step 1: Write the failing test**

Create `src/activities/typing-catch/logic.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { TypingCatchConfig } from "@/content/activity-configs";
import { maxPrompts, score, skillsAffected, spawnIntervalMs, validateGenerated } from "./logic";

const CONFIG: TypingCatchConfig = {
  instruction: "Pop the stars!",
  pool: ["a", "s", "d", "f"],
  durationSec: 40,
  lives: 3,
  speed: "gentle",
};

function round(spec: { text: string; ok: boolean }[], endedBy: "time" | "lives" = "time") {
  return {
    prompts: spec.map((s) => ({ ...s, ms: 1_000 })),
    endedBy,
    elapsedMs: 40_000,
  };
}

describe("pacing", () => {
  it("spawns twice per fall, so at most two stars share the sky", () => {
    expect(spawnIntervalMs(CONFIG)).toBe(4_000);
    expect(spawnIntervalMs({ ...CONFIG, speed: "zippy" })).toBe(1_500);
  });

  it("bounds how many stars a round could possibly have shown", () => {
    expect(maxPrompts(CONFIG)).toBe(12);
  });
});

describe("score", () => {
  it("scores catches against everything that fell", () => {
    const result = score(
      CONFIG,
      round([
        { text: "a", ok: true },
        { text: "s", ok: true },
        { text: "d", ok: true },
        { text: "f", ok: true },
      ]),
    );
    expect(result.correct).toBe(4);
    expect(result.total).toBe(4);
    expect(result.stars).toBe(3);
    expect(result.skillEvidence).toEqual([
      { skill: "typing.keys.home-row", outcome: "solid" },
    ]);
  });

  it("still records evidence when the round ended on hearts", () => {
    const result = score(
      CONFIG,
      round(
        [
          { text: "a", ok: true },
          { text: "s", ok: true },
          { text: "d", ok: false },
          { text: "f", ok: false },
        ],
        "lives",
      ),
    );
    expect(result.correct).toBe(2);
    expect(result.stars).toBe(2);
    expect(result.skillEvidence).toEqual([
      { skill: "typing.keys.home-row", outcome: "emerging" },
    ]);
  });

  it("never awards zero stars for finishing", () => {
    const result = score(CONFIG, round([{ text: "a", ok: false }], "lives"));
    expect(result.stars).toBe(1);
  });

  it("yields no evidence for a target that was never in the pool", () => {
    const result = score(CONFIG, round([{ text: "z", ok: true }]));
    expect(result.correct).toBe(0);
    expect(result.skillEvidence).toEqual([]);
  });

  it("yields no evidence for more catches than the round could have shown", () => {
    const forged = round(Array.from({ length: 13 }, () => ({ text: "a", ok: true })));
    expect(score(CONFIG, forged).skillEvidence).toEqual([]);
  });

  it("ignores the client's clock entirely — WPM must never reach mastery", () => {
    const honest = score(CONFIG, round([{ text: "a", ok: true }]));
    const lying = score(CONFIG, {
      ...round([{ text: "a", ok: true }]),
      elapsedMs: 1,
    });
    expect(lying).toEqual(honest);
  });
});

describe("skillsAffected", () => {
  it("derives from the pool", () => {
    expect(skillsAffected(CONFIG)).toEqual(["typing.keys.home-row"]);
    expect(skillsAffected({ ...CONFIG, pool: ["a", "q"] })).toEqual([
      "typing.keys.home-row",
      "typing.keys.top-row",
    ]);
  });
});

describe("validateGenerated", () => {
  it("accepts a teachable pool", () => {
    expect(validateGenerated(CONFIG)).toBeNull();
  });

  it("rejects an untaught target", () => {
    expect(validateGenerated({ ...CONFIG, pool: ["a", "7"] })).toBe("untaught key: 7");
  });

  it("rejects a duplicated target", () => {
    expect(validateGenerated({ ...CONFIG, pool: ["a", "a"] })).toBe("duplicate target: a");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/activities/typing-catch`
Expected: FAIL — `Cannot find module './logic'`.

- [ ] **Step 3: Create the config schema**

Create `src/content/activity-configs/typing-catch.ts`:

```ts
import { z } from "zod";

export const typingCatchConfig = z
  .object({
    instruction: z.string().trim().min(1).max(240),
    /** Single characters in slice 1; word targets arrive with slice 2. */
    pool: z.array(z.string().length(1)).min(2).max(24),
    durationSec: z.number().int().min(30).max(90).default(45),
    lives: z.number().int().min(1).max(5).default(3),
    speed: z.enum(["gentle", "steady", "zippy"]).default("gentle"),
  })
  .strict();
export type TypingCatchConfig = z.input<typeof typingCatchConfig>;
```

- [ ] **Step 4: Implement the logic**

Create `src/activities/typing-catch/logic.ts`:

```ts
import { typingCatchConfig, type TypingCatchConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import { z } from "zod";
import { isTeachableKey, skillsForTargets } from "../_shared/typing/keys";
import {
  evenSkillEvidence,
  outcomeFromAccuracy,
  starsFromAccuracy,
} from "../_shared/scoring";

/** Server-safe schema + scoring for typing-catch. No "use client". */
export const schema = typingCatchConfig;

/** Seconds a star takes to drift from the top of the sky to the ground. */
export const FALL_SECONDS = { gentle: 8, steady: 5, zippy: 3 } as const;

const DEFAULT_DURATION_SEC = 45;
const DEFAULT_SPEED = "gentle";
/** Slack for the last star already falling when the timer runs out. */
const SPAWN_SLACK = 2;

/** Two spawns per fall, so at most two stars share the sky. */
export function spawnIntervalMs(config: TypingCatchConfig): number {
  return (FALL_SECONDS[config.speed ?? DEFAULT_SPEED] / 2) * 1_000;
}

/**
 * The most stars a round of this length could physically have shown. Scoring
 * needs this because a timed round has no fixed prompt count: without a ceiling,
 * a one-prompt response would read as a flawless round.
 */
export function maxPrompts(config: TypingCatchConfig): number {
  const durationMs = (config.durationSec ?? DEFAULT_DURATION_SEC) * 1_000;
  return Math.ceil(durationMs / spawnIntervalMs(config)) + SPAWN_SLACK;
}

/**
 * §8: every recorded target is one the config itself authored, so this carries
 * no free child input. `ms` is client-measured and feeds display only — `score`
 * never reads it.
 */
export const responseSchema = z
  .object({
    prompts: z
      .array(
        z
          .object({
            text: z.string().min(1).max(12),
            ok: z.boolean(),
            ms: z.number().int().min(0).max(120_000),
          })
          .strict(),
      )
      .min(1)
      .max(120),
    endedBy: z.enum(["time", "lives"]),
    elapsedMs: z.number().int().min(0).max(180_000),
  })
  .strict();
export type TypingCatchResponse = z.infer<typeof responseSchema>;

export function score(
  config: TypingCatchConfig,
  response: TypingCatchResponse,
): ActivityScore {
  const pool = new Set(config.pool);
  const plausible =
    response.prompts.length <= maxPrompts(config) &&
    response.prompts.every((prompt) => pool.has(prompt.text));
  // Fail closed: an implausible round scores nothing and moves no mastery,
  // rather than being rejected outright — the child may simply have hit a bug,
  // and losing an attempt is worse than losing the evidence.
  if (!plausible) {
    return { correct: 0, total: response.prompts.length, stars: 1, skillEvidence: [] };
  }

  const caught = response.prompts.filter((prompt) => prompt.ok).length;
  const rate = caught / response.prompts.length;
  return {
    correct: caught,
    total: response.prompts.length,
    stars: starsFromAccuracy(rate),
    skillEvidence: evenSkillEvidence(skillsAffected(config), outcomeFromAccuracy(rate)),
  };
}

export function skillsAffected(config: TypingCatchConfig): SkillTag[] {
  return skillsForTargets(config.pool);
}

export function validateGenerated(config: TypingCatchConfig): string | null {
  const seen = new Set<string>();
  for (const target of config.pool) {
    if (!isTeachableKey(target)) return `untaught key: ${target}`;
    if (seen.has(target)) return `duplicate target: ${target}`;
    seen.add(target);
  }
  return null;
}
```

- [ ] **Step 5: Wire the five registration sites**

`src/content/activity-configs.ts` — import, `export *`, and `"typing-catch": typingCatchConfig,`.

`src/content/types.ts` — import `TypingCatchConfig` and add `| ActivityOf<"typing-catch", TypingCatchConfig>`.

`src/activities/definitions.ts` — `import * as typingCatch from "./typing-catch/logic";` and:

```ts
  "typing-catch": defineServerActivity("typing-catch", typingCatch, "response-validated"),
```

`src/lib/admin/editor-model.ts`:

```ts
    case "typing-catch":
      return {
        instruction: "Pop the stars!",
        pool: ["a", "s", "d", "f"],
        durationSec: 45,
        lives: 3,
        speed: "gentle",
      };
```

`src/content/activity-configs.test.ts` — `"typing-catch": typingCatchConfig,`.

`src/activities/index.test.ts` — `VALID_RESPONSES`:

```ts
  "typing-catch": {
    prompts: [{ text: "a", ok: true, ms: 900 }],
    endedBy: "time",
    elapsedMs: 45_000,
  },
```

and `OVER_BOUNDED_RESPONSES`:

```ts
  "typing-catch": {
    prompts: Array.from({ length: 121 }, () => ({ text: "a", ok: true, ms: 900 })),
    endedBy: "time",
    elapsedMs: 45_000,
  },
```

- [ ] **Step 6: Run the tests**

Run: `bun run test src/activities src/content && bun run typecheck`
Expected: PASS apart from the orphan-kind assertion in `src/activities/index.test.ts`, which Task 9 closes.

- [ ] **Step 7: Commit**

```bash
git add src/content src/activities src/lib/admin/editor-model.ts
git commit -m "feat(typing): add the typing-catch config, scoring, and server registration"
```

---

### Task 9: `typing-catch` — the Star Catch Player

**Files:**
- Create: `src/activities/typing-catch/state.ts`
- Create: `src/activities/typing-catch/state.test.ts`
- Create: `src/activities/typing-catch/Player.tsx`
- Create: `src/activities/typing-catch/index.ts`
- Modify: `src/activities/index.ts`

**Interfaces:**
- Consumes: `spawnIntervalMs`, `FALL_SECONDS`, `TypingCatchResponse` (Task 8); `TypingStage`, `useTypingKeys`, `useReducedMotion`.
- Produces:
  - `interface CatchTarget { id: number; text: string; spawnedMs: number }`
  - `interface CatchState { targets: CatchTarget[]; nextId: number; lives: number; results: TypingCatchResponse["prompts"]; lastSpawnMs: number; poolCursor: number }`
  - `function initialCatchState(config: TypingCatchConfig, nowMs: number): CatchState`
  - `function tick(state: CatchState, config: TypingCatchConfig, nowMs: number): CatchState`
  - `function typeChar(state: CatchState, config: TypingCatchConfig, char: string, nowMs: number): CatchState`
  - `function roundOver(state: CatchState, config: TypingCatchConfig, elapsedMs: number): "time" | "lives" | null`

- [ ] **Step 1: Write the failing test**

Create `src/activities/typing-catch/state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { TypingCatchConfig } from "@/content/activity-configs";
import { initialCatchState, roundOver, tick, typeChar } from "./state";

const CONFIG: TypingCatchConfig = {
  instruction: "Pop the stars!",
  pool: ["a", "s"],
  durationSec: 40,
  lives: 2,
  speed: "gentle", // 8s fall, 4s spawn interval
};

describe("Star Catch state", () => {
  it("spawns its first star immediately so the sky is never empty", () => {
    expect(initialCatchState(CONFIG, 0).targets).toHaveLength(1);
  });

  it("spawns on the interval, not on every tick", () => {
    let state = initialCatchState(CONFIG, 0);
    state = tick(state, CONFIG, 1_000);
    expect(state.targets).toHaveLength(1);
    state = tick(state, CONFIG, 4_000);
    expect(state.targets).toHaveLength(2);
  });

  it("cycles the pool deterministically rather than at random", () => {
    let state = initialCatchState(CONFIG, 0);
    state = tick(state, CONFIG, 4_000);
    state = tick(state, CONFIG, 8_000);
    expect(state.targets.map((t) => t.text)).toEqual(["a", "s", "a"]);
  });

  it("lands a star that was never typed, costing a heart", () => {
    let state = initialCatchState(CONFIG, 0);
    state = tick(state, CONFIG, 8_001);
    expect(state.lives).toBe(1);
    expect(state.results).toEqual([{ text: "a", ok: false, ms: 8_000 }]);
    expect(state.targets.some((t) => t.text === "a" && t.spawnedMs === 0)).toBe(false);
  });

  it("pops the matching star and banks the catch", () => {
    const state = typeChar(initialCatchState(CONFIG, 0), CONFIG, "a", 1_500);
    expect(state.targets).toHaveLength(0);
    expect(state.results).toEqual([{ text: "a", ok: true, ms: 1_500 }]);
    expect(state.lives).toBe(2);
  });

  it("costs nothing for a wrong key — a miss in the air is not a miss on the ground", () => {
    const state = typeChar(initialCatchState(CONFIG, 0), CONFIG, "z", 1_500);
    expect(state.lives).toBe(2);
    expect(state.results).toEqual([]);
    expect(state.targets).toHaveLength(1);
  });

  it("pops only the oldest match when two of the same letter are falling", () => {
    let state = initialCatchState(CONFIG, 0);
    state = tick(state, CONFIG, 4_000);
    state = tick(state, CONFIG, 8_000); // a, s, a
    state = typeChar(state, CONFIG, "a", 8_500);
    expect(state.results).toEqual([{ text: "a", ok: true, ms: 8_500 }]);
    expect(state.targets.map((t) => t.text)).toEqual(["s", "a"]);
  });

  it("is case-forgiving on a lowercase target", () => {
    const state = typeChar(initialCatchState(CONFIG, 0), CONFIG, "A", 1_000);
    expect(state.results).toEqual([{ text: "a", ok: true, ms: 1_000 }]);
  });

  it("ends on the clock", () => {
    const state = initialCatchState(CONFIG, 0);
    expect(roundOver(state, CONFIG, 39_000)).toBeNull();
    expect(roundOver(state, CONFIG, 40_000)).toBe("time");
  });

  it("ends when the last heart goes out", () => {
    const state = { ...initialCatchState(CONFIG, 0), lives: 0 };
    expect(roundOver(state, CONFIG, 1_000)).toBe("lives");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/activities/typing-catch/state.test.ts`
Expected: FAIL — `Cannot find module './state'`.

- [ ] **Step 3: Implement `state.ts`**

```ts
import type { TypingCatchConfig } from "@/content/activity-configs";
import { FALL_SECONDS, spawnIntervalMs, type TypingCatchResponse } from "./logic";

/**
 * Star Catch's rules as pure, CLOCK-INJECTED functions — every timing case is
 * unit-testable without a DOM or a fake timer. The Player owns only the
 * animation frame that supplies `nowMs`.
 */
export interface CatchTarget {
  id: number;
  text: string;
  spawnedMs: number;
}

export interface CatchState {
  targets: CatchTarget[];
  nextId: number;
  lives: number;
  results: TypingCatchResponse["prompts"];
  lastSpawnMs: number;
  poolCursor: number;
}

const DEFAULT_LIVES = 3;
const DEFAULT_SPEED = "gentle";
const DEFAULT_DURATION_SEC = 45;

function fallMs(config: TypingCatchConfig): number {
  return FALL_SECONDS[config.speed ?? DEFAULT_SPEED] * 1_000;
}

/**
 * The pool cycles in authored order rather than at random: a child gets every
 * key the same number of times, and a spec can assert what falls next.
 */
function spawn(state: CatchState, config: TypingCatchConfig, nowMs: number): CatchState {
  const text = config.pool[state.poolCursor % config.pool.length] ?? config.pool[0]!;
  return {
    ...state,
    targets: [...state.targets, { id: state.nextId, text, spawnedMs: nowMs }],
    nextId: state.nextId + 1,
    lastSpawnMs: nowMs,
    poolCursor: state.poolCursor + 1,
  };
}

export function initialCatchState(config: TypingCatchConfig, nowMs: number): CatchState {
  const empty: CatchState = {
    targets: [],
    nextId: 0,
    lives: config.lives ?? DEFAULT_LIVES,
    results: [],
    lastSpawnMs: nowMs,
    poolCursor: 0,
  };
  return spawn(empty, config, nowMs);
}

/** Land whatever has run out of sky, then spawn if the interval has elapsed. */
export function tick(
  state: CatchState,
  config: TypingCatchConfig,
  nowMs: number,
): CatchState {
  const deadline = nowMs - fallMs(config);
  const landed = state.targets.filter((target) => target.spawnedMs <= deadline);
  let next: CatchState = {
    ...state,
    targets: state.targets.filter((target) => target.spawnedMs > deadline),
    lives: Math.max(0, state.lives - landed.length),
    results: [
      ...state.results,
      ...landed.map((target) => ({ text: target.text, ok: false, ms: fallMs(config) })),
    ],
  };
  if (nowMs - next.lastSpawnMs >= spawnIntervalMs(config)) {
    next = spawn(next, config, nowMs);
  }
  return next;
}

/**
 * A wrong key costs nothing at all. Only a star reaching the ground dims a
 * heart — hunting for a key must never be punished, just untimely.
 */
export function typeChar(
  state: CatchState,
  config: TypingCatchConfig,
  char: string,
  nowMs: number,
): CatchState {
  const hit = state.targets.find(
    (target) => target.text.toLowerCase() === char.toLowerCase(),
  );
  if (!hit) return state;
  return {
    ...state,
    targets: state.targets.filter((target) => target.id !== hit.id),
    results: [...state.results, { text: hit.text, ok: true, ms: nowMs - hit.spawnedMs }],
  };
}

export function roundOver(
  state: CatchState,
  config: TypingCatchConfig,
  elapsedMs: number,
): "time" | "lives" | null {
  if (state.lives <= 0) return "lives";
  if (elapsedMs >= (config.durationSec ?? DEFAULT_DURATION_SEC) * 1_000) return "time";
  return null;
}
```

Note: `typeChar` finds the oldest match because `Array.find` returns the first
element and `targets` is append-ordered.

- [ ] **Step 4: Implement the Player**

Create `src/activities/typing-catch/Player.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { HeartIcon, StarIcon } from "@phosphor-icons/react/dist/ssr";
import type { TypingCatchConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { cn } from "@/lib/cn";
import { Prompt, ProgressHint } from "../_shared/ActivityChrome";
import { useActivity } from "../_shared/useActivity";
import { useReducedMotion } from "../_shared/useReducedMotion";
import { useSpeakOnce } from "../_shared/useSpeakOnce";
import { useSpeech } from "../_shared/useSpeech";
import { TypingStage } from "../_shared/typing/TypingStage";
import { useTypingKeys } from "../_shared/typing/useTypingKeys";
import { FALL_SECONDS, schema, type TypingCatchResponse } from "./logic";
import { initialCatchState, roundOver, tick, typeChar } from "./state";

const TICK_MS = 100;

export function TypingCatchPlayer({
  config,
  onComplete,
}: ActivityPlayerProps<TypingCatchConfig, TypingCatchResponse>) {
  const parsed = useActivity(schema, config);
  const speech = useSpeech();
  const reducedMotion = useReducedMotion();
  const [elapsedMs, setElapsedMs] = useState(0);
  const [state, setState] = useState(() => initialCatchState(parsed, 0));
  const finished = useRef(false);

  useSpeakOnce(speech.speak, parsed.instruction);

  // A single interval drives the round. The clock pauses on blur: a parent
  // taking the laptop must not cost hearts or corrupt the rate.
  useEffect(() => {
    let paused = document.hidden;
    const onVisibility = () => {
      paused = document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibility);
    const id = window.setInterval(() => {
      if (paused || finished.current) return;
      setElapsedMs((previous) => {
        const now = previous + TICK_MS;
        setState((current) => tick(current, parsed, now));
        return now;
      });
    }, TICK_MS);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [parsed]);

  useEffect(() => {
    if (finished.current) return;
    const endedBy = roundOver(state, parsed, elapsedMs);
    if (!endedBy) return;
    finished.current = true;
    onComplete({
      prompts: state.results.length > 0 ? state.results : [{ text: parsed.pool[0]!, ok: false, ms: 0 }],
      endedBy,
      elapsedMs,
    });
  }, [state, parsed, elapsedMs, onComplete]);

  useTypingKeys((intent) => {
    if (intent.type !== "char" || finished.current) return;
    setState((current) => typeChar(current, parsed, intent.char, elapsedMs));
  }, !finished.current);

  const fallMs = FALL_SECONDS[parsed.speed ?? "gentle"] * 1_000;
  const secondsLeft = Math.max(0, Math.ceil((parsed.durationSec ?? 45) - elapsedMs / 1_000));

  return (
    <TypingStage>
      <div className="flex flex-col items-center gap-6">
        <Prompt speech={speech} instruction={parsed.instruction} />
        <div className="flex items-center gap-6" aria-hidden>
          {Array.from({ length: parsed.lives ?? 3 }, (_, index) => (
            <HeartIcon
              key={index}
              size={32}
              weight={index < state.lives ? "fill" : "regular"}
              className={cn(index < state.lives ? "text-coral" : "text-ink-soft/30")}
            />
          ))}
          <span className="text-lg font-semibold text-ink">{secondsLeft}s</span>
        </div>

        {/* Reduced motion: no falling. The same targets queue up with a
            countdown, so the rules and the scoring are identical. */}
        <div
          className={cn(
            "relative w-full max-w-2xl",
            reducedMotion ? "flex flex-wrap justify-center gap-4 py-6" : "h-72 overflow-hidden",
          )}
        >
          {state.targets.map((target) => {
            const progress = Math.min(1, (elapsedMs - target.spawnedMs) / fallMs);
            return (
              <span
                key={target.id}
                data-falling={target.text}
                className={cn(
                  "grid size-16 place-items-center rounded-full bg-honey text-2xl font-bold text-ink",
                  !reducedMotion && "absolute left-1/2",
                )}
                style={
                  reducedMotion
                    ? undefined
                    : { top: `${progress * 100}%`, transform: "translateX(-50%)" }
                }
              >
                {target.text.toUpperCase()}
              </span>
            );
          })}
          {state.targets.length === 0 && (
            <StarIcon size={40} className="mx-auto text-honey/40" aria-hidden />
          )}
        </div>

        <ProgressHint>
          Caught {state.results.filter((result) => result.ok).length}
        </ProgressHint>
      </div>
    </TypingStage>
  );
}
```

- [ ] **Step 5: Register the Player**

Create `src/activities/typing-catch/index.ts` mirroring Task 7's `index.ts`, with
`kind: "typing-catch"`, `label: "Star Catch"`, and `Player: TypingCatchPlayer`.
Add the import and `registerActivityType(typingCatch);` to `src/activities/index.ts`.

- [ ] **Step 6: Run the full suite**

Run: `bun run test && bun run typecheck && bun run lint`
Expected: PASS, including the orphan-kind assertion.

- [ ] **Step 7: Commit**

```bash
git add src/activities
git commit -m "feat(typing): add the Star Catch player"
```

---

### Task 10: The Keyboard Club program, units 1–4

**Files:**
- Create: `src/content/programs/keyboard-club/home-base.ts`
- Create: `src/content/programs/keyboard-club/sky-row.ts`
- Create: `src/content/programs/keyboard-club/under-ground.ts`
- Create: `src/content/programs/keyboard-club/big-letters.ts`
- Create: `src/content/programs/keyboard-club.ts`
- Modify: `src/content/index.ts`
- Create: `src/content/programs/keyboard-club/keyboard-club.test.ts`

**Interfaces:**
- Consumes: both activity kinds; the six typing skills.
- Produces: `const keyboardClub: Program` exported from `src/content/programs/keyboard-club.ts`, added to `PROGRAMS`.

- [ ] **Step 1: Write the failing test**

Create `src/content/programs/keyboard-club/keyboard-club.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getServerActivityType } from "@/activities/definitions";
import { exactSkillRoutingIssue } from "@/activities/skill-routing";
import { keyboardClub } from "../keyboard-club";
import { isTeachableKey } from "@/activities/_shared/typing/keys";
import type { ActivityKind } from "@/content/activity-configs";

function activities() {
  return keyboardClub.units.flatMap((unit) =>
    unit.lessons.flatMap((lesson) =>
      lesson.activities.map((activity) => ({ unit, activity })),
    ),
  );
}

describe("Keyboard Club", () => {
  it("walks the keyboard in teaching order", () => {
    expect(keyboardClub.units.map((unit) => unit.id)).toEqual([
      "home-base",
      "sky-row",
      "under-ground",
      "big-letters",
    ]);
  });

  it("is made only of typing activities", () => {
    for (const { activity } of activities()) {
      expect(activity.kind.startsWith("typing-"), activity.id).toBe(true);
    }
  });

  it("routes every activity's skills EXACTLY — authored tags must equal runtime tags", () => {
    for (const { activity } of activities()) {
      expect(
        exactSkillRoutingIssue(activity.kind, activity.config, activity.skillTags),
        activity.id,
      ).toBeNull();
    }
  });

  it("never asks for a key the board does not teach", () => {
    for (const { activity } of activities()) {
      const definition = getServerActivityType(activity.kind as ActivityKind);
      const parsed = definition.schema.parse(activity.config);
      expect(definition.validateGenerated?.(parsed) ?? null, activity.id).toBeNull();
    }
  });

  it("teaches each unit's own row, and nothing a later unit has not reached yet", () => {
    const allowed: Record<string, string[]> = {
      "home-base": ["typing.keys.home-row"],
      "sky-row": ["typing.keys.home-row", "typing.keys.top-row"],
      "under-ground": [
        "typing.keys.home-row",
        "typing.keys.top-row",
        "typing.keys.bottom-row",
      ],
      "big-letters": [
        "typing.keys.home-row",
        "typing.keys.top-row",
        "typing.keys.bottom-row",
        "typing.keys.shift-space",
      ],
    };
    for (const { unit, activity } of activities()) {
      for (const tag of activity.skillTags) {
        expect(allowed[unit.id], `${activity.id} → ${tag}`).toContain(tag);
      }
    }
  });

  it("uses only teachable characters in every drill and pool", () => {
    for (const { activity } of activities()) {
      const targets =
        activity.kind === "typing-keys"
          ? (activity.config as { keys: string[] }).keys
          : (activity.config as { pool: string[] }).pool;
      for (const target of targets) expect(isTeachableKey(target), target).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/content/programs/keyboard-club`
Expected: FAIL — `Cannot find module '../keyboard-club'`.

- [ ] **Step 3: Author unit 1**

Create `src/content/programs/keyboard-club/home-base.ts`:

```ts
import type { Unit } from "../../types";

// ── Unit 1 · Home Base ────────────────────────────────────────────────
// The home row and the F/J bumps. Every drill here is home-row only, so
// `skillsAffected` resolves to exactly ["typing.keys.home-row"] and the
// authored tags match it (skill-routing demands set equality, not subset).
export const homeBaseUnit: Unit = {
  id: "home-base",
  order: 1,
  title: "Home Base",
  emoji: "🏠",
  world: "sunshine",
  bigIdea: "Your fingers have a home. Two little bumps tell them where it is.",
  phonicsFocus: "",
  mathFocus: "",
  project: "Rest all eight fingers on the home row and find the bumps with your eyes closed.",
  lessons: [
    {
      id: "home-meet",
      order: 1,
      title: "Meet the Home Row",
      activities: [
        {
          id: "home-fj",
          kind: "typing-keys",
          title: "Find the bumps",
          blurb: "F and J have little bumps. Your pointer fingers live there.",
          estMinutes: 3,
          band: "ready",
          skillTags: ["typing.keys.home-row"],
          config: {
            instruction: "Press the key that is glowing. Feel for the little bump!",
            keys: ["f", "j"],
            reps: 3,
          },
        },
        {
          id: "home-left",
          kind: "typing-keys",
          title: "Left hand home",
          blurb: "A, S, D, F — one key for each left finger.",
          estMinutes: 4,
          band: "ready",
          skillTags: ["typing.keys.home-row"],
          config: {
            instruction: "Press the glowing key with your left hand.",
            keys: ["a", "s", "d", "f"],
            reps: 2,
          },
        },
        {
          id: "home-right",
          kind: "typing-keys",
          title: "Right hand home",
          blurb: "J, K, L and the semicolon — one key for each right finger.",
          estMinutes: 4,
          band: "ready",
          skillTags: ["typing.keys.home-row"],
          config: {
            instruction: "Press the glowing key with your right hand.",
            keys: ["j", "k", "l", ";"],
            reps: 2,
          },
        },
      ],
    },
    {
      id: "home-catch",
      order: 2,
      title: "Home Row Catch",
      activities: [
        {
          id: "home-catch-gentle",
          kind: "typing-catch",
          title: "Star Catch: home row",
          blurb: "Pop each star before it lands.",
          estMinutes: 3,
          band: "ready",
          skillTags: ["typing.keys.home-row"],
          config: {
            instruction: "Type the letter on each star to pop it!",
            pool: ["a", "s", "d", "f", "j", "k", "l"],
            durationSec: 45,
            lives: 3,
            speed: "gentle",
          },
        },
        {
          id: "home-catch-steady",
          kind: "typing-catch",
          title: "Star Catch: a little faster",
          blurb: "Same stars, falling a bit quicker.",
          estMinutes: 3,
          band: "stretch",
          skillTags: ["typing.keys.home-row"],
          config: {
            instruction: "Type the letter on each star to pop it!",
            pool: ["a", "s", "d", "f", "j", "k", "l"],
            durationSec: 45,
            lives: 3,
            speed: "steady",
          },
        },
      ],
    },
  ],
};
```

- [ ] **Step 4: Author units 2–4**

Create the three remaining unit files following unit 1's structure exactly. Use
these ids, worlds, and configs:

`sky-row.ts` — `id: "sky-row"`, `order: 2`, `emoji: "☁️"`, `world: "space"`,
`bigIdea: "Reach up to the sky row, then come straight back home."`,
`project: "Reach up for a letter and come back to the bumps without looking."`
- Lesson `sky-reach` (order 1):
  - `sky-left` · typing-keys · keys `["q","w","e","r","t"]` · reps 2 · tags `["typing.keys.top-row"]` · instruction "Reach up with your left hand, then come back home."
  - `sky-right` · typing-keys · keys `["y","u","i","o","p"]` · reps 2 · tags `["typing.keys.top-row"]` · instruction "Reach up with your right hand, then come back home."
- Lesson `sky-catch` (order 2):
  - `sky-catch-top` · typing-catch · pool `["q","w","e","r","t","y","u","i","o","p"]` · durationSec 45 · lives 3 · speed `"gentle"` · tags `["typing.keys.top-row"]`
  - `sky-catch-mixed` · typing-catch · pool `["a","s","d","f","q","w","e","r"]` · durationSec 45 · lives 3 · speed `"gentle"` · band `"stretch"` · tags `["typing.keys.home-row","typing.keys.top-row"]`

`under-ground.ts` — `id: "under-ground"`, `order: 3`, `emoji: "🌱"`, `world: "garden"`,
`bigIdea: "Reach down to the bottom row, then come straight back home."`,
`project: "Reach down for a letter and come back to the bumps without looking."`
- Lesson `under-reach` (order 1):
  - `under-left` · typing-keys · keys `["z","x","c","v","b"]` · reps 2 · tags `["typing.keys.bottom-row"]`
  - `under-right` · typing-keys · keys `["n","m"]` · reps 3 · tags `["typing.keys.bottom-row"]`
- Lesson `under-catch` (order 2):
  - `under-catch-bottom` · typing-catch · pool `["z","x","c","v","b","n","m"]` · durationSec 45 · lives 3 · speed `"gentle"` · tags `["typing.keys.bottom-row"]`
  - `under-catch-all` · typing-catch · pool `["a","s","d","f","q","w","z","x","n","m"]` · durationSec 60 · lives 3 · speed `"gentle"` · band `"stretch"` · tags `["typing.keys.home-row","typing.keys.top-row","typing.keys.bottom-row"]`

`big-letters.ts` — `id: "big-letters"`, `order: 4`, `emoji: "🎪"`, `world: "bigtop"`,
`bigIdea: "Thumbs make the spaces. Shift makes the big letters."`,
`project: "Type your name with a big letter at the front."`
- Lesson `big-space` (order 1):
  - `big-thumb` · typing-keys · keys `[" "]` · reps 3 · tags `["typing.keys.shift-space"]` · instruction "Press the long space bar with your thumb."
- Lesson `big-shift` (order 2):
  - `big-caps-left` · typing-keys · keys `["A","S","D","F"]` · reps 2 · tags `["typing.keys.shift-space"]` · instruction "Hold shift with your other hand to make a big letter."
  - `big-caps-catch` · typing-catch · pool `["A","S","D","F","J","K"]` · durationSec 45 · lives 3 · speed `"gentle"` · band `"stretch"` · tags `["typing.keys.shift-space"]`

**Check while authoring:** for `typing-keys`, `skillsAffected` returns the sorted
union of `skillForKey` over `keys`; for `typing-catch`, over `pool`. The
`skillTags` you author must be that exact set. The test from Step 1 catches any
mismatch, and so does `src/content/content.test.ts`.

- [ ] **Step 5: Assemble and register the program**

Create `src/content/programs/keyboard-club.ts`:

```ts
import type { Program } from "../types";
import { bigLettersUnit } from "./keyboard-club/big-letters";
import { homeBaseUnit } from "./keyboard-club/home-base";
import { skyRowUnit } from "./keyboard-club/sky-row";
import { underGroundUnit } from "./keyboard-club/under-ground";

/**
 * Program 03 — Keyboard Club.
 *
 * Units walk the keyboard by row, because that is how a hand learns it: anchor
 * at the bumps, reach up, reach down, then add space and shift. Word typing
 * arrives in slice 2, once every letter is reachable.
 *
 * This is the one program that requires a physical keyboard; every Player
 * renders through `TypingStage`, which explains itself on a tablet rather than
 * degrading into a game that cannot teach typing.
 */
export const keyboardClub: Program = {
  slug: "keyboard-club",
  title: "Keyboard Club",
  subtitle: "Teach your fingers where the letters live",
  ageBand: "Ages 6–8 · needs a computer keyboard",
  summary:
    "A keyboard is a map, and your fingers can learn it by heart. Start at the two little bumps, reach up to the sky row and down to the ground, then add spaces and big letters — a few minutes at a time, until you stop hunting for keys.",
  units: [homeBaseUnit, skyRowUnit, underGroundUnit, bigLettersUnit],
};
```

In `src/content/index.ts`, add the import and extend `PROGRAMS`:

```ts
import { keyboardClub } from "./programs/keyboard-club";
// …
export const PROGRAMS: Program[] = [kaelynAdaptive, worldLanguages, keyboardClub];
```

- [ ] **Step 6: Run the full suite**

Run: `bun run test && bun run typecheck && bun run lint && bun run build`
Expected: PASS. `src/content/content.test.ts` now validates the new program's
configs, unique ids, and skill resolution automatically.

- [ ] **Step 7: Commit**

```bash
git add src/content
git commit -m "feat(typing): add the Keyboard Club program, units 1-4"
```

---

### Task 11: End-to-end specs

**Files:**
- Create: `e2e/specs/typing.spec.ts`

**Interfaces:**
- Consumes: the deployed app. Specs run guest (the `public` project) — the
  program picker shows every program to guests and typing Players call no gated
  learner API.

- [ ] **Step 1: Write the spec**

Create `e2e/specs/typing.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

const KEY_CAMP = "/learn/keyboard-club/home-base/home-fj";
const STAR_CATCH = "/learn/keyboard-club/home-base/home-catch-gentle";

test("the gate asks for a real keypress before revealing the drill", async ({ page }) => {
  await page.goto(KEY_CAMP);

  await expect(page.getByText("Press the")).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('[data-key="f"]')).toHaveCount(0);

  await page.keyboard.press("f");
  await expect(page.locator('[data-key="f"]')).toBeVisible();
});

test("Key Camp advances only on the right key and never punishes a wrong one", async ({
  page,
}) => {
  await page.goto(KEY_CAMP);
  await page.keyboard.press("f");

  await expect(page.getByText("1 of 6")).toBeVisible();
  const target = page.locator('[data-target="true"]');
  await expect(target).toHaveAttribute("data-key", "f");

  // A wrong key holds position — no penalty, no advance.
  await page.keyboard.press("d");
  await expect(page.getByText("1 of 6")).toBeVisible();
  await expect(target).toHaveAttribute("data-key", "f");

  await page.keyboard.press("f");
  await expect(page.getByText("2 of 6")).toBeVisible();
  await expect(page.locator('[data-target="true"]')).toHaveAttribute("data-key", "j");
});

test("Key Camp completes the whole drill and reports a finish", async ({ page }) => {
  await page.goto(KEY_CAMP);
  await page.keyboard.press("f");

  for (const key of ["f", "j", "f", "j", "f", "j"]) {
    await page.keyboard.press(key);
  }

  await expect(page.getByRole("button", { name: /again|next|keep going/i }).first()).toBeVisible({
    timeout: 15_000,
  });
});

test("Star Catch pops a falling star when its letter is typed", async ({ page }) => {
  await page.goto(STAR_CATCH);
  await page.keyboard.press("f");

  const star = page.locator("[data-falling]").first();
  await expect(star).toBeVisible({ timeout: 15_000 });
  const letter = await star.getAttribute("data-falling");
  expect(letter).not.toBeNull();

  await page.keyboard.press(letter!);
  await expect(page.getByText("Caught 1")).toBeVisible();
});

test("a touch-only device is told to come back on a computer", async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 820, height: 1180 },
  });
  const page = await context.newPage();
  await page.goto(KEY_CAMP);

  await expect(page.getByText("Typing needs a keyboard")).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('[data-key="f"]')).toHaveCount(0);

  await context.close();
});
```

- [ ] **Step 2: Run the specs against a local build**

```bash
bun run build && bun run start &
E2E_BASE_URL=http://localhost:3000 bun run test:e2e e2e/specs/typing.spec.ts
```
Expected: PASS. If the completion-button name assertion in spec 3 does not match
the real activity-host chrome, open the host at `src/app/(learner)/learn/[programSlug]/[unitId]/[activityId]/page.tsx`, read the actual
control label, and assert on that instead. Do not weaken the assertion to a bare
`toBeVisible()` on the page body.

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/typing.spec.ts
git commit -m "test(typing): add end-to-end specs for the gate, Key Camp, and Star Catch"
```

---

### Task 12: Ship gate and deploy notes

**Files:**
- Modify: `CLAUDE.md` (Directory Structure section — add the typing toolkit and kinds)

- [ ] **Step 1: Run the full gate**

Run: `bun run lint && bun run typecheck && bun run test && bun run build && bun run audit:dead-code`
Expected: all green, knip baseline clean.

- [ ] **Step 2: Update the project doc**

In `CLAUDE.md`, add to the Directory Structure block under `src/`:

```
├── activities/
│   ├── _shared/typing/   # keyboard gate, key/finger map, keydown hardening
│   ├── typing-keys/      # Key Camp drill
│   └── typing-catch/     # Star Catch arcade
```

- [ ] **Step 3: Commit and open the PR**

```bash
git add CLAUDE.md
git commit -m "docs: note the typing toolkit in the directory map"
git push -u origin feat/typing-tutor
```

Open the PR with a body covering: the four PRODUCT.md exceptions and why they are
scoped to `keyboard-club`; the keystroke-privacy contract; that WPM never reaches
`score()`; the three slice-1 narrowings from Global Constraints; and that there is
**no migration**.

- [ ] **Step 4: Post-merge deploy checklist**

Not code — record in the PR body:
1. Deploy rolls via ArgoCD (Forgejo `*/15` cron → Harbor → SHA pin).
2. **Re-run `seed-content` in prod** — content is DB-preferred, and `keyboard-club` is new content.
3. Enroll the pilot learner in `keyboard-club` from the parent curriculum page.
4. Canary: load `/learn/keyboard-club/home-base/home-fj` on a laptop, press F, complete the drill; confirm the attempt lands and the parent report shows a **Keyboard Club** row.

---

## Self-Review

**Spec coverage:** domain + rubric → Task 1; parent row → Task 1; key geography and gate → Tasks 2–5; `typing-keys` → Tasks 6–7; `typing-catch` → Tasks 8–9; program units 1–4 → Task 10; reduced-motion branch → Task 9 Player; input hardening → Task 3; scoring integrity ceiling → Task 8; privacy contract → response schemas in Tasks 6 and 8; skill-set equality → Tasks 2, 6, 8, 10; blur pause → Task 9; e2e → Task 11; seed re-run → Task 12. Slice-1 spec items **deliberately deferred and recorded in Global Constraints**: word targets in Star Catch, `ms` on Key Camp responses, the `keyboard-club` content-hash lock.

**Not covered by slice 1, by design:** `typing-write`, `typing-race`, `typing-echo`, unit 5, the parent typing panel, and the per-key heatmap — all slice 2 and 3.

**Type consistency:** `skillsForTargets` is the single skill-derivation entry point used by both kinds' `skillsAffected`. `expectedPrompts` is shared by the Key Camp Player and its scoring. `TypingCatchResponse["prompts"]` is the element type of `CatchState.results`, so the Player hands `onComplete` exactly what the schema expects. `spawnIntervalMs` and `FALL_SECONDS` live in `logic.ts` and are imported by `state.ts`, never redefined.
