# Life Skills SVG Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn clock, money, and measurement lessons into direct manipulative experiences with truthful visuals and accessible alternate controls.

**Architecture:** Keep the three existing plugin boundaries. Add small pure geometry/model helpers next to each plugin, render the clock and balance/proportional comparisons as inline SVG, and render coin tokens/trays with DOM/CSS. Player state stores only the direct manipulation state; existing server-safe logic scores the bounded final response.

**Tech Stack:** React 19, TypeScript strict, inline SVG, pointer events, Tailwind v4, Phosphor, Vitest, Playwright, bun.

**Depends on:** final commit of `2026-07-15-lesson-interactions-foundation.md`.

## Global Constraints

- Apply the orchestration/foundation constraints. Players call `onComplete(response)` only; the host owns persistence/reward.
- SVG elements need labels/instructions, focusable handles, keyboard alternatives, and a non-drag tap control. Do not add Three.js, physics, a scene graph, or a general drag framework.
- Store clock time as one canonical `totalMinutes` value, coin selections as token IDs/types, and measurement state as actually placed units/selections. Never derive correctness from pixel coordinates alone.

---

### Task 1: Interactive analog clock model and tests

**Files:**
- Create: `src/activities/math-clock/clock-model.ts`
- Create: `src/activities/math-clock/clock-model.test.ts`
- Modify: `src/activities/math-clock/logic.ts`
- Modify: `src/activities/math-clock/logic.test.ts`

- [ ] Write failing tests for 24 half-hour positions, display conversion around 12:00/12:30, `minuteAngle = minute * 6`, `hourAngle = totalMinutes / 2`, clockwise/counter-clockwise pointer unwrap across 0°, and snapping to the nearest half-hour.
- [ ] Implement pure `normalizeHalfHour`, `timeFromTotalMinutes`, `anglesForTime`, `pointerAngle`, `unwrapAngle`, and `snapPointerToHalfHour`. Keep the range to one 12-hour cycle.
- [ ] Tighten `mathClockResponseSchema`: `attempts` bounded; set response carries canonical `totalMinutes` (not independently forgeable hour/minute fields); read response carries bounded selected index.
- [ ] Update `isCorrect` and tests to compare the canonical half-hour state.
- [ ] Run the two focused test files; commit.

### Task 2: Replace clock selectors with movable SVG hands

**Files:**
- Modify: `src/activities/math-clock/Player.tsx`
- Modify: `src/content/programs/kaelyn-adaptive/life-skills-math.ts` if clock config migration is required
- Create: `e2e/specs/meaningful-clock.spec.ts`

- [ ] Add a failing browser test for set mode: drag the minute-hand handle to :30, observe coupled hour-hand movement, adjust with Arrow keys, tap the half-hour stepper as a drag-free alternative, check, retry a wrong state, and complete with exactly one host reward.
- [ ] Render a numbered analog clock (`role="group"`, descriptive label) with tick marks, 1–12 numerals, distinct hour/minute hands, large transparent pointer targets, and visible focused handles. Use SVG transforms from `clock-model.ts`.
- [ ] For pointer movement, capture the pointer on the active hand, convert client coordinates through the SVG bounding box, unwrap through 0°, then snap to a half-hour. Both hands update the one `totalMinutes` state so they can never disagree.
- [ ] Make each handle keyboard-operable: ArrowLeft/Down subtract and ArrowRight/Up add 30 minutes. Add two explicit 44px “earlier/later” tap buttons and a textual current-time announcement.
- [ ] In read mode, keep the fixed analog face and digital choices, but use the same SVG renderer/model; wrong choices re-prompt without completion.
- [ ] Run clock unit tests, the Playwright spec, lint, and typecheck; commit.

### Task 3: Truthful coin models and tray logic

**Files:**
- Create: `src/activities/math-money/coin-model.ts`
- Create: `src/activities/math-money/coin-model.test.ts`
- Modify: `src/activities/math-money/logic.ts`
- Modify: `src/activities/math-money/logic.test.ts`

- [ ] Write failing tests for coin value/name/relative diameter, adding/removing stable token instances, tray total, exact-target correctness, and duplicate same-type coins.
- [ ] Define the four bounded coin facts once: penny 1, nickel 5, dime 10, quarter 25; relative diameters must communicate that the dime is smaller than nickel/penny and quarter is largest. Expose pure `addCoin`, `removeCoin`, and `sumCoins`.
- [ ] Change count-mode response to bounded selected coin types/token count, not a client total. Score recomputes cents from the selection.
- [ ] Make plugin-local config/generated validation reject an identify target absent from `coins`, a count palette incapable of making the target, and duplicate/unknown values. The content-owner branch owns centralized AI wiring.
- [ ] Run focused logic/model tests; commit.

### Task 4: Build the coin palette and tray interaction

**Files:**
- Modify: `src/activities/math-money/Player.tsx`
- Modify: `src/content/programs/kaelyn-adaptive/life-skills-math.ts`
- Create: `e2e/specs/meaningful-money.spec.ts`

- [ ] Add a failing browser test that adds two same-type coins by tap, removes one, adds by keyboard, completes an exact total, and verifies wrong totals remain editable.
- [ ] Render reusable semantic coin buttons with correct relative size, color, name, and cent label; avoid photorealism and currency claims beyond US coin names/values already authored.
- [ ] Count mode has a palette and an obvious tray. Tapping/Enter/Space on a palette coin adds a new stable token; tapping/keyboard Delete on a tray token removes it. If dnd-kit is used for drag-to-tray, keep tap parity as the primary path.
- [ ] Announce tray total and token changes politely. Disable only impossible overflow additions; keep clear/check buttons reachable and visible.
- [ ] Identify mode uses the same coin component and gentle retry.
- [ ] Run focused tests, Playwright, lint, and typecheck; commit.

### Task 5: Measurement models that show the operation

**Files:**
- Create: `src/activities/math-measure/measure-model.ts`
- Create: `src/activities/math-measure/measure-model.test.ts`
- Modify: `src/activities/math-measure/logic.ts`
- Modify: `src/activities/math-measure/logic.test.ts`
- Modify: `src/content/activity-configs/math-measure.ts`
- Modify: `src/content/programs/kaelyn-adaptive/life-skills-math.ts`

- [ ] Write failing tests for equal-baseline length/height scaling, balance tilt direction for weight, unit placement counts, answer-index bounds, unique comparison extrema, and rejection of configs whose answer contradicts item sizes.
- [ ] Add pure comparison helpers that derive the correct item from `attribute`, `question`, and sizes. Do not trust `answerIndex`; either remove it through a schema migration or make validation require equality with the derived index.
- [ ] Change units-mode response to bounded placed-unit count/IDs and score from the actual count. Add a schema invariant that the visual target length and expected placed unit count are the same authored fact.
- [ ] Run schema/logic/model tests; commit.

### Task 6: Render unit placement and SVG balance comparisons

**Files:**
- Modify: `src/activities/math-measure/Player.tsx`
- Create: `e2e/specs/meaningful-measure.spec.ts`

- [ ] Add failing journeys for placing/removing individual units along a baseline and selecting the heavier/lighter object from a correctly tilting balance.
- [ ] Units mode renders a target object aligned to a common zero baseline plus individual unit tokens the child places one at a time. Tap/keyboard adds or removes; optional drag has identical behavior.
- [ ] Length/height comparisons share the same baseline and proportional scale. Weight uses a labeled inline SVG balance whose beam/pans visibly tilt toward the heavier side; never encode weight as object height.
- [ ] Keep visible labels and selection buttons outside/alongside SVG so the task remains usable without precise pointer input.
- [ ] Run all life-skills focused tests, targeted Playwright, `bun run lint && bun run typecheck && bun run test`; commit and report hashes.
