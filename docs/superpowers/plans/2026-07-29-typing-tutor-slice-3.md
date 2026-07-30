# Keyboard Club Slice 3 — Star Echo + the parent typing panel

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the fifth and final typing kind — `typing-echo` "Star Echo", the look-away trainer that flashes 2–4 characters and hides them — plus the parent typing panel (per-key miss heatmap + words-per-minute over time), completing the typing tutor specced in `docs/superpowers/specs/2026-07-28-typing-tutor-design.md`.

**Architecture:** Star Echo reuses the slice-2 word engine (`_shared/typing/wordType.ts`) for its typing phase — a flashed sequence is just a short expected string — wrapped in a two-phase (flash → recall) round driven by the same tick/pause machinery Rocket Race uses. The parent panel is a pure read path: two server readers over `attempt.response` JSON (mirroring `getFluencyHistory`/`getLearnerFluency` exactly), rendered by inline-SVG components with honest empty states. **No migration** — every table already exists.

**Tech Stack:** Next.js 16 / React 19 / TypeScript strict, zod, vitest, Playwright, Tailwind v4 (Wonder Studio tokens), Phosphor icons, bun only.

## Global Constraints

Every task's requirements implicitly include these. Copied from the design spec, CLAUDE.md, and the slice-1/2 rulings — the last two slices cost 40 adversarial findings and most were constraint violations, so treat this list as binding, not advisory.

- **bun only.** Gates after every task: `bun run lint && bun run typecheck && bun run test`; `bun run build && bun run audit:dead-code` at slice end.
- **Never disable a linter rule** (`eslint-disable`, `@ts-ignore`). `eslint-plugin-react-hooks@7.1.1` runs 13 rules at error, including `refs` (no ref writes during render), `set-state-in-effect`, and `purity` (no `performance.now()`/`Date.now()` during render — timestamp in the event path only).
- **§8 keystroke privacy.** Responses carry ONLY config-authored target text plus outcome/timing. `missedExpected` holds ONLY characters of the expected sequence, **exact-case** (case-folding was a Critical in slice 2 — a forged lowercase can smuggle a pressed key for a capital target). The typed buffer (`WordProgress.typed`) is display-only and must never reach a serialized payload, an `aria-live` announcement, speech, or error capture.
- **Fail-closed scoring**, and the gate must accept **exactly the reducer-reachable shapes**: `ok:true ⇒ retries === 0 && missedExpected.length === 0`; `ok:false ⇒ retries >= 1 && missedExpected.length >= 1 && missedExpected.length <= retries`; entries unique; every entry a character of its own expected sequence. Anything else ⇒ `{correct: 0, total, stars: 1, skillEvidence: []}`. Never throw.
- **Score never reads timing.** `ms`/`flashMs`/elapsed are indicative only.
- **A schema cap without a client clamp is a completion-rejection bug.** Import the shared `MAX_ITEM_MS` / `MAX_ITEM_RETRIES` from `_shared/typing/wordType.ts` into the response schema instead of writing literals, and clamp client-side at serialization. An honest child who walks away or retries 31 times must never lose a finished round.
- **Skill-set equality:** authored `skillTags` must EQUAL `skillsAffected(config)` (`exactSkillRoutingIssue`, enforced by `program-integrity.test.ts` and `keyboard-club.test.ts`).
- **No AI generation for typing kinds** — no `KIND_BRIEF` entry in `src/lib/ai/generable.ts`.
- **Build-safety:** never call `getDb()`/`getAuth()` at module top level.
- **Parent-surface security:** every reader goes through `withUnlockedAccount` → `withOwnedLearner` (both layers — the PIN-gate lesson), and **no child PII beyond the display name already surfaced**; never put a child's name in a document title.
- **Wonder Studio (day-one requirements, learned the hard way):**
  - Kid interactive/illustrated elements: 2–3px ink outline + `shadow-pop`. `border-[3px]` for ≥size-14 elements, `border-2` for smaller.
  - **Radius: check the computed value.** `rounded-xl` is 1.75rem in this project — on a 48–56px box that is a circle. Use `rounded-sm` for keycap/tile-like elements.
  - **Motion: transform/opacity only**, never layout props. Reduced motion gets a real alternative path, not a kill. Derive travel distance from container geometry in ONE place (`calc(100% - <chip size>)` or a CSS var) so a chip can never leave its track.
  - **Contrast: text ≥4.5:1; meaningful indicators ≥3:1** measured against their own background, using **world-independent** tokens — `--color-accent*` resolves per `data-world` and fails 3:1 in sunshine/garden; `--color-line-strong` is a hairline that can never reach 3:1 (use `ink-soft`, 7.5:1, or `coral-deep`, 4.19:1).
  - Never signal state by hue alone (right/wrong at 1.04:1 was an Important) — pair colour with shape, strike-through, or motion.
  - Decorative progress rows are `aria-hidden` with `flex-wrap`; the accessible announcement lives in `ProgressHint` or an `aria-live` line.
  - Every Tailwind colour class must resolve to a token in `globals.css` `@theme`; static class maps only (JIT-safe).
  - Audio that IS the puzzle passes `essentialContentAudio: true` (`lang-listen-match` precedent) — otherwise the parent's read-aloud toggle silences it.
- **Typing is the sanctioned exception** (inside `keyboard-club` only) to four PRODUCT.md rules: touch-first, no punishing timers, child-can't-read-the-UI, no fail states. A flash timer and a hidden sequence are legitimate here.
- **e2e:** `playwright.config.ts` runs the suite with `reducedMotion: "reduce"` **under CI**. Verify every new spec with `CI=1` before claiming it passes, and never assert on an element only one motion mode renders (this blocked all deploys for 2.5h in slice 2). Keep assertions truthful; never weaken an existing one.
- Copy voice: warm, concrete, can-do; "pointer finger", never "index finger".

### Interfaces inherited from slices 1–2 (verbatim, at main `1c9bf5a`)

```ts
// _shared/typing/wordType.ts  (the word engine Star Echo reuses)
export const BUFFER_SLACK = 2;
export const MAX_ITEM_MS = 600_000;
export const MAX_ITEM_RETRIES = 30;
export interface WordProgress {
  typed: { char: string; ok: boolean }[];   // DISPLAY ONLY — never serialized
  retries: number; missedExpected: string[]; diverged: boolean;
  startedMs: number | null; completedMs: number | null;
}
export function initialWordProgress(): WordProgress;
export function pressWordKey(state, expected: string, intent: {char,shiftKey}, nowMs: number): WordProgress;
export function pressWordBackspace(state): WordProgress;
export function isWordComplete(state): boolean;
export function wordItemResult(state, i: number): { i: number; ok: boolean; ms: number; retries: number; missedExpected: string[] };
export function wordKeyWillBeWrong(state, expected: string, intent): boolean;  // for the shake

// _shared/typing/  (other shared pieces)
export function TypingStage({ children, onExit }): JSX.Element;               // the keyboard gate
export function useTypingKeys(onIntent: (i: KeyIntent) => void, active: boolean): void;
export function useRoundPaused(): boolean;      // hidden OR blurred
export function useDocumentHidden(): boolean;   // speech gating
export function PauseOverlay({ paused, onResume }): JSX.Element | null;
export function ExpectedTiles({ item }: { item: string }): JSX.Element;        // per-word groups, aria-hidden
export function BufferTiles({ item, progress }): JSX.Element;                  // aria-hidden, display-only
export function wpm(chars: number, elapsedMs: number): number;                 // chars/5 per minute, 0 if elapsed<=0
export function skillsForTargets(targets: readonly string[]): SkillTag[];       // any multi-char ⇒ ["typing.words.familiar"]
export function isTeachableKey(char: string): boolean;                          // case-insensitive
export const KEY_FINGERS: Record<string, { hand: Hand; finger: Finger }>;       // 31 keys
export const TYPING_ROWS: { top: string[]; home: string[]; bottom: string[] };
export const FINGER_TINT: Record<Finger, string>;                              // static class map

// typing-write/logic.ts  (the shared plausibility gate — import, never reimplement)
export function itemsArePlausible(expected: readonly string[], items: TypingWriteResponse["items"]): boolean;

// _shared/scoring.ts
export function starsFromAccuracy(firstTryRate: number): 0|1|2|3;
export function outcomeFromAccuracy(firstTryRate: number): SkillOutcome;
export function evenSkillEvidence(tags: SkillTag[], outcome: SkillOutcome): SkillEvidence[];

// _shared/useWrongShake.ts
export function useWrongShake(): { trigger: () => void; sequence: number; shakeProps: (reducedMotion: boolean) => object };

// parent read-path precedent to MIRROR (structure, gating, defensive parsing)
// src/lib/tutor/store.ts:1262  getFluencyHistory(accountId, learnerId, limit=60)
// src/app/(parent)/data.ts:418 getLearnerFluency(learnerId)  → withUnlockedAccount(withOwnedLearner(...))
// src/components/parent/FluencyChart.tsx  inline-SVG chart with an honest empty state
```

### Registration touchpoints for a new kind (all five, per slice-1/2 precedent)

1. `src/content/activity-configs/typing-echo.ts` — zod schema.
2. `src/content/activity-configs.ts` — import + `export *` + `ACTIVITY_CONFIG_SCHEMAS` entry; **and** `src/content/types.ts` — add to the `Activity` union.
3. `src/activities/typing-echo/logic.ts` — registered in `src/activities/definitions.ts` (`defineServerActivity("typing-echo", typingEcho, "response-validated")`).
4. `src/activities/typing-echo/{Player.tsx,index.ts}` — registered in `src/activities/index.ts`.
5. Authored into `src/content/programs/keyboard-club/`.
   **Plus these exhaustive Records** (slice-2 lesson — they are type-level and will fail typecheck): `src/lib/admin/editor-model.ts` `defaultConfigFor`, `src/components/learner/activityMeta.ts`, `src/app/(parent)/data.ts` kind labels, `src/content/activity-configs.test.ts`, `src/activities/index.test.ts`, and both count literals + a `successfulResponse` builder in `src/content/program-integrity.test.ts`.

### Locked decisions (do not relitigate; flag if impossible)

- **E1 — Echo round shape.** Per sequence: `flash` (sequence visible, `flashMs`) → `recall` (hidden; child types). Advance on completion; a wrong key shakes and requires Backspace exactly as in slice 2. No "peek" button — looking away IS the skill — but a sequence stays in recall indefinitely (no timeout), so a child is never rushed off it.
- **E2 — Echo scoring** reuses `itemsArePlausible(config.sequences, response.sequences)`. `flashMs` never enters scoring.
- **E3 — Echo skills** = `skillsForTargets(config.sequences)`. Sequences are 2–4 chars, so this is `["typing.words.familiar"]`. Do NOT add `typing.fluency.rate` (no rate mechanic here) and do NOT invent a new skill — a new skill in unit 5 would also re-open the "Word Workshop born complete" residual, which is fine but must then be reflected in `keyboard-club.test.ts`'s allowlist. **Author Star Echo into unit 4 (Big Letters) and unit 5 (Word Workshop)** per the spec's mixed-kind structure.
- **E4 — Flash phase and reduced motion.** The flash is a timed reveal, not an animation: it must work identically under `prefers-reduced-motion` (no transform/opacity transition required). Use the `TICK_MS`-style interval + `useRoundPaused` so a blur during the flash pauses it rather than burning the reveal.
- **E5 — Parent panel scope.** Two widgets on the existing learner detail page: (a) **per-key miss heatmap** over the keyboard layout, (b) **typing rate over time**. Both read `attempt.response` JSON for typing kinds only. No new tables, no migration.
- **E6 — Heatmap data sources** (the only two that exist by design, per spec §"privacy contract"): `typing-keys` prompts contribute `retries` keyed to that prompt's own `key`; `typing-write`/`typing-race`/`typing-echo` items contribute `missedExpected` characters. Nothing else is available and nothing else may be inferred.
- **E7 — Rate series** = `wpm()` over `typing-race` attempts only (the one kind with a whole-round `elapsedMs` and a rate intent), one point per day using that day's best, mirroring `getLearnerFluency`'s bestByDay shape. Word Write/Echo `ms` values are per-item and NOT a rate — excluded deliberately.

## File Structure

```
src/content/activity-configs/typing-echo.ts        # NEW  schema (Task 1)
src/activities/typing-echo/
  logic.ts / logic.test.ts                          # NEW  (Task 1)
  state.ts / state.test.ts                          # NEW  flash/recall phase reducer (Task 2)
  Player.tsx / Player.test.tsx / index.ts           # NEW  (Task 3)
src/content/programs/keyboard-club/
  big-letters.ts / word-workshop.ts                 # MODIFIED  authored echo activities (Task 4)
  keyboard-club.test.ts                             # MODIFIED  allowlists
src/lib/tutor/store.ts                              # MODIFIED  + getTypingMissHistory, getTypingRateHistory (Task 5)
src/app/(parent)/data.ts                            # MODIFIED  + getLearnerTypingInsights (Task 6)
src/components/parent/
  KeyMissHeatmap.tsx / .test.tsx                     # NEW  (Task 7)
  TypingRateChart.tsx / .test.tsx                    # NEW  (Task 7)
src/app/(parent)/parent/learners/[id]/page.tsx      # MODIFIED  mount both (Task 8)
e2e/specs/typing.spec.ts                            # MODIFIED  echo spec (Task 9)
docs/architecture/STRUCTURE.md, CLAUDE.md           # MODIFIED  (Task 10)
```

---

### Task 1: typing-echo config schema + fail-closed scoring

**Files:** Create `src/content/activity-configs/typing-echo.ts`, `src/activities/typing-echo/logic.ts`; Modify `src/content/activity-configs.ts`, `src/content/types.ts`, `src/activities/definitions.ts`; Test `src/activities/typing-echo/logic.test.ts`

**Interfaces produced:** `typingEchoConfig`, `TypingEchoConfig`; logic exports `schema`, `responseSchema`, `TypingEchoResponse`, `score`, `skillsAffected`, `validateGenerated`.

- [ ] **Step 1: Config schema** — `src/content/activity-configs/typing-echo.ts`:

```ts
import { z } from "zod";

export const typingEchoConfig = z
  .object({
    instruction: z.string().trim().min(1).max(240),
    /** Each sequence is 2–4 characters: long enough to hold, short enough to
     *  recall without reading. */
    sequences: z.array(z.string().trim().min(2).max(4)).min(3).max(10),
    /** How long the sequence stays visible before hiding. */
    flashMs: z.number().int().min(400).max(2_000).default(1_200),
  })
  .strict();
export type TypingEchoConfig = z.input<typeof typingEchoConfig>;
```

- [ ] **Step 2: Register the schema** — `activity-configs.ts` (import, `export *`, `ACTIVITY_CONFIG_SCHEMAS["typing-echo"]`) and the `Activity` union in `types.ts`, both beside the existing typing entries.

- [ ] **Step 3: Write the failing tests** — `src/activities/typing-echo/logic.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { TypingEchoConfig } from "@/content/activity-configs";
import { responseSchema, score, skillsAffected, validateGenerated } from "./logic";

const CONFIG: TypingEchoConfig = {
  instruction: "Watch the letters, then type them from memory.",
  sequences: ["fj", "dk", "sl"],
  flashMs: 1_200,
};

const perfect = {
  sequences: [
    { i: 0, ok: true, ms: 900, retries: 0, missedExpected: [] as string[] },
    { i: 1, ok: true, ms: 800, retries: 0, missedExpected: [] as string[] },
    { i: 2, ok: true, ms: 700, retries: 0, missedExpected: [] as string[] },
  ],
};

describe("typing-echo scoring", () => {
  it("scores a perfect round 3 stars with words.familiar evidence", () => {
    const result = score(CONFIG, perfect);
    expect(result).toMatchObject({ correct: 3, total: 3, stars: 3 });
    expect(result.skillEvidence.map((e) => e.skill)).toEqual(["typing.words.familiar"]);
  });

  it("counts only first-try sequences as correct", () => {
    const mixed = {
      sequences: [
        perfect.sequences[0],
        { i: 1, ok: false, ms: 2_000, retries: 1, missedExpected: ["d"] },
        perfect.sequences[2],
      ],
    };
    expect(score(CONFIG, mixed)).toMatchObject({ correct: 2, total: 3 });
  });

  it("ignores flashMs entirely (timing is never evidence)", () => {
    const slow = score({ ...CONFIG, flashMs: 2_000 }, perfect);
    const fast = score({ ...CONFIG, flashMs: 400 }, perfect);
    expect(slow).toEqual(fast);
  });

  it("fails closed on count mismatch, shuffled indices, and alien characters", () => {
    expect(score(CONFIG, { sequences: perfect.sequences.slice(1) })).toEqual({
      correct: 0, total: 3, stars: 1, skillEvidence: [],
    });
    const shuffled = { sequences: [perfect.sequences[1], perfect.sequences[0], perfect.sequences[2]] };
    expect(score(CONFIG, shuffled).skillEvidence).toEqual([]);
    const alien = {
      sequences: [
        { i: 0, ok: false, ms: 900, retries: 1, missedExpected: ["z"] },
        perfect.sequences[1],
        perfect.sequences[2],
      ],
    };
    expect(score(CONFIG, alien).skillEvidence).toEqual([]);
  });

  it("fails closed on both reducer-impossible ok:false shapes", () => {
    const noMiss = {
      sequences: [
        { i: 0, ok: false, ms: 900, retries: 1, missedExpected: [] as string[] },
        perfect.sequences[1],
        perfect.sequences[2],
      ],
    };
    const noRetry = {
      sequences: [
        { i: 0, ok: false, ms: 900, retries: 0, missedExpected: ["f"] },
        perfect.sequences[1],
        perfect.sequences[2],
      ],
    };
    expect(score(CONFIG, noMiss).skillEvidence).toEqual([]);
    expect(score(CONFIG, noRetry).skillEvidence).toEqual([]);
  });

  it("rejects a lowercase stand-in for a capital target (§8 exact-case)", () => {
    const capitals: TypingEchoConfig = { ...CONFIG, sequences: ["Fj", "dk", "sl"] };
    const forged = {
      sequences: [
        { i: 0, ok: false, ms: 900, retries: 1, missedExpected: ["f"] },
        perfect.sequences[1],
        perfect.sequences[2],
      ],
    };
    expect(score(capitals, forged).skillEvidence).toEqual([]);
  });

  it("responseSchema pins the shared clamp bounds", () => {
    const over = {
      sequences: [{ i: 0, ok: false, ms: 600_001, retries: 1, missedExpected: ["f"] }],
    };
    expect(responseSchema.safeParse(over).success).toBe(false);
  });
});

describe("typing-echo derivation", () => {
  it("skills are exactly words.familiar", () => {
    expect(skillsAffected(CONFIG)).toEqual(["typing.words.familiar"]);
  });

  it("validateGenerated rejects untaught characters and duplicate sequences", () => {
    expect(validateGenerated({ ...CONFIG, sequences: ["f1", "dk", "sl"] })).toMatch(/untaught/);
    expect(validateGenerated({ ...CONFIG, sequences: ["fj", "fj", "sl"] })).toMatch(/duplicate/);
    expect(validateGenerated(CONFIG)).toBeNull();
  });
});
```

- [ ] **Step 4: Run to verify failure** — `bun run test src/activities/typing-echo/` → FAIL (module missing).

- [ ] **Step 5: Implement `logic.ts`** — mirror `typing-write/logic.ts` exactly, reusing its gate:

```ts
import { typingEchoConfig, type TypingEchoConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import { z } from "zod";
import { isTeachableKey, skillsForTargets } from "../_shared/typing/keys";
import { evenSkillEvidence, outcomeFromAccuracy, starsFromAccuracy } from "../_shared/scoring";
import { MAX_ITEM_MS, MAX_ITEM_RETRIES } from "../_shared/typing/wordType";
import { itemsArePlausible } from "../typing-write/logic";

/** Server-safe schema + scoring for typing-echo. No "use client". */
export const schema = typingEchoConfig;

/**
 * §8: identical per-item shape to typing-write/race — only EXPECTED characters
 * are ever recorded. Bounds import the shared clamp constants so the client's
 * clamps and this gate can never drift.
 */
export const responseSchema = z
  .object({
    sequences: z
      .array(
        z
          .object({
            i: z.number().int().min(0).max(9),
            ok: z.boolean(),
            ms: z.number().int().min(0).max(MAX_ITEM_MS),
            retries: z.number().int().min(0).max(MAX_ITEM_RETRIES),
            missedExpected: z.array(z.string().length(1)).max(8),
          })
          .strict(),
      )
      .min(3)
      .max(10),
  })
  .strict();
export type TypingEchoResponse = z.infer<typeof responseSchema>;

function noEvidence(total: number): ActivityScore {
  return { correct: 0, total, stars: 1, skillEvidence: [] };
}

export function score(config: TypingEchoConfig, response: TypingEchoResponse): ActivityScore {
  const expected = config.sequences;
  if (!itemsArePlausible(expected, response.sequences)) return noEvidence(expected.length);
  const firstTry = response.sequences.filter((item) => item.ok).length;
  const rate = firstTry / expected.length;
  return {
    correct: firstTry,
    total: expected.length,
    stars: starsFromAccuracy(rate),
    skillEvidence: evenSkillEvidence(skillsAffected(config), outcomeFromAccuracy(rate)),
  };
}

export function skillsAffected(config: TypingEchoConfig): SkillTag[] {
  return skillsForTargets(config.sequences);
}

export function validateGenerated(config: TypingEchoConfig): string | null {
  for (const sequence of config.sequences) {
    for (const ch of sequence) {
      if (!isTeachableKey(ch)) return `untaught key in "${sequence}": ${ch}`;
    }
  }
  const seen = new Set(config.sequences.map((s) => s.toLowerCase()));
  if (seen.size !== config.sequences.length) return "duplicate sequence";
  return null;
}
```

- [ ] **Step 6: Register server-side** in `definitions.ts` with `"response-validated"`. Typecheck will now fail ONLY on the exhaustive Records listed in Global Constraints touchpoint 5 — those belong to Task 3. Report the exact list; do not create Player files here.
- [ ] **Step 7: Run** — `bun run test src/activities/typing-echo/ && bun run lint` clean; report the typecheck residue.
- [ ] **Step 8: Commit** — `feat: typing-echo config and fail-closed scoring`

---

### Task 2: the flash/recall phase reducer

**Files:** Create `src/activities/typing-echo/state.ts`; Test `src/activities/typing-echo/state.test.ts`

**Interfaces produced** (Task 3 consumes verbatim):

```ts
export type EchoPhase = "flash" | "recall";
export interface EchoState {
  index: number;
  phase: EchoPhase;
  phaseStartedMs: number;          // tick-clock ms at which the current phase began
  progress: WordProgress;
  results: TypingEchoResponse["sequences"];
}
export function initialEchoState(nowMs: number): EchoState;
export function tickEcho(state: EchoState, flashMs: number, nowMs: number): EchoState;  // flash → recall when elapsed >= flashMs
export function pressEchoKey(state: EchoState, sequences: readonly string[], intent: Pick<TypingCharIntent,"char"|"shiftKey">, nowMs: number): EchoState;
export function pressEchoBackspace(state: EchoState): EchoState;
export function isEchoComplete(state: EchoState, total: number): boolean;
```

Semantics (locked): keys are IGNORED during `flash` (the sequence is still visible — typing then would defeat the exercise, and a key must never be scored as a miss for it); `tickEcho` only ever moves `flash → recall`; completing a sequence pushes `wordItemResult` and starts the NEXT sequence back in `flash` with `phaseStartedMs = nowMs`; the clock is injected (never read inside).

- [ ] **Step 1: Write the failing tests** — cover: initial state is `flash` at index 0; `tickEcho` before `flashMs` stays in flash (reference-equal); at exactly `flashMs` flips to recall; keys during flash are no-ops (reference-equal, and `progress` untouched); a key in recall advances the buffer; completing a sequence advances the index, resets progress, and returns to `flash`; `pressEchoBackspace` in flash is a no-op; a wrong key then Backspace records `retries: 1` and one `missedExpected`; `isEchoComplete` is true only after the last sequence; a completed round's `results` are index-ordered with exact-case `missedExpected` from the sequence.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** `state.ts` as a pure module delegating all typing to `wordType.ts` (`pressWordKey`/`pressWordBackspace`/`isWordComplete`/`wordItemResult`) — do NOT reimplement buffer logic.
- [ ] **Step 4: Run tests** → PASS.
- [ ] **Step 5: Commit** — `feat: flash/recall phase reducer for Star Echo`

---

### Task 3: Star Echo Player + client registration

**Files:** Create `src/activities/typing-echo/Player.tsx`, `index.ts`; Modify `src/activities/index.ts`, plus ALL exhaustive Records from Global Constraints touchpoint 5; Test `src/activities/typing-echo/Player.test.tsx`

Player requirements:

1. Thin shell: `<TypingStage onExit={props.onExit}><EchoRound {...props}/></TypingStage>`.
2. Tick the phase with a `useEffect` interval (100ms, the `typing-catch`/`typing-race` cadence) gated on `!paused && !finished`, using `useRoundPaused()`; a pause during flash freezes the reveal (accumulate elapsed across pause boundaries the way Rocket Race does — and fold an open segment on the paused early-return, the slice-2 bug).
3. Flash phase renders `ExpectedTiles`; recall phase hides them entirely (render a "now type it" affordance, e.g. a Phosphor `EyeClosedIcon` at kid size with the storybook outline) and shows `BufferTiles`.
4. Wrong keys: `wordKeyWillBeWrong` → `useWrongShake().trigger()`, with strike-through on wrong glyphs and the "Press Backspace to fix it" announcement swap, exactly as slice 2's Players.
5. `aria-live` announces the PHASE, never the hidden sequence in recall: flash may announce "Watch: f j"; recall announces "Now type what you saw" (and the Backspace line when diverged). **Never leak the sequence during recall** — that is the whole exercise, and it is also §8-adjacent.
6. Progress: `aria-hidden` fill-up `StarShape` row (`size={40}`, `emptyClassName="text-ink-soft"`, `flex-wrap justify-center`) + `ProgressHint` "N of M".
7. Completion: `onComplete({ sequences: results })` from a ref-guarded effect (Key Camp's StrictMode-safe pattern); render `Mascot mood="cheer"` for the final frame.
8. Reduced motion: the flash timing is unchanged (a reveal, not an animation); only the shake degrades (its `shakeProps(reducedMotion)` handles that). Assert zero non-identity transforms under reduced motion.

- [ ] **Step 1: Write the failing Player tests** using the `vi.hoisted` mock harness from `src/activities/typing-race/Player.test.tsx` (repo is vitest `node` env — no jsdom; mock `react`'s `useEffect`/`useRef`/`useState`, `TypingStage`, `useRoundPaused`, `useReducedMotion`, `useWrongShake`, `useSpeakOnce`). Mandatory assertions: flash renders the expected tiles; recall does NOT contain the sequence text anywhere in the markup (the leak guard); keys during flash reach nothing; a wrong key triggers the shake and the Backspace announcement; the completed payload is index-ordered, carries `missedExpected` ⊆ the expected sequence's own characters, and contains no `typed` property; paused renders the overlay; reduced motion emits no transforms.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** `Player.tsx`, `index.ts` (`kind: "typing-echo"`, `label: "Star Echo"`, mirroring `typing-write/index.ts`), register in `src/activities/index.ts`, and close every exhaustive Record (Phosphor icon for `activityMeta` — `EyeClosedIcon` or `BrainIcon`; a `defaultConfigFor` skeleton `{ instruction: "Watch the letters, then type them from memory.", sequences: ["fj","dk","sl"], flashMs: 1200 }`).
- [ ] **Step 4: Run** — `bun run test && bun run lint && bun run typecheck`; everything green EXCEPT `program-integrity.test.ts`'s kind-coverage/count literals, which Task 4 owns (report them).
- [ ] **Step 5: Commit** — `feat: Star Echo player with client registration`

---

### Task 4: Content — Star Echo activities

**Files:** Modify `src/content/programs/keyboard-club/big-letters.ts`, `word-workshop.ts`, `keyboard-club.test.ts`, `src/content/program-integrity.test.ts`

Authoring rules: `skillTags` must EQUAL `skillsAffected` ⇒ `["typing.words.familiar"]` for every echo activity; every character teachable; literals pre-trimmed; product voice.

- [ ] **Step 1:** Add to `big-letters.ts` a lesson `big-echo` (order after its last lesson) with one activity:
  `big-echo-caps`: `typing-echo`, `sequences: ["Fj", "Dk", "Sl"]`, `flashMs: 1400`, band `"stretch"`, blurb about holding a big letter in your head.
- [ ] **Step 2:** Add to `word-workshop.ts` a lesson `ww-echo` with two activities:
  `ww-echo-short`: `sequences: ["at", "in", "up", "on"]`, `flashMs: 1200`, band `"ready"`.
  `ww-echo-long`: `sequences: ["cat", "sun", "fish", "jump"]`, `flashMs: 1000`, band `"stretch"`.
- [ ] **Step 3:** Update `keyboard-club.test.ts` allowlists (both units keep the same skill set, so verify rather than assume a change is needed) and its teachable-characters branch to handle `typing-echo`'s `sequences` per character.
- [ ] **Step 4:** `program-integrity.test.ts` — bump both count literals 19→20 and add a `successfulResponse` builder for `typing-echo` (derive from `config.sequences`, all `ok:true`).
- [ ] **Step 5:** FULL `bun run test` green (zero residue), lint, typecheck.
- [ ] **Step 6: Commit** — `feat: Star Echo activities in Big Letters and Word Workshop`

---

### Task 5: Parent read path — store readers

**Files:** Modify `src/lib/tutor/store.ts`; Test `src/lib/tutor/store.test.ts` (or the existing store test file — find where `getFluencyHistory` is tested and follow it)

**Interfaces produced:**

```ts
export interface KeyMissPoint { key: string; misses: number; attempts: number }
export interface TypingRatePoint { day: string; wpm: number }
export async function getTypingMissHistory(accountId: string, learnerId: string, limit?: number): Promise<KeyMissPoint[]>;
export async function getTypingRateHistory(accountId: string, learnerId: string, limit?: number): Promise<TypingRatePoint[]>;
```

- [ ] **Step 1: Write failing tests** — mirror the `getFluencyHistory` test's shape. Cover: `withOwnedLearner` fail-closed (unowned learner ⇒ `[]`); `typing-keys` attempts contribute one `attempts` per prompt and `misses += retries` keyed to `prompt.key`; `typing-write`/`typing-race`/`typing-echo` attempts contribute `misses` per `missedExpected` character and `attempts` per item; malformed/legacy JSON is skipped defensively without breaking the series (re-parse with each kind's `responseSchema` — the `getFluencyHistory` precedent); a key never missed still appears with `misses: 0` if attempted; rate history returns one point per day using that day's MAX wpm over `typing-race` attempts, computed with `wpm(totalChars, elapsedMs)` where `totalChars` sums the completed words' lengths; non-race kinds are excluded; oldest→newest ordering.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** both readers: select `{ day, kind, response }` from `attempt` where `learnerId` matches and `kind` IN the typing kinds, `orderBy desc(createdAt)`, `limit` (default 200 for misses, 60 for rate), `.reverse()`, then fold in application code with defensive `safeParse` per kind. **Never** infer a pressed key; only the two sources in E6.
- [ ] **Step 4: Run** → PASS; lint/typecheck clean.
- [ ] **Step 5: Commit** — `feat: typing miss and rate readers for the parent dashboard`

---

### Task 6: Parent read path — the page-level reader

**Files:** Modify `src/app/(parent)/data.ts`; Test alongside the existing `getLearnerFluency` tests

**Interface produced:**

```ts
export interface TypingInsights {
  learner: LearnerRow;
  misses: KeyMissPoint[];
  rate: (TypingRatePoint & { label: string })[];
}
export async function getLearnerTypingInsights(learnerId: string): Promise<TypingInsights | null>;
```

- [ ] **Step 1: Write failing tests** — the double gate is the point: unauthenticated/locked ⇒ `null` (never a partial); unowned learner ⇒ `null`; a learner with no typing attempts ⇒ empty arrays (NOT null — the widgets render honest empty states); `label` uses the same `relativeDay` helper `getLearnerFluency` uses.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** exactly mirroring `getLearnerFluency` (lines ~410-445): `withUnlockedAccount(({accountId}) => withOwnedLearner(accountId, learnerId, async (learner) => …), null)`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat: learner typing insights reader`

---

### Task 7: Parent panel components

**Files:** Create `src/components/parent/KeyMissHeatmap.tsx`, `TypingRateChart.tsx` + tests

- [ ] **Step 1: Write failing tests** (`renderToStaticMarkup`, the `FluencyChart.test.tsx` pattern). Mandatory: heatmap renders one cell per `TYPING_ROWS` key plus space; a key with more misses gets a visibly different (static-class-mapped) tone than a key with none; zero-data renders an honest empty state (no fake heat); the chart renders one point per day, an axis label, and an honest empty state; **no child display name appears in either component's markup** (§8 — the page already names the learner); both carry `role="img"` with a summarizing `aria-label` (a heatmap of 31 cells must not spam a screen reader cell-by-cell).
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.** `KeyMissHeatmap` reuses `TYPING_ROWS` for layout and a STATIC class map for its 4–5 heat steps (never a constructed class string; heat tones must reach ≥3:1 against the cell background using world-independent tokens; `rounded-sm` keycaps with `border-2 border-ink`). `TypingRateChart` mirrors `FluencyChart`'s inline-SVG approach — read that file first and follow it, including its empty state and its band/annotation conventions.
- [ ] **Step 4: Run** → PASS; lint/typecheck.
- [ ] **Step 5: Commit** — `feat: parent key-miss heatmap and typing rate chart`

---

### Task 8: Mount the panel on the learner page

**Files:** Modify `src/app/(parent)/parent/learners/[id]/page.tsx`

- [ ] **Step 1:** Read the page and find how `FluencyChart` is fetched and mounted (the reader call, the null handling, the section heading style). Mirror it exactly: call `getLearnerTypingInsights`, render a "Typing" section with both widgets, and render NOTHING (no empty section) when the reader returns `null`.
- [ ] **Step 2:** Section copy is parent-facing: explain what the heatmap means in one warm sentence ("The keys she reaches for most often, and the ones still finding their fingers") without diagnosing the child.
- [ ] **Step 3:** `bun run test && bun run lint && bun run typecheck && bun run build` — all green.
- [ ] **Step 4: Commit** — `feat: typing insights section on the parent learner page`

---

### Task 9: e2e spec

**Files:** Modify `e2e/specs/typing.spec.ts`

- [ ] **Step 1:** Add a guest-reachable Star Echo spec. **Check first** whether any unit-1 lesson has an echo activity — if not (per Task 4 they live in units 4–5, which are locked for a fresh guest), say so and instead assert what IS reachable: open the gate on an existing route and confirm no regression. **Do not author new unit-1 content just to make a spec reachable** — report the limitation honestly.
- [ ] **Step 2:** Whatever you add, verify BOTH ways: `CI=1 E2E_BASE_URL=… bun run test:e2e e2e/specs/typing.spec.ts --workers=1` (reduced motion — the gate's mode, and the one that broke slice 2) and without `CI=1`. Never assert on an element only one motion mode renders.
- [ ] **Step 3: Commit** — `test(e2e): Star Echo spec`

---

### Task 10: Docs

**Files:** Modify `docs/architecture/STRUCTURE.md`, `CLAUDE.md`

- [ ] **Step 1:** Add `typing-echo/` to both directory listings; EXTEND (never replace) the `_shared/typing` descriptions; add the two new parent components to STRUCTURE.md's parent section.
- [ ] **Step 2:** `bun run audit:dead-code` exit 0 — every new export must have a consumer; wire or demote, never ignore.
- [ ] **Step 3:** Full gates + build green.
- [ ] **Step 4: Commit** — `docs: slice-3 structure updates`

---

## Verification (whole slice, controller-run)

1. All gates green; knip exit 0.
2. `e2e/specs/typing.spec.ts` green **both** with and without `CI=1` against a live standalone build.
3. Whole-branch review, then the four adversarial streams (cross-vendor + independent + live-browser design audit), fix rounds until all attest clean.
4. Post-merge: prod `seed-content` re-run (content ship), canary the new echo routes, and confirm the parent learner page renders the typing section.

## Accepted residuals (rule once, here)

- Star Echo shares `typing.words.familiar` with the other word kinds, so it does not re-open the "Word Workshop born complete" strand — that residual stands as documented in slice 2.
- The heatmap can only ever show the two data sources in E6; it is not a keystroke log and must never become one.
- `typing.fluency.rate` still derives from race accuracy, not measured rate (slice-2 ruling upheld).
