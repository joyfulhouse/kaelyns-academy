# Typing Tutor — "Keyboard Club" — Design

Date: 2026-07-28. Approved by user (full scope: a program, 5 activity kinds,
3 slices).
Origin: the platform teaches reading, writing, and math but never keyboarding.
The pilot learner (rising 1st grader) writes on a laptop through
`journal-prompt` with no keyboard instruction behind it.

## Problem

Keyboarding is a foundational literacy skill the curriculum does not touch. A
child who hunts and pecks pays that tax on every writing activity for years.
Nothing in the platform teaches key location, finger assignment, or the habit of
not looking at the hands.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Placement | A **program** (`keyboard-club`) in `PROGRAMS`, not a standalone section. Inherits enrollment, unit map, One Big GO, stars/stickers, `review_schedule`, parent dashboard. |
| Device | **Physical keyboard required.** Laptop primary; touch-only devices get a warm explanatory gate, not a degraded on-screen keyboard. |
| Product-rule exceptions | Typing is the **sole** exception to four PRODUCT.md rules: touch-first design, "no punishing timers", "the child can't read the UI", and "no fail states". Timers, visible WPM, letter-forward UI, and round-ending misses are all sanctioned **inside `keyboard-club` only**. |
| Content | **Keys first, curriculum words later.** Units 1–4 drill raw keys; unit 5 draws from `DECODABLE_LIBRARY` and the sight-word list so typing doubles as spelling practice. |
| Activity kinds | **Five**: `typing-keys`, `typing-catch`, `typing-race`, `typing-write`, `typing-echo`. |
| Skill domain | New `SkillDomain` `"typing"`, seven skills in `SKILLS`. |
| Keystroke privacy | Response records **which expected key was missed**, never which key was pressed, and never free text. Raw keystrokes never leave component state. |
| WPM | Client-measured → **indicative only**. Displays to child, charts for parent, **never feeds mastery**. Mastery keys on accuracy. (Same decoupling as `wcpm` in oral reading.) |
| Layout | US QWERTY. Correctness judged on `event.key`, not `event.code`. |
| Migrations | **None.** Existing attempt/mastery/review tables suffice; the parent panel reads `attempt.response` JSON. |
| AI | None. No LiteLLM surface, no mic, no §8 toggles — an ordinary enrollment. |

## Skill rubric — domain `typing`

| slug | readyIndicator |
|---|---|
| `typing.keys.home-row` | Finds `asdf`/`jkl;` from the F/J bumps without hunting |
| `typing.keys.top-row` | Reaches the top row and returns to home position |
| `typing.keys.bottom-row` | Reaches the bottom row and returns to home position |
| `typing.keys.space` | Spaces with a thumb without looking down at the keyboard |
| `typing.keys.shift` | Makes a capital by holding the shift key with the opposite hand |
| `typing.words.familiar` | Types known sight and decodable words accurately |
| `typing.fluency.rate` | Sustains a comfortable rate on familiar words |

`src/app/(parent)/parent/learners/[id]/page.tsx` carries a `_MissingDomain`
exhaustiveness backstop, so adding `"typing"` to `SkillDomain` **fails
typecheck** until the "Typing" row is added to `DOMAIN_ORDER`. The row cannot
silently vanish.

## Program shape — `keyboard-club`

| # | Unit | World | Teaches |
|---|---|---|---|
| 1 | Home Base | sunshine | `a s d f j k l ;`, F/J bumps, finger assignment |
| 2 | Sky Row | space | `q w e r t y u i o p` |
| 3 | Under Ground | garden | `z x c v b n m` |
| 4 | Big Letters | bigtop | shift + capitals, space bar |
| 5 | Word Workshop | ocean | curriculum words and short decodable sentences |

Each unit's lessons mix kinds: a `typing-keys` drill introduces the keys, then
the arcade kinds practice them. Home row alone yields enough real words for an
early `typing-race` — *ask, sad, dad, fall, flask, salad* — so word games are
not stuck waiting for unit 5.

## The five activity kinds

Each is `src/activities/typing-<name>/` (schema + Player + logic + tests) over a
shared `src/activities/_shared/typing/` toolkit.

### 1. `typing-keys` — Key Camp
Calm drill, no clock. One key glows on the keyboard map; a hand diagram colors
the finger that should press it. Correct → soft pop, advance. Wrong → the glow
pulses and waits. Retry-until-right.

- Config: `{ instruction, keys: string[] (1–10), reps: 1–3, showHands: boolean }`
- Response: `{ prompts: [{ i, ok, ms, retries }] }`
- `completionPolicy: "full-score"` — retry-until-right means a completion is
  always perfect; `server-verification.ts:76` enforces it.

### 2. `typing-catch` — Star Catch
Arcade, timed, 3 hearts. Star-sprites carrying a letter (later a word) drift
down; type to pop before they land. A miss dims a heart. The round ends on the
timer or on hearts — the sanctioned fail state. The end card leads with what she
caught, never with what she missed.

- Config: `{ instruction, pool: string[], durationSec: 30–90, lives: 1–5, speed: "gentle" | "steady" | "zippy" }`
  where `speed` is the seconds a target takes to fall: gentle 8s, steady 5s,
  zippy 3s.
- Response: `{ prompts: [{ text, ok, ms }], endedBy: "time" | "lives", elapsedMs }`
- `completionPolicy: "response-validated"` (a round can end imperfect).
- **Scoring integrity.** A timed round has no fixed prompt count, so the
  response schema constrains it: every `prompts[].text` must appear in
  `config.pool`, and `prompts.length` must fall within the range physically
  possible for `durationSec` at the configured `speed`. Without that, a
  one-prompt response would score as a perfect round.
- **Reduced motion:** nothing falls. Targets sit in a queue with a discrete
  countdown ring; identical rules, identical scoring.

### 3. `typing-race` — Rocket Race
Sustained rate. A queue of words; each completed word hops the rocket forward. A
friendly pace comet moves at a fixed gentle WPM — a **pacer, never another
child** — and finishing behind it is still a finish. WPM is the end-card
headline. Backspace allowed; self-corrections count as retries, not failures.

- Config: `{ instruction, words: string[] (6–20), pacerWpm: 5–25 }`
- Response: `{ words: [{ i, ok, ms, retries, missedExpected }], elapsedMs }`
- `completionPolicy: "response-validated"`.

### 4. `typing-write` — Word Write
Accuracy and spelling. `mode: "see"` shows the word (copy typing). `mode:
"hear"` speaks it through the existing Kokoro TTS and hides the text, making it
spelling *and* typing. A second miss in hear-mode reveals the word — never a
dead end.

- Config: `{ instruction, mode: "see" | "hear", scope: "word" | "sentence", items: string[] }`
- Response: `{ items: [{ i, ok, ms, retries, missedExpected }] }`
- `completionPolicy: "response-validated"`.

### 5. `typing-echo` — Star Echo
Look-away training. Two to four letters flash, then hide; she types them from
memory. The only kind that trains the actual goal of touch typing — not looking
at hands or screen.

- Config: `{ instruction, sequences: string[] (each 2–4 chars), flashMs: 400–2000 }`
- Response: `{ sequences: [{ i, ok, ms, missedExpected }] }`
- `completionPolicy: "response-validated"`.

## Shared toolkit — `src/activities/_shared/typing/`

- **`TypingStage.tsx`** — the gate + stage chrome **every** typing Player renders
  through. Gating lives here, not in a route layout, so generated and shelf
  hosts cannot bypass it (the lesson from layout-only PIN gating).
- **`KeyboardMap.tsx`** — SVG US QWERTY board; highlights the target key, tints
  keys by assigned finger.
- **`KEY_FINGERS.ts`** — key → (hand, finger) table. A unit test asserts every
  letter, space, shift, and period maps to exactly one finger.
- **`useTypingTarget.ts`** — the hardened keydown handler (see Input hardening).
- **`wpm.ts`** — pure rate math (chars ÷ 5 ÷ minutes), clockless: the caller
  passes elapsed ms, so it is unit-testable.

### The keyboard gate

Two stages:

1. A coarse `(any-pointer: fine)` / `(any-hover: hover)` media check decides
   *which* message a device sees.
2. **Proof of keyboard: "Press the F key to start"** — simultaneously the gate
   and the home-row anchor. Only a real keypress opens the stage.

Touch-only devices see a warm "Typing needs a keyboard — see you on the
computer!" screen. The gate is UX, not a security boundary; it never blocks
other programs.

### Input hardening

- Ignore keydown carrying `ctrlKey` / `metaKey` / `altKey`.
- Ignore `event.repeat` (a held key is one intent, not many).
- `preventDefault` on Space (page scroll) and on `'` and `/` (browser
  quick-find).
- Swallow IME composition and dead keys.
- **Never score a modifier as a miss.**

## Wiring

Five touchpoints per kind, matching every existing kind:

1. `src/content/activity-configs/typing-*.ts` — config schema. The aggregator
   derives `ActivityKind` from `ACTIVITY_CONFIG_SCHEMAS` automatically.
2. `src/activities/typing-*/logic.ts` — registered in `definitions.ts` with its
   `completionPolicy`.
3. `src/activities/typing-*/Player.tsx` — registered in `src/activities/index.ts`.
4. Activities authored into `src/content/programs/keyboard-club/`.
5. The program added to `PROGRAMS` in `src/content/index.ts`.

Typing kinds flow through the ordinary `parseAndScoreActivity` path.
`server-attempt-verifiers.ts` stays oral-reading-only — nothing here needs a
server witness.

### Privacy contract (§8)

A typing game on a child's device is keylogger-shaped. Every target is
server-known, so the response only ever records the **expected** key that was
missed:

```ts
{ i: 3, ok: false, ms: 1840, missedExpected: ["f"] }
```

`missedExpected` is always a subset of the config's own target characters —
enforced in the response schema, not by convention. Actual keys pressed and any
free text stay in component state and are discarded when the activity unmounts.

The slice-3 per-key heatmap is built from exactly two server-known sources:
`typing-keys` prompt `retries` (keyed to that prompt's target key) and
`missedExpected` from `typing-race` / `typing-write` / `typing-echo`. No other
keystroke data exists to draw from, by design.

### Skill-tag subset rule

`server-verification.ts:70` rejects any attempt whose `skillsAffected()` is not
a subset of the authored `skillTags` — the exact shape of the still-open Word
Study mismatch. Every typing kind therefore derives its skills deterministically
from config, the authored `skillTags` are written to match, and a
`content.test.ts` tripwire covers it **from day one**, not as a follow-up.

### Storage

**No migration.** Attempts, skill evidence, mastery, and the review ladder all
exist. The slice-3 parent panel reads per-key misses out of `attempt.response`
JSON, the same way `getFluencyHistory` reads `response.wcpm`. Content is
DB-preferred, so each content ship needs a prod `seed-content` re-run.

## Failure modes

| Situation | Behavior |
|---|---|
| No keyboard | The gate. A destination, not an error. |
| TTS unavailable (hear-mode) | Falls back to see-mode via the existing `AudioUnavailableNotice` pattern. |
| Window blur mid-round | **Pause the clock, stop counting misses.** Otherwise WPM and hearts both lie. |
| Focus escapes the stage | Pause with "click to keep going" rather than silently swallowing keys. |
| Word needs an untaught key | `validateGenerated` returns a reason, rejecting it at the content boundary instead of ambushing the child. |
| Anything unexpected | `captureNonCritical`. |

## Testing

**vitest** — scoring per kind; config and response schemas; the untaught-key
tripwire; WPM math; `KEY_FINGERS` completeness; the reduced-motion branch; the
keydown handler's modifier / repeat / IME cases; the `missedExpected` subset
constraint.

**Playwright** — `page.keyboard.press` drives these games natively: one spec per
kind, plus a touch-emulation spec asserting the gate blocks and explains.

**Existing suites** — `program-integrity.test.ts` and `content.test.ts` pick up
the new program for free; `src/activities/index.test.ts` asserts no orphan kinds.

**Accessibility** — `aria-live` announces each target; the surface is
keyboard-native by construction. The letter-forward UI is the sanctioned
exception to "the child can't read the UI", scoped to this program.

## Delivery — three reviewed slices

Matching how Phase 3 shipped (one reviewed PR per slice):

- **Slice 1 — foundation + the two core games.** `SkillDomain` + skills, parent
  `DOMAIN_ORDER` row, `keyboard-club` units 1–4, shared toolkit, the gate,
  `typing-keys`, `typing-catch`.
- **Slice 2 — words.** `typing-write`, `typing-race`, unit 5 Word Workshop over
  `DECODABLE_LIBRARY` and the sight-word list.
- **Slice 3 — mastery of the habit.** `typing-echo`, plus the parent typing
  panel (per-key miss heatmap, WPM over time).

Each slice ships green through `bun run lint && bun run typecheck && bun run
test && bun run build`, plus a prod `seed-content` re-run for slices carrying
content.

Each slice gets its **own implementation plan**; the plan following this spec
covers **Slice 1 only**. Slices 2 and 3 are planned after slice 1 merges, so
what is learned building the shared toolkit informs them.

## Out of scope

- Non-QWERTY layouts.
- An on-screen keyboard fallback for tablets (it would not teach typing).
- Number-row and symbol keys.
- AI-generated typing practice.
- Multiplayer or child-vs-child racing.
