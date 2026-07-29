# Keyboard Club Slice 2 — Words (typing-write, typing-race, Word Workshop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the two word-typing kinds — `typing-write` (Word Write: copy/spelling typing, see + hear modes) and `typing-race` (Rocket Race: sustained rate against a friendly pacer) — plus unit 5 "Word Workshop" and an early home-row word lesson in Home Base, producing the program's first `typing.words.familiar` and `typing.fluency.rate` evidence.

**Architecture:** Both kinds share one pure, clock-injected word-typing reducer in `src/activities/_shared/typing/wordType.ts` that consumes the existing `KeyIntent` stream from `useTypingKeys` and produces §8-safe per-item results (`{ i, ok, ms, retries, missedExpected }` — only *expected* characters are ever recorded; the typed buffer is client-only display state discarded on unmount). Server logic follows the slice-1 fail-closed pattern: `score()` re-derives plausibility from config and returns zero evidence for anything implausible. Players are thin `<TypingStage>` shells around an inner round, exactly like Key Camp and Star Catch. The window-blur/hidden pause store is promoted from `typing-catch/` to `_shared/typing/` so the race clock pauses honestly.

**Tech Stack:** Next.js 16 / React 19 / TypeScript strict, zod, vitest, Playwright, Tailwind v4 (Wonder Studio tokens), Phosphor icons, bun only.

## Global Constraints

Copied from the design spec (`docs/superpowers/specs/2026-07-28-typing-tutor-design.md`), CLAUDE.md, and the slice-1 rulings — every task's requirements implicitly include these:

- **bun only.** Never npm/yarn/pnpm. Gates: `bun run lint && bun run typecheck && bun run test` green after every task; `bun run build` at slice end.
- **Never disable a linter rule** (`eslint-disable`, `@ts-ignore`). `eslint-plugin-react-hooks@7.1.1` has 13 rules at error, including `refs` (no ref writes during render), `set-state-in-effect`, and `purity`. Use `useEffectEvent` / `useSyncExternalStore` patterns as slice 1 does.
- **§8 keystroke privacy:** a response may carry only config-authored target text plus outcome/timing. `missedExpected` entries MUST be characters of the expected item, verified in `score()` (fail closed to zero evidence). The pressed key and the typed buffer never leave component state. Displaying the typed buffer on screen is sanctioned (spec: "Actual keys pressed and any free text stay in component state and are discarded when the activity unmounts").
- **Skill-set equality:** authored `skillTags` must EQUAL `skillsAffected(config)` — `exactSkillRoutingIssue` in `src/activities/skill-routing.ts` enforces it across every authored activity via `program-integrity.test.ts` and `keyboard-club.test.ts`.
- **`skillsForTargets` is the single derivation rule** (`src/activities/_shared/typing/keys.ts:100`): any multi-character target ⇒ `["typing.words.familiar"]`. Race adds `"typing.fluency.rate"` on top (Task 4).
- **Score never reads timing.** `ms`/`elapsedMs` are client-measured and indicative (display + slice-3 parent panel); evidence comes only from ok/retries counts.
- **Fail-closed scoring:** implausible response ⇒ `{ correct: 0, total, stars: 1, skillEvidence: [] }` — never a thrown error, never partial evidence. (`completionPolicy: "response-validated"` for both new kinds.)
- **No AI generation for typing kinds:** neither kind gets a `KIND_BRIEF` entry (`src/lib/ai/generable.ts:29` — `Partial<Record<ActivityKind, string>>`, absence = authored-only). If a test enumerates generable kinds, extend its authored-only expectations.
- **Build-safety:** no module-top-level `getDb()`/`getAuth()`/service connections. These tasks are all client/pure-server code; keep it that way.
- **Wonder Studio UI floor (slice-1 impeccable rulings, now day-one requirements):**
  - Kid interactive/illustrated elements carry the 2–3px ink storybook outline + `shadow-pop`.
  - Meaningful indicators need ≥3:1 contrast vs their background using **world-independent** tokens (`--color-accent*` resolves per world and fails in sunshine/garden — use `coral-deep`/ink tones; `--color-line-strong` is a hairline token that can never clear 3:1).
  - Text ≥4.5:1; animate transform/opacity only (never `top`/layout); reduced motion gets a real alternative path, not a kill;
  - decorative progress rows are `aria-hidden` (no name colliding with the 1–3 reward stars) with solid `ink-soft` empty strokes; progress the child can see (fill-up `StarShape`s, not a 14px numeral alone);
  - every Tailwind color class must resolve to a token in `globals.css` `@theme`; static class maps only.
- **Focus rule is settled:** `useTypingKeys` withholds Space/Enter only from keyboard-focused (`:focus-visible`) activatables. Do not add per-button opt-outs; do not regress it.
- **Icons:** Phosphor only.
- **Copy voice:** warm, concrete, can-do; "pointer finger" (never "index finger") in child-facing copy.
- Playwright e2e must stay truthful — update assertions to match reality, never weaken them; specs run against a live server by the controller.

### Interfaces inherited from slice 1 (verbatim, current head f68be8c)

```ts
// _shared/typing/typingKey.ts
export type KeyIntent =
  | { type: "ignore" }
  | { type: "char"; char: string; code: string; shiftKey: boolean }
  | { type: "backspace" };
export type TypingCharIntent = Extract<KeyIntent, { type: "char" }>;
export function classifyKeydown(event: KeydownLike): KeyIntent;
export function preventsDefault(event: KeydownLike): boolean;
export function matchesTypingTarget(
  expected: string,
  intent: Pick<TypingCharIntent, "char" | "shiftKey">,
): boolean; // lowercase expected: case-forgiving; capital expected: requires shiftKey

// _shared/typing/useTypingKeys.ts
export function useTypingKeys(onIntent: (intent: KeyIntent) => void, active: boolean): void;

// _shared/typing/keys.ts
export function isTeachableKey(char: string): boolean; // case-insensitive
export function skillsForTargets(targets: readonly string[]): SkillTag[];
// multi-char target present ⇒ ["typing.words.familiar"]

// _shared/typing/TypingStage.tsx
export function TypingStage({ children, onExit }: { children: ReactNode; onExit?: () => void });

// _shared/scoring.ts
export function starsFromAccuracy(firstTryRate: number): 0 | 1 | 2 | 3;
export function outcomeFromAccuracy(firstTryRate: number): SkillOutcome;
export function evenSkillEvidence(tags: SkillTag[], outcome: SkillOutcome): SkillEvidence[];

// _shared/useSpeech.ts / useTargetSpeech.ts / useSpeakOnce.ts
export function useSpeech(locale?: string): SpeechController; // .speak(text), .cancel(), .supported
export function useTargetSpeech(speech: SpeechController): {
  speakTarget: (text: string) => Promise<void>; unavailable: boolean; reset: () => void;
};
// useSpeakOnce(speak, message | null) — speaks once per non-null message value

// _shared/useActivity.ts
export function useActivity<T>(schema: ZodType<T>, config: unknown): T;

// content/types.ts
export interface ActivityPlayerProps<Config, Response> {
  config: Config;
  onComplete: (response: Response) => void;
  onExit?: () => void;
  learnerContext?: { learnerId: string /* … */ };
}

// typing-catch/useRoundPaused.ts (moves to _shared/typing in Task 5)
export function useRoundPaused(): boolean;      // document hidden OR window blurred
export function useDocumentHidden(): boolean;   // document hidden only (speech gating)
```

### Registration touchpoints (five per kind, per slice-1 precedent)

1. `src/content/activity-configs/typing-<kind>.ts` — zod config schema.
2. `src/content/activity-configs.ts` — import + `export *` + entry in `ACTIVITY_CONFIG_SCHEMAS` (this auto-derives `ActivityKind`), **and** `src/content/types.ts` — add `| ActivityOf<"typing-<kind>", Typing<Kind>Config>` to the `Activity` union (~line 72).
3. `src/activities/typing-<kind>/logic.ts` — registered in `src/activities/definitions.ts`: `defineServerActivity("typing-<kind>", typingKindModule, "response-validated")`.
4. `src/activities/typing-<kind>/index.ts` + `Player.tsx` — registered in `src/activities/index.ts` via `registerActivityType(...)`.
5. Activities authored into `src/content/programs/keyboard-club/` (Task 7).

### Locked decisions (do not relitigate mid-task; flag if impossible)

- **D1 — Word engine semantics.** Wrong characters DO enter the typed buffer (that is what backspace corrects). A *correction episode* — buffer diverges from the expected prefix, then backspaces return it to a clean prefix — counts **one retry**. `missedExpected` records the expected character at the first divergence position of each episode (unique per item). Typing past the item's end diverges without recording a miss (there is no expected char to record). Item `ok` ⇔ completed with `retries === 0` (equivalently `missedExpected` empty). Per-character matching uses `matchesTypingTarget` (CapsLock-forgiving lowercase; Shift-required capitals in sentences).
- **D2 — Race skills** = `[...skillsForTargets(config.words), "typing.fluency.rate"].sort()` ⇒ `["typing.fluency.rate", "typing.words.familiar"]`. Write = `skillsForTargets(config.items)` ⇒ `["typing.words.familiar"]`.
- **D3 — Race clock** starts at the first char intent of the first word; `elapsedMs` = final word completion − start; pauses (blur/hidden) freeze it. Live WPM is shown IN the round (`wpm.ts` re-added with this consumer). The reward screen swaps within a frame of `onComplete` (slice-1 lesson: an in-Player end card is near-unreachable), so there is no end card; the parent-panel WPM headline is slice 3.
- **D4 — typing-catch word pools stay OUT of slice 2** (multi-char mid-flight matching is its own mechanic). Update the stale comment in `src/content/activity-configs/typing-catch.ts:6` from "word targets arrive with slice 2" to "word targets are a slice-3 candidate".
- **D5 — Shared-tag lesson auto-completion inside Word Workshop is accepted**: all write lessons train `typing.words.familiar`, so one solid lesson can complete siblings. Same ruling as slice 1's Star Catch arcade (optional practice on the same skill). Do NOT invent per-lesson skills.
- **D6 — Early race lives in Home Base** (spec: "Home row alone yields enough real words for an early typing-race"). This also gives Playwright a guest-reachable route (only unit 1 is unlocked for a fresh guest).
- **D7 — Hear mode**: `useTargetSpeech(speech).speakTarget(word)`; a second miss episode (`retries >= 2` on the current item) reveals the word; `!speech.supported || targetSpeech.unavailable` reveals immediately (see-mode fallback) — mirror `sightword-game/Player.tsx`'s pattern including its unavailability notice copy style.

## File Structure

```
src/activities/_shared/typing/
  wordType.ts            # NEW  pure word reducer (Task 1)
  wordType.test.ts       # NEW
  roundPause.ts          # NEW  promoted pause stores (Task 5; moved from typing-catch/useRoundPaused.ts)
  roundPause.test.ts     # NEW  (moved tests)
  wpm.ts                 # RE-ADDED (Task 4, with its consumer in Task 6)
  wpm.test.ts            # RE-ADDED
src/content/activity-configs/
  typing-write.ts        # NEW  (Task 2)
  typing-race.ts         # NEW  (Task 4)
src/activities/typing-write/
  logic.ts / logic.test.ts / Player.tsx / Player.test.tsx / index.ts   # NEW (Tasks 2–3)
src/activities/typing-race/
  logic.ts / logic.test.ts / Player.tsx / Player.test.tsx / index.ts   # NEW (Tasks 4–6)
src/content/programs/keyboard-club/
  word-workshop.ts       # NEW  unit 5 (Task 7)
  home-base.ts           # MODIFIED  + "Home row words" lesson (Task 7)
  keyboard-club.test.ts  # MODIFIED  allowlists (Task 7)
src/content/programs/keyboard-club.ts        # MODIFIED  units array (Task 7)
src/content/activity-configs.ts, src/content/types.ts,
src/activities/definitions.ts, src/activities/index.ts   # MODIFIED (Tasks 2, 4)
src/content/program-integrity.test.ts        # MODIFIED  successfulResponse cases (Task 7)
e2e/specs/typing.spec.ts                     # MODIFIED  +3 specs (Task 8)
docs/architecture/STRUCTURE.md, CLAUDE.md    # MODIFIED  (Task 9)
```

---

### Task 1: The shared word-typing reducer

**Files:**
- Create: `src/activities/_shared/typing/wordType.ts`
- Test: `src/activities/_shared/typing/wordType.test.ts`

**Interfaces:**
- Consumes: `matchesTypingTarget`, `TypingCharIntent` from `./typingKey`.
- Produces (Tasks 3, 5, 6 rely on these exact names):

```ts
export interface TypedChar { char: string; ok: boolean }
export interface WordProgress {
  typed: TypedChar[];            // client-only; NEVER serialized (§8)
  retries: number;
  missedExpected: string[];      // unique expected chars, divergence-point per episode
  diverged: boolean;
  startedMs: number | null;
  completedMs: number | null;
}
export const BUFFER_SLACK = 2;   // max typed length = expected.length + BUFFER_SLACK
export function initialWordProgress(): WordProgress;
export function pressWordKey(state: WordProgress, expected: string, intent: Pick<TypingCharIntent, "char" | "shiftKey">, nowMs: number): WordProgress;
export function pressWordBackspace(state: WordProgress): WordProgress;
export function isWordComplete(state: WordProgress): boolean;   // completedMs !== null
export function wordItemResult(state: WordProgress, i: number): { i: number; ok: boolean; ms: number; retries: number; missedExpected: string[] };
```

- [ ] **Step 1: Write the failing tests** — `wordType.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  BUFFER_SLACK,
  initialWordProgress,
  isWordComplete,
  pressWordBackspace,
  pressWordKey,
  wordItemResult,
} from "./wordType";

const key = (char: string, shiftKey = false) => ({ char, shiftKey });

function type(word: string, expected: string, startMs = 1_000) {
  let s = initialWordProgress();
  let now = startMs;
  for (const ch of word) {
    s = pressWordKey(s, expected, key(ch), now);
    now += 200;
  }
  return s;
}

describe("pressWordKey", () => {
  it("completes a clean word with ok timing and no misses", () => {
    const s = type("cat", "cat");
    expect(isWordComplete(s)).toBe(true);
    expect(s.retries).toBe(0);
    expect(s.missedExpected).toEqual([]);
    expect(wordItemResult(s, 4)).toEqual({ i: 4, ok: true, ms: 400, retries: 0, missedExpected: [] });
  });

  it("is CapsLock-forgiving on lowercase words", () => {
    const s = type("CAT", "cat");
    expect(isWordComplete(s)).toBe(true);
    expect(s.missedExpected).toEqual([]);
  });

  it("requires Shift for a sentence capital", () => {
    const plain = pressWordKey(initialWordProgress(), "The cat", key("t"), 0);
    expect(plain.diverged).toBe(true);
    expect(plain.missedExpected).toEqual(["T"]);
    const shifted = pressWordKey(initialWordProgress(), "The cat", key("t", true), 0);
    expect(shifted.diverged).toBe(false);
  });

  it("records ONE missedExpected at the divergence point, not per wrong key", () => {
    let s = pressWordKey(initialWordProgress(), "cat", key("x"), 0);
    s = pressWordKey(s, "cat", key("y"), 100);
    expect(s.missedExpected).toEqual(["c"]);
    expect(s.typed.map((t) => t.ok)).toEqual([false, false]);
  });

  it("counts one retry per correction episode via backspace", () => {
    let s = pressWordKey(initialWordProgress(), "cat", key("c"), 0);
    s = pressWordKey(s, "cat", key("x"), 100);      // diverge
    s = pressWordBackspace(s);                        // clean again → 1 retry
    expect(s.retries).toBe(1);
    expect(s.diverged).toBe(false);
    s = pressWordKey(s, "cat", key("a"), 300);
    s = pressWordKey(s, "cat", key("t"), 400);
    expect(isWordComplete(s)).toBe(true);
    expect(wordItemResult(s, 0).ok).toBe(false);      // corrected, not first-try
  });

  it("dedupes missedExpected across episodes at the same position", () => {
    let s = pressWordKey(initialWordProgress(), "cat", key("x"), 0);
    s = pressWordBackspace(s);
    s = pressWordKey(s, "cat", key("z"), 200);
    expect(s.missedExpected).toEqual(["c"]);
    expect(s.retries).toBe(1);
  });

  it("diverges but records no miss when typing past the end", () => {
    let s = type("cat", "cat");
    // completed words ignore further keys entirely
    const after = pressWordKey(s, "cat", key("s"), 900);
    expect(after).toBe(s);
    // an over-typed UNfinished word: "ca" + "tt"
    let o = type("ca", "cat");
    o = pressWordKey(o, "cat", key("t"), 500);
    expect(isWordComplete(o)).toBe(true); // "cat" completes exactly at length
  });

  it("caps the buffer at expected.length + BUFFER_SLACK", () => {
    let s = pressWordKey(initialWordProgress(), "at", key("x"), 0);
    for (let i = 0; i < 10; i++) s = pressWordKey(s, "at", key("x"), 100 + i);
    expect(s.typed.length).toBe("at".length + BUFFER_SLACK);
  });

  it("backspace on empty or complete state is a no-op", () => {
    expect(pressWordBackspace(initialWordProgress())).toEqual(initialWordProgress());
    const done = type("cat", "cat");
    expect(pressWordBackspace(done)).toBe(done);
  });

  it("starts the clock on the first keystroke, not construction", () => {
    const s = pressWordKey(initialWordProgress(), "cat", key("c"), 5_000);
    expect(s.startedMs).toBe(5_000);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `bun run test src/activities/_shared/typing/wordType.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `wordType.ts`:

```ts
import { matchesTypingTarget, type TypingCharIntent } from "./typingKey";

/**
 * Pure, clock-injected word-typing engine shared by typing-write and
 * typing-race. §8: `typed` is client-only display state — a response is built
 * ONLY from `wordItemResult`, which carries expected-derived data (the missed
 * EXPECTED characters), never what the child actually pressed.
 */
export interface TypedChar { char: string; ok: boolean }

export interface WordProgress {
  typed: TypedChar[];
  retries: number;
  missedExpected: string[];
  diverged: boolean;
  startedMs: number | null;
  completedMs: number | null;
}

/** A couple of stray keys past the end still render; more are ignored. */
export const BUFFER_SLACK = 2;

export function initialWordProgress(): WordProgress {
  return { typed: [], retries: 0, missedExpected: [], diverged: false, startedMs: null, completedMs: null };
}

export function isWordComplete(state: WordProgress): boolean {
  return state.completedMs !== null;
}

export function pressWordKey(
  state: WordProgress,
  expected: string,
  intent: Pick<TypingCharIntent, "char" | "shiftKey">,
  nowMs: number,
): WordProgress {
  if (state.completedMs !== null) return state;
  const pos = state.typed.length;
  if (pos >= expected.length + BUFFER_SLACK) return state;

  const inWord = pos < expected.length;
  const ok = inWord && !state.diverged && matchesTypingTarget(expected[pos], intent);
  const typed = [...state.typed, { char: intent.char, ok }];

  // One miss per episode, recorded at the divergence point; typing past the
  // end has no expected character to record.
  const missedExpected =
    ok || state.diverged || !inWord || state.missedExpected.includes(expected[pos])
      ? state.missedExpected
      : [...state.missedExpected, expected[pos]];

  const diverged = state.diverged || !ok;
  const startedMs = state.startedMs ?? nowMs;
  const completed = !diverged && typed.length === expected.length;
  return {
    typed,
    retries: state.retries,
    missedExpected,
    diverged,
    startedMs,
    completedMs: completed ? nowMs : null,
  };
}

export function pressWordBackspace(state: WordProgress): WordProgress {
  if (state.completedMs !== null || state.typed.length === 0) return state;
  const typed = state.typed.slice(0, -1);
  const stillDiverged = typed.some((entry) => !entry.ok);
  return {
    ...state,
    typed,
    diverged: stillDiverged,
    retries: state.diverged && !stillDiverged ? state.retries + 1 : state.retries,
  };
}

export function wordItemResult(
  state: WordProgress,
  i: number,
): { i: number; ok: boolean; ms: number; retries: number; missedExpected: string[] } {
  const ms =
    state.completedMs !== null && state.startedMs !== null
      ? Math.max(0, state.completedMs - state.startedMs)
      : 0;
  return {
    i,
    ok: state.completedMs !== null && state.retries === 0 && state.missedExpected.length === 0,
    ms,
    retries: state.retries,
    missedExpected: [...state.missedExpected],
  };
}
```

- [ ] **Step 4: Run tests** — same file → PASS. Fix the reducer, never the semantics in D1, if they disagree.
- [ ] **Step 5: Commit** — `git add src/activities/_shared/typing/wordType.ts src/activities/_shared/typing/wordType.test.ts && git commit -m "feat: shared word-typing reducer for the slice-2 word kinds"`

---

### Task 2: typing-write — config schema, server logic, registration

**Files:**
- Create: `src/content/activity-configs/typing-write.ts`, `src/activities/typing-write/logic.ts`
- Modify: `src/content/activity-configs.ts` (import/export/`ACTIVITY_CONFIG_SCHEMAS`), `src/content/types.ts` (`Activity` union), `src/activities/definitions.ts`
- Test: `src/activities/typing-write/logic.test.ts`

**Interfaces:**
- Consumes: `skillsForTargets`, `isTeachableKey` from `../_shared/typing/keys`; scoring helpers.
- Produces: `typingWriteConfig`, `TypingWriteConfig`, and logic module exports `schema`, `responseSchema`, `TypingWriteResponse`, `score`, `skillsAffected`, `validateGenerated` (Task 3's Player and Task 7's content consume these).

- [ ] **Step 1: Config schema** — `src/content/activity-configs/typing-write.ts`:

```ts
import { z } from "zod";

export const typingWriteConfig = z
  .object({
    instruction: z.string().trim().min(1).max(240),
    /** "see" shows the word (copy typing); "hear" speaks it and hides it. */
    mode: z.enum(["see", "hear"]).default("see"),
    /** Sentences allow spaces, capitals, and end punctuation. */
    scope: z.enum(["word", "sentence"]).default("word"),
    items: z.array(z.string().trim().min(2).max(40)).min(3).max(12),
  })
  .strict();
export type TypingWriteConfig = z.input<typeof typingWriteConfig>;
```

- [ ] **Step 2: Register the schema** — in `src/content/activity-configs.ts` add the import, the `export *`, and `"typing-write": typingWriteConfig` to `ACTIVITY_CONFIG_SCHEMAS` (alongside lines 23-24/41-42/60-61). In `src/content/types.ts` add `| ActivityOf<"typing-write", TypingWriteConfig>` to the `Activity` union next to the other typing entries (~line 72).

- [ ] **Step 3: Write the failing logic tests** — `src/activities/typing-write/logic.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { TypingWriteConfig } from "@/content/activity-configs";
import { responseSchema, score, skillsAffected, validateGenerated } from "./logic";

const CONFIG: TypingWriteConfig = {
  instruction: "Type each word.",
  mode: "see",
  scope: "word",
  items: ["cat", "map", "sat"],
};

const perfect = {
  items: [
    { i: 0, ok: true, ms: 900, retries: 0, missedExpected: [] },
    { i: 1, ok: true, ms: 800, retries: 0, missedExpected: [] },
    { i: 2, ok: true, ms: 700, retries: 0, missedExpected: [] },
  ],
};

describe("typing-write scoring", () => {
  it("scores a perfect round 3 stars with words.familiar evidence", () => {
    const result = score(CONFIG, perfect);
    expect(result).toMatchObject({ correct: 3, total: 3, stars: 3 });
    expect(result.skillEvidence.map((e) => e.skill)).toEqual(["typing.words.familiar"]);
  });

  it("a corrected item is complete but not first-try", () => {
    const response = {
      items: [
        perfect.items[0],
        { i: 1, ok: false, ms: 2_000, retries: 1, missedExpected: ["m"] },
        perfect.items[2],
      ],
    };
    const result = score(CONFIG, response);
    expect(result.correct).toBe(2);
    expect(result.total).toBe(3);
  });

  it("fails closed when the item count does not match the config", () => {
    const short = { items: perfect.items.slice(0, 2) };
    expect(score(CONFIG, short)).toEqual({ correct: 0, total: 3, stars: 1, skillEvidence: [] });
  });

  it("fails closed on out-of-order or duplicated indices", () => {
    const dup = { items: [perfect.items[0], perfect.items[0], perfect.items[2]] };
    expect(score(CONFIG, dup).skillEvidence).toEqual([]);
  });

  it("fails closed when missedExpected is not drawn from the item's own characters (§8)", () => {
    const alien = {
      items: [
        { i: 0, ok: false, ms: 900, retries: 1, missedExpected: ["z"] },
        perfect.items[1],
        perfect.items[2],
      ],
    };
    expect(score(CONFIG, alien).skillEvidence).toEqual([]);
  });

  it("fails closed when ok contradicts retries/missedExpected", () => {
    const liar = {
      items: [
        { i: 0, ok: true, ms: 900, retries: 3, missedExpected: [] },
        perfect.items[1],
        perfect.items[2],
      ],
    };
    expect(score(CONFIG, liar).skillEvidence).toEqual([]);
  });

  it("responseSchema rejects multi-char missedExpected entries", () => {
    const bad = {
      items: [{ i: 0, ok: false, ms: 1, retries: 1, missedExpected: ["ca"] }],
    };
    expect(responseSchema.safeParse(bad).success).toBe(false);
  });
});

describe("typing-write derivation", () => {
  it("skills are exactly words.familiar", () => {
    expect(skillsAffected(CONFIG)).toEqual(["typing.words.familiar"]);
  });

  it("validateGenerated rejects untaught characters", () => {
    expect(validateGenerated({ ...CONFIG, items: ["can't", "map", "sat"] })).toMatch(/untaught/);
    expect(validateGenerated({ ...CONFIG, items: ["cat", "map", "sat"] })).toBeNull();
  });

  it("validateGenerated accepts sentence scope with capitals, spaces, periods", () => {
    expect(
      validateGenerated({
        instruction: "Type the sentence.",
        mode: "see",
        scope: "sentence",
        items: ["The fat cat sat.", "A pig can dig.", "Ben can get the pen."],
      }),
    ).toBeNull();
  });
});
```

- [ ] **Step 4: Run to verify failure** — FAIL (logic module missing).

- [ ] **Step 5: Implement** — `src/activities/typing-write/logic.ts`:

```ts
import { typingWriteConfig, type TypingWriteConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import { z } from "zod";
import { isTeachableKey, skillsForTargets } from "../_shared/typing/keys";
import {
  evenSkillEvidence,
  outcomeFromAccuracy,
  starsFromAccuracy,
} from "../_shared/scoring";

/** Server-safe schema + scoring for typing-write. No "use client". */
export const schema = typingWriteConfig;

/**
 * §8: `missedExpected` may carry only characters of the EXPECTED item — the
 * schema bounds shape, `score` enforces provenance against the config and
 * fails closed. The typed buffer never appears here.
 */
export const responseSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            i: z.number().int().min(0).max(11),
            ok: z.boolean(),
            ms: z.number().int().min(0).max(600_000),
            retries: z.number().int().min(0).max(30),
            missedExpected: z.array(z.string().length(1)).max(40),
          })
          .strict(),
      )
      .min(3)
      .max(12),
  })
  .strict();
export type TypingWriteResponse = z.infer<typeof responseSchema>;

function noEvidence(total: number): ActivityScore {
  return { correct: 0, total, stars: 1, skillEvidence: [] };
}

/** Shared with typing-race (same item shape). Exported for its logic module. */
export function itemsArePlausible(
  expected: readonly string[],
  items: TypingWriteResponse["items"],
): boolean {
  if (items.length !== expected.length) return false;
  return items.every((item, index) => {
    if (item.i !== index) return false;
    const chars = expected[index].toLowerCase();
    if (!item.missedExpected.every((ch) => chars.includes(ch.toLowerCase()))) return false;
    // ok must agree with the evidence carried alongside it.
    if (item.ok) return item.retries === 0 && item.missedExpected.length === 0;
    return item.retries >= 1 || item.missedExpected.length >= 1;
  });
}

export function score(config: TypingWriteConfig, response: TypingWriteResponse): ActivityScore {
  const expected = config.items;
  if (!itemsArePlausible(expected, response.items)) return noEvidence(expected.length);
  const firstTry = response.items.filter((item) => item.ok).length;
  const rate = firstTry / expected.length;
  return {
    correct: firstTry,
    total: expected.length,
    stars: starsFromAccuracy(rate),
    skillEvidence: evenSkillEvidence(skillsAffected(config), outcomeFromAccuracy(rate)),
  };
}

export function skillsAffected(config: TypingWriteConfig): SkillTag[] {
  return skillsForTargets(config.items);
}

export function validateGenerated(config: TypingWriteConfig): string | null {
  for (const item of config.items) {
    for (const ch of item) {
      if (!isTeachableKey(ch)) return `untaught key in "${item}": ${ch}`;
    }
  }
  const seen = new Set(config.items.map((item) => item.toLowerCase()));
  if (seen.size !== config.items.length) return "duplicate item";
  return null;
}
```

- [ ] **Step 6: Register server-side** — in `src/activities/definitions.ts` add `import * as typingWrite from "./typing-write/logic";` and `"typing-write": defineServerActivity("typing-write", typingWrite, "response-validated"),` beside lines 89-90. (Client registration waits for the Player in Task 3 — `bun run typecheck` must still pass; if `definitions.ts` or an exhaustiveness check demands the client entry now, note it and move the definitions.ts edit to Task 3 instead.)

- [ ] **Step 7: Run** — `bun run test src/activities/typing-write/ && bun run typecheck` → PASS. If any exhaustive kind-map test fails (e.g. `activities/index.test.ts` "no orphan kinds", generable-kind enumerations), fix by completing the registration the failure names — that is the test doing its job; do not silence it.
- [ ] **Step 8: Commit** — `git commit -m "feat: typing-write config, fail-closed scoring, and server registration"`

---

### Task 3: typing-write Player (see + hear) and client registration

**Files:**
- Create: `src/activities/typing-write/Player.tsx`, `src/activities/typing-write/index.ts`
- Modify: `src/activities/index.ts` (register), `src/content/program-integrity.test.ts` ONLY if its kind-exhaustiveness assertions fire (Task 7 owns the content counts)
- Test: `src/activities/typing-write/Player.test.tsx`

**Interfaces:**
- Consumes: Task 1's reducer, `TypingStage`, `useTypingKeys`, `useActivity`, `useSpeech`/`useTargetSpeech`/`useSpeakOnce`, `Prompt`/`ProgressHint` from `../_shared/ActivityChrome`, `StarShape` from `@/components/ui/Stars`, `Mascot`.
- Produces: `TypingWritePlayer` and the `typingWrite: ActivityType<TypingWriteConfig, TypingWriteResponse>` plugin object.

Player requirements (all testable via `renderToStaticMarkup` + mocked hooks, the `typing-catch/Player.test.tsx` pattern):

1. Shell: `TypingWritePlayer` renders `<TypingStage onExit={props.onExit}><WriteRound {...props}/></TypingStage>` — the round mounts only when the gate opens.
2. State: `useState` holds `{ index, progress: WordProgress, results }`; key intents go through a single handler passed to `useTypingKeys(handler, !finished)`; char → `pressWordKey(progress, currentItem, intent, now)` where `now` comes from a `performance.now()`-based elapsed helper captured OUTSIDE render (no `Date.now()` in render — mirror how `typing-keys/Player.tsx` timestamps).
3. On word completion: push `wordItemResult(progress, index)`, advance `index`, reset progress; after the last item call `onComplete({ items: results })` from the same event path (mirror `typing-keys`' completion effect pattern to stay `set-state-in-effect`-clean).
4. Display: the expected item renders as large letter tiles; the typed buffer renders beneath as tiles — correct entries ink-on-honey with the storybook outline, wrong entries ink-on-`coral/55` (tokens exist) with outline; a caret marks the next position. §8 note in a comment: buffer is display-only.
5. Hear mode: the item's tiles are hidden (replaced by an ear/speaker affordance); mount-speak the current word via `targetSpeech.speakTarget(item)` keyed per index (`useSpeakOnce` keyed on the item index — a NEW utterance per item, cancel on unmount); "Hear it again" = existing `SpeakerButton`. Reveal the word when `progress.retries >= 2` OR `!speech.supported || targetSpeech.unavailable` (D7), with the reveal state also rendering the existing audio-unavailable notice pattern when the cause is unavailability.
6. Progress: aria-hidden fill-up `StarShape size={40}` row (one per item, `emptyClassName="text-ink-soft"`) + `ProgressHint` `"N of M"` (same shape as Key Camp after slice-1's audit — copy that block).
7. Completion frame renders `Mascot mood="cheer"` (near-unreachable; harmless, consistent with Key Camp).
8. `aria-live="polite"` announces each new expected item ("Type cat", or "Listen, then type the word" in hear mode — never the typed buffer).

- [ ] **Step 1: Write the failing Player tests** — `Player.test.tsx` with the `vi.hoisted` mocks pattern from `typing-catch/Player.test.tsx` (mock `TypingStage` to render children, mock `useSpeech`/`useTargetSpeech`/`useSpeakOnce`). Assert at minimum:

```ts
// see-mode: expected word tiles visible; buffer area present; stars row aria-hidden;
// "1 of 3" text; aria-live carries "Type cat" not the buffer.
// hear-mode: word tiles hidden; speakTarget-mock called with the current item once;
// reveal after mocked retries>=2 state (drive by dispatching intents through a harness
// component or exporting WriteRound for direct render with injected initial state).
// §8: the response built from a corrected run carries missedExpected ⊆ expected chars
// and never the wrong chars typed (assert via a captured onComplete).
```

Write these as real, complete tests in the file — use a small harness that renders the Player and dispatches `window` keydown events (jsdom) to drive typing, the way `useTypingKeys` listens; that exercises the true wiring end-to-end.

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement `Player.tsx`** per requirements 1–8, then `index.ts` mirroring `typing-keys/index.ts` verbatim shape (`kind: "typing-write"`, `label: "Word Write"`), and register in `src/activities/index.ts` (`import { typingWrite } from "./typing-write"; registerActivityType(typingWrite);`).
- [ ] **Step 4: Run** — Player tests, then FULL `bun run test && bun run lint && bun run typecheck` (registration ripples through exhaustiveness tests; fix what they name).
- [ ] **Step 5: Commit** — `git commit -m "feat: Word Write player (see + hear modes) with client registration"`

---

### Task 4: typing-race — config, wpm, server logic, registration

**Files:**
- Create: `src/content/activity-configs/typing-race.ts`, `src/activities/typing-race/logic.ts`, `src/activities/_shared/typing/wpm.ts`
- Modify: `src/content/activity-configs.ts`, `src/content/types.ts`, `src/activities/definitions.ts`
- Test: `src/activities/typing-race/logic.test.ts`, `src/activities/_shared/typing/wpm.test.ts`

**Interfaces:**
- Consumes: `itemsArePlausible` from `../typing-write/logic` (exact same per-item shape — do NOT duplicate it).
- Produces: `typingRaceConfig`, `TypingRaceConfig`, logic exports (`schema`, `responseSchema`, `TypingRaceResponse`, `score`, `skillsAffected`, `validateGenerated`), and `wpm(chars: number, elapsedMs: number): number`.

- [ ] **Step 1: Config schema** — `typing-race.ts`:

```ts
import { z } from "zod";

export const typingRaceConfig = z
  .object({
    instruction: z.string().trim().min(1).max(240),
    words: z.array(z.string().trim().min(2).max(12)).min(6).max(20),
    /** The friendly pace comet's rate — a pacer, never another child. */
    pacerWpm: z.number().int().min(5).max(25).default(10),
  })
  .strict();
export type TypingRaceConfig = z.input<typeof typingRaceConfig>;
```

Register in `activity-configs.ts` + `types.ts` union exactly as Task 2 Step 2 did.

- [ ] **Step 2: Failing tests** — `wpm.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { wpm } from "./wpm";

describe("wpm", () => {
  it("computes chars/5 per minute", () => {
    expect(wpm(25, 60_000)).toBe(5);      // 25 chars in 1min = 5 wpm
    expect(wpm(50, 120_000)).toBe(5);
  });
  it("rounds to whole words for kid display", () => {
    expect(wpm(23, 60_000)).toBe(5);      // 4.6 → 5
  });
  it("is 0 for zero or negative elapsed", () => {
    expect(wpm(25, 0)).toBe(0);
    expect(wpm(25, -5)).toBe(0);
  });
});
```

and `logic.test.ts` — mirror Task 2's suite with race specifics:

```ts
import { describe, expect, it } from "vitest";
import type { TypingRaceConfig } from "@/content/activity-configs";
import { responseSchema, score, skillsAffected, validateGenerated } from "./logic";

const CONFIG: TypingRaceConfig = {
  instruction: "Type each word to hop the rocket forward!",
  words: ["ask", "sad", "dad", "fall", "flask", "salad"],
  pacerWpm: 8,
};

const perfectWords = CONFIG.words.map((word, i) => ({
  i, ok: true, ms: 900, retries: 0, missedExpected: [] as string[],
}));

describe("typing-race scoring", () => {
  it("scores a perfect run with BOTH word and fluency evidence", () => {
    const result = score(CONFIG, { words: perfectWords, elapsedMs: 30_000 });
    expect(result).toMatchObject({ correct: 6, total: 6, stars: 3 });
    expect(result.skillEvidence.map((e) => e.skill).sort()).toEqual([
      "typing.fluency.rate",
      "typing.words.familiar",
    ]);
  });

  it("finishing behind the pacer is still a full finish (score ignores elapsed)", () => {
    const slow = score(CONFIG, { words: perfectWords, elapsedMs: 1_700_000 });
    expect(responseSchema.safeParse({ words: perfectWords, elapsedMs: 1_700_000 }).success).toBe(false);
    // in-bounds slow elapsed:
    expect(score(CONFIG, { words: perfectWords, elapsedMs: 1_500_000 }).stars).toBe(3);
    void slow;
  });

  it("fails closed on word-count mismatch and alien missedExpected", () => {
    expect(score(CONFIG, { words: perfectWords.slice(1), elapsedMs: 30_000 }).skillEvidence).toEqual([]);
    const alien = perfectWords.map((w, i) =>
      i === 0 ? { ...w, ok: false, retries: 1, missedExpected: ["q"] } : w,
    );
    expect(score(CONFIG, { words: alien, elapsedMs: 30_000 }).skillEvidence).toEqual([]);
  });
});

describe("typing-race derivation", () => {
  it("skills = fluency.rate + words.familiar, sorted", () => {
    expect(skillsAffected(CONFIG)).toEqual(["typing.fluency.rate", "typing.words.familiar"]);
  });
  it("validateGenerated rejects untaught characters and duplicates", () => {
    expect(validateGenerated({ ...CONFIG, words: [...CONFIG.words.slice(1), "café"] })).toMatch(/untaught/);
    expect(validateGenerated({ ...CONFIG, words: [...CONFIG.words.slice(1), "ask"] })).toMatch(/duplicate/);
    expect(validateGenerated(CONFIG)).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify failure.**
- [ ] **Step 4: Implement.** `wpm.ts` (restore the slice-1 doc-comment spirit — pure, clockless):

```ts
/** Standard words-per-minute: a "word" is 5 characters. Pure and clockless —
 *  the caller passes elapsed ms — so the race Player can show a live rate and
 *  the slice-3 parent panel can chart it from recorded responses. */
export function wpm(chars: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return Math.round(chars / 5 / (elapsedMs / 60_000));
}
```

`typing-race/logic.ts`: `schema = typingRaceConfig`; `responseSchema` = same item object as typing-write's (i max 19, items array `.min(6).max(20)`, field name `words`) plus `elapsedMs: z.number().int().min(0).max(1_600_000)`; `score` = `itemsArePlausible(config.words, response.words)` (imported) → fail closed, else count `ok`, stars/evidence over `skillsAffected`; `skillsAffected = [...skillsForTargets(config.words), "typing.fluency.rate"].sort() as SkillTag[]`; `validateGenerated` identical policy to Task 2's (untaught chars, duplicates). Register in `definitions.ts` with `"response-validated"`.
- [ ] **Step 5: Run** — both test files + typecheck → PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat: typing-race logic, wpm math, and server registration"`

---

### Task 5: Promote the round-pause store to the shared typing toolkit

**Files:**
- Create: `src/activities/_shared/typing/roundPause.ts`, `src/activities/_shared/typing/roundPause.test.ts`
- Modify: `src/activities/typing-catch/Player.tsx` (imports), `src/activities/typing-catch/state.ts` (if `roundIsPaused` lives there, re-point), `src/activities/typing-catch/Player.test.tsx` (mock path), delete `src/activities/typing-catch/useRoundPaused.ts`
- Test: existing typing-catch suites stay green unchanged in MEANING (only import paths move)

**Interfaces:**
- Produces: `useRoundPaused(): boolean`, `useDocumentHidden(): boolean`, `roundIsPaused(hidden: boolean, focused: boolean): boolean` from `_shared/typing/roundPause` — Task 6's race Player consumes them; typing-catch keeps consuming them from the new path.

- [ ] **Step 1:** Move the file: contents of `typing-catch/useRoundPaused.ts` → `_shared/typing/roundPause.ts`. If `roundIsPaused` currently lives in `typing-catch/state.ts`, move the pure predicate into `roundPause.ts` and have `state.ts` re-export or import it — whichever direction leaves `state.ts` free of DOM concerns (the predicate is pure; the store subscriptions are the DOM part). Keep the doc comments.
- [ ] **Step 2:** Update every import (`grep -rn "useRoundPaused\|useDocumentHidden" src/`), including the `vi.mock("./useRoundPaused", …)` in `typing-catch/Player.test.tsx` → `vi.mock("../_shared/typing/roundPause", …)`.
- [ ] **Step 3:** Move/adapt any existing store tests into `roundPause.test.ts`; if none existed, add snapshot-shape tests (server snapshot false; `roundIsPaused(true, true) === true`; `roundIsPaused(false, false) === true`; `roundIsPaused(false, true) === false`).
- [ ] **Step 4:** `bun run test src/activities/typing-catch/ src/activities/_shared/typing/ && bun run typecheck` → green, same counts as before plus the new store tests.
- [ ] **Step 5: Commit** — `git commit -m "refactor: promote the round-pause stores to the shared typing toolkit"`

---

### Task 6: typing-race Player (rocket, pacer, live WPM, pause)

**Files:**
- Create: `src/activities/typing-race/Player.tsx`, `src/activities/typing-race/index.ts`
- Modify: `src/activities/index.ts` (register)
- Test: `src/activities/typing-race/Player.test.tsx`

**Interfaces:**
- Consumes: Task 1 reducer, Task 4 `wpm`, Task 5 `useRoundPaused`/`useDocumentHidden`, `TypingStage`, `useTypingKeys`, `ProgressRing` (`tone="coral-deep"` if a timing ring is used — 3:1 in every world), `StarShape`, ActivityChrome `Prompt`/`ProgressHint`.
- Produces: `TypingRacePlayer` + `typingRace` plugin object (`label: "Rocket Race"`).

Player requirements:

1. Shell + inner round split, `useTypingKeys(handler, !finished && !paused)`.
2. Same word tiles/buffer display as Word Write (word always visible — the race is rate, not memory). Extract nothing prematurely: if the tile row is identical to Task 3's, lift it into `_shared/typing/WordTiles.tsx` NOW (both consumers exist in this PR; that is DRY, not speculation) and refactor Task 3's Player to use it in this task.
3. Race clock: `startedMs` set on the FIRST char intent; while running and not paused, a 500ms interval ticks a `nowMs` state for the live readouts (interval callback only reads/sets state — keep `set-state-in-effect` clean by starting the interval in an effect keyed on `started && !paused && !finished`). Pause (blur/hidden via `useRoundPaused`) freezes accumulation: accumulate `elapsedMs` across pause boundaries the way `typing-catch` accumulates ticks — store accumulated ms + a segment start, close the segment on pause.
4. Track visual: a horizontal track (paper-sunk well, rounded-2xl, ink outline); the rocket 🄀 (Phosphor `RocketIcon`, ink-outlined chip) positioned by `typedChars / totalChars` fraction; the pace comet (Phosphor `ShootingStarIcon`, smaller, behind) positioned by `min(1, wpmChars(pacerWpm, elapsedMs) / totalChars)` where `wpmChars = pacerWpm * 5 * minutes`. Both move via `transform: translate3d` with a 500ms linear transition — never `left`. Copy: comet is "the pace comet", never a competitor; finishing behind it still completes with full warmth.
5. Live WPM: `wpm(typedCorrectChars, elapsedMs)` in a `ProgressRing`-free simple readout ("`12` words a minute") + words-done fill-up `StarShape` row (aria-hidden) + `ProgressHint` "word N of M".
6. Reduced motion: no comet, no rocket motion — the track renders as a static fraction ("3 of 6 words") with the same word tiles and identical rules/scoring; assert in tests that no `translate3d` style is emitted (the `typing-catch` reduced-motion test shape).
7. Pause overlay: reuse the exact `PauseOverlay` component from typing-catch — export it from a shared location ONLY if reuse is verbatim (it speaks `PAUSE_MESSAGE` gated on `useDocumentHidden`); otherwise render race's own thin copy of the pattern. Prefer moving `PauseOverlay` to `_shared/typing/PauseOverlay.tsx` in this task (two consumers now exist) with its tests.
8. On final word completion: `onComplete({ words: results, elapsedMs })` — same event-path pattern as Task 3.

- [ ] **Step 1: Failing Player tests** (same harness style as Task 3): perfect run drives `onComplete` with 6 in-order items + sane `elapsedMs`; wrong-then-backspace run carries `retries: 1` and the expected char only; paused state freezes the interval readout and shows the overlay; reduced-motion emits no transform styles; the pacer position derives from `pacerWpm` (assert the computed fraction at a mocked elapsed).
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement**, register in `activities/index.ts`.
- [ ] **Step 4:** Full `bun run lint && bun run typecheck && bun run test` → green.
- [ ] **Step 5: Commit** — `git commit -m "feat: Rocket Race player with pace comet, live wpm, and honest pause"`

---

### Task 7: Content — Word Workshop (unit 5) + Home Base word lesson

**Files:**
- Create: `src/content/programs/keyboard-club/word-workshop.ts`
- Modify: `src/content/programs/keyboard-club.ts` (units array + doc comment), `src/content/programs/keyboard-club/home-base.ts` (new lesson + stale unit comment), `src/content/programs/keyboard-club/keyboard-club.test.ts` (allowlists), `src/content/program-integrity.test.ts` (successfulResponse cases + any count assertions), `src/content/activity-configs/typing-catch.ts` (D4 comment fix)
- Test: the modified suites themselves

**Interfaces:**
- Consumes: everything registered in Tasks 2–6.
- Produces: `wordWorkshopUnit: Unit` and the updated `homeBaseUnit`.

Authoring rules (checked by existing tripwires — write content to satisfy them, never loosen a tripwire):
- Every activity's `skillTags` EQUALS `skillsAffected(config)`: write ⇒ `["typing.words.familiar"]`; race ⇒ `["typing.fluency.rate", "typing.words.familiar"]`.
- Every character of every word/sentence is teachable (`isTeachableKey`): lowercase letters, space, `. , ; /`, capitals OK (shift). NO apostrophes, digits, hyphens, or accents.
- Voice: warm, concrete; "pointer finger" if fingers are named.

- [ ] **Step 1:** `word-workshop.ts` — unit 5, `world: "ocean"`, emoji "🛠️" or similar, order 5. Author these lessons (word lists are final — they were checked char-by-char against `KEY_FINGERS`):

```ts
// L1 "Word builders" — 2× typing-write see/word:
//   ww-cvc-a: items ["cat", "map", "sat", "pan", "bag"]      (short-a CVC)
//   ww-cvc-mix: items ["hen", "pig", "dog", "sun", "bug", "six"]  (mixed vowels)
// L2 "Listen and type" — 1× typing-write hear/word:
//   ww-hear-sight: items ["the", "and", "see", "can", "you", "we"]
// L3 "Rocket races" — 2× typing-race:
//   ww-race-gentle: words ["cat", "hen", "pig", "sun", "map", "bug"], pacerWpm 8
//   ww-race-steady: words ["fish", "ship", "chat", "jump", "help", "play", "swim", "sand"], pacerWpm 12
// L4 "Little sentences" — 1× typing-write see/sentence:
//   ww-sentences: items ["The fat cat sat.", "A pig can dig.", "Ben can get the pen."]
```

Each activity: `estMinutes` 3–6, `band: "ready"` (`ww-race-steady` and `ww-sentences` may be `"stretch"`), blurbs in product voice, instructions that speak well aloud ("Type each word, one letter at a time. The rocket hops when you finish a word!").

- [ ] **Step 2:** `home-base.ts` — append lesson `home-words` ("Home row words", order after the existing last lesson) with:

```ts
// home-write: typing-write see/word, items ["sad", "dad", "ask", "fall", "salad"]
// home-race:  typing-race, words ["ask", "sad", "dad", "fall", "flask", "salad"], pacerWpm 8
```

All home-row-only characters. Update the unit banner comment (it currently claims "Every drill here is home-row only … resolves to exactly [typing.keys.home-row]") to note the word lesson's two word skills.

- [ ] **Step 3:** Wire `wordWorkshopUnit` into `keyboard-club.ts` `units` array; refresh its doc comment ("Word typing arrives in slice 2" → present tense). Update `keyboard-club.test.ts` allowlists: home-base gains `typing.words.familiar` + `typing.fluency.rate`; add the word-workshop row (`["typing.words.familiar", "typing.fluency.rate"]`).
- [ ] **Step 4:** `program-integrity.test.ts` — add `successfulResponse` builders for the two new kinds (a perfect `items`/`words` response derived from the config, `elapsedMs: 60_000` for race) so the whole-catalog "every authored activity scores cleanly" sweep covers them; update any count assertions the run flags (activity totals move from 158 by +8, skills stay 96 — the failures will name the numbers).
- [ ] **Step 5:** D4 comment fix in `typing-catch.ts`.
- [ ] **Step 6:** Full gates → green. The content tripwires (`exactSkillRoutingIssue`, untaught-key via `validateGenerated` if the catalog sweep calls it, program integrity) are the acceptance test of this task.
- [ ] **Step 7: Commit** — `git commit -m "feat: Word Workshop unit and Home Base word lesson"`

---

### Task 8: Playwright e2e

**Files:**
- Modify: `e2e/specs/typing.spec.ts` (extend — it is already in the public project's testMatch)

New specs (guest routes in Home Base, which is unlocked for a fresh guest — D6):

- [ ] **Step 1:** Add constants `WORD_WRITE = "/learn/keyboard-club/home-base/home-write"` and `ROCKET_RACE = "/learn/keyboard-club/home-base/home-race"`.
- [ ] **Step 2:** Spec "Word Write advances a word letter by letter and forgives a wrong key":

```ts
test("Word Write advances letter by letter and forgives a wrong key", async ({ page }) => {
  await openGate(page, WORD_WRITE);
  // first item is "sad" (authored order)
  await page.keyboard.type("s");
  await page.keyboard.type("x");           // wrong — enters the buffer
  await page.keyboard.press("Backspace");  // correction, no punishment
  await page.keyboard.type("ad");
  // word 1 done → progress advances to word 2 of 5
  await expect(page.getByText(/2 of 5/)).toBeVisible();
});
```

- [ ] **Step 3:** Spec "Rocket Race hops the rocket forward as words finish": open gate on `ROCKET_RACE`, `page.keyboard.type("ask")`, assert the words-done count advances ("word 2 of 6" or the equivalent authored copy) — pick the assertion from the REAL rendered DOM, and assert the pace-comet element exists (`data-pacer` attribute — add one in Task 6 if missing).
- [ ] **Step 4:** Spec "Word Write records only expected-character data": complete the whole `home-write` activity typing one wrong char on one word; intercept the completion POST (`page.waitForRequest` on the attempt endpoint used by other specs, if guest mode posts — if guest progress is localStorage-only, assert via `page.evaluate` on the stored payload instead) and assert the payload's `missedExpected` values are all characters of authored words and the wrong char typed is absent. **If guest mode never persists a payload accessible to the test, document that in a spec comment and drop this spec rather than asserting something vacuous — say so in your report.**
- [ ] **Step 5:** Run the suite against a live server (the controller does this too): `E2E_BASE_URL=… bun run test:e2e e2e/specs/typing.spec.ts --workers=1` → all specs green, including the six existing ones.
- [ ] **Step 6: Commit** — `git commit -m "test(e2e): word write and rocket race guest specs"`

---

### Task 9: Docs + slice hygiene

**Files:**
- Modify: `docs/architecture/STRUCTURE.md` (activities list + programs line if it enumerates units), `CLAUDE.md` (directory structure block: add `typing-write/`, `typing-race/`, `_shared/typing` additions)

- [ ] **Step 1:** Update both docs to match the shipped tree (mirror how slice 1's round added `keyboard-club` to STRUCTURE.md:76).
- [ ] **Step 2:** `bun run audit:dead-code` → exit 0 (knip: every new export must have a consumer — `itemsArePlausible`, `wpm`, `WordTiles`, `roundPause` exports are all consumed by Tasks 3–6; if knip flags one, wire or demote it, never ignore it).
- [ ] **Step 3:** Full gates: `bun run lint && bun run typecheck && bun run test && bun run build` → all green.
- [ ] **Step 4: Commit** — `git commit -m "docs: slice-2 structure updates"`

---

## Verification (whole slice, controller-run)

1. All four gates green at head; knip exit 0.
2. `e2e/specs/typing.spec.ts` fully green against a live standalone build (existing 6 + new specs).
3. Adversarial review rounds per the slice-1 process (cross-vendor + Opus + impeccable audit) — the impeccable pass should find the UI constraints already met because they are Global Constraints this time.
4. Post-merge: prod `seed-content` re-run (content ship), canary `/learn/keyboard-club/home-base/home-write`, `/home-race`, and a Word Workshop route; parent report now able to reach "7 of 7 skills started" once both new skills produce evidence.

## Accepted residuals (rule once, here)

- Word Workshop's write lessons share `typing.words.familiar` and can auto-complete siblings (D5).
- `typing.fluency.rate` evidence comes from race accuracy, not measured rate — the rate itself stays indicative/display-only by §8-adjacent policy (score never reads timing). The rubric's "steady, unhurried rate" is assessed by the parent observing, per the skills sheet's purpose.
- Star Catch word pools deferred (D4). `typing-echo` + parent panel are slice 3.
