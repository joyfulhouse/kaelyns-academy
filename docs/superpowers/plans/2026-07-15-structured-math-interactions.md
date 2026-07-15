# Structured Math Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make array, ten-frame, and fraction lessons model the mathematics directly, with no contradictory answer fields or off-model evidence.

**Architecture:** Tighten schemas around one source of truth per task, implement pure manipulatives in each plugin, and add one narrowly scoped `math-fraction-bar` plugin for partition/identify tasks. DOM/CSS handles counters and tiles; inline SVG is used only for proportional fraction geometry if it improves focus/keyboard behavior.

**Tech Stack:** React 19, TypeScript strict, Zod 4, DOM/CSS, optional inline SVG, dnd-kit only where already useful, Vitest, Playwright, bun.

**Depends on:** final foundation commit.

## Global Constraints

- Apply orchestration/foundation constraints. One mathematical model is one authored truth; derived answers are not optional override fields.
- Every activity must visibly perform the named operation before checking. Advanced multiplication/division/fraction material remains stretch/placement content for the pilot learner.
- Add only the fraction-bar plugin. Do not build a generic manipulative engine or add fraction comparison/equivalence modes.

---

### Task 1: Remove contradictory math-array answers

**Files:**
- Modify: `src/content/activity-configs/math-array.ts`
- Modify: `src/activities/math-array/logic.ts`
- Modify: `src/activities/math-array/logic.test.ts`
- Modify: `src/activities/math-array/layout.test.ts`
- Modify: `src/content/programs/kaelyn-adaptive/math.ts`
- Modify: `src/content/programs/kaelyn-adaptive/math-baseline.ts`

- [ ] Add failing tests showing `{ rows: 2, cols: 3, answer: 99 }` is rejected/unsupported, and each mode derives its result from its model.
- [ ] Remove the optional `answer` field. Define mode semantics explicitly: build/multiply/area result is `rows * cols`; divide config includes a bounded `total` divisible by `groups` (or rename rows/cols coherently) and result is the equal share.
- [ ] Add/export a plugin-local validator for positive bounded dimensions, exact division, and no contradictory fields. The content-owner branch wires centralized AI validation. Migrate test fixtures needed by this plugin; active authored program migration stays with the content owner.
- [ ] Run config, array, generator, and content validation tests; commit.

### Task 2: Implement four direct array modes

**Files:**
- Create/Modify: `src/activities/math-array/model.ts`
- Create/Modify: `src/activities/math-array/model.test.ts`
- Modify: `src/activities/math-array/Player.tsx`
- Create: `e2e/specs/meaningful-array.spec.ts`

- [ ] Add failing pure tests for adding/removing rows, row-major tile count, skip-count sequence, dealing a pool round-robin into equal groups, and area grid completeness.
- [ ] Build mode starts from an empty workspace and lets the child add/remove complete rows until the requested rows×columns model is present.
- [ ] Multiply mode has the child reveal or tap each row and shows the running skip-count totals before accepting the product.
- [ ] Divide mode starts with a visible pool and lets the child deal one item at a time across labeled groups; checking is enabled only when the pool is empty.
- [ ] Area mode fills unit squares inside a fixed rectangle, with row/column labels and a final unit-square count.
- [ ] Provide tap/keyboard paths for every token operation; optional drag is additive. Wrong checks leave the model intact.
- [ ] Run unit/browser tests, lint, and typecheck; commit.

### Task 3: Make ten-frames individual and capacity-safe

**Files:**
- Modify: `src/content/activity-configs/math-tenframe.ts`
- Create: `src/activities/math-tenframe/model.ts`
- Create: `src/activities/math-tenframe/model.test.ts`
- Modify: `src/activities/math-tenframe/logic.ts`
- Modify: `src/activities/math-tenframe/logic.test.ts`
- Modify: `src/activities/math-tenframe/Player.tsx`
- Modify: `src/content/programs/kaelyn-adaptive/math.ts`
- Modify: `src/content/programs/kaelyn-adaptive/math-baseline.ts`

- [ ] Add failing schema/model tests for frame capacity, represent/add/subtract/make-ten operations, full-frame trading, and configs that exceed one/two-frame capacity. Export the plugin-local invariant for centralized AI validation.
- [ ] Extend the discriminated mode to exactly the approved operations. Derive starting/target counts from bounded operands and reject negative or over-capacity results. Remove content currently using the ten-frame kind for grouping-by-five or unrelated regrouping.
- [ ] Render two rows of five cells per frame and one independently selectable counter per cell. Tap/Enter/Space toggles permitted cells; clear and undo are explicit.
- [ ] Add mode shows the first addend in one color and child-added counters in another. Subtract mode starts filled and removes counters. Make-ten requires filling the first frame, then visibly trades that full frame into one ten token before continuing.
- [ ] Response carries bounded cell occupancy/actions, never a typed total. Scoring derives the represented count and operation result.
- [ ] Run focused tests, typecheck, and content validation; commit.

### Task 4: Add the narrow fraction-bar contract

**Files:**
- Create: `src/content/activity-configs/math-fraction-bar.ts`
- Modify: `src/content/activity-configs.ts` (register/re-export the one new kind; this branch is the sole wave-1 aggregator owner)
- Modify: `src/content/activity-configs.test.ts`
- Modify: `src/content/types.ts`
- Create: `src/activities/math-fraction-bar/index.ts`
- Create: `src/activities/math-fraction-bar/logic.ts`
- Create: `src/activities/math-fraction-bar/logic.test.ts`
- Create: `src/activities/math-fraction-bar/model.ts`
- Create: `src/activities/math-fraction-bar/model.test.ts`
- Modify: `src/activities/index.ts`
- Modify: `src/activities/index.test.ts`
- Modify: `src/content/programs/kaelyn-adaptive/math.ts`
- Modify: `src/content/programs/kaelyn-adaptive/math-baseline.ts`

- [ ] Write failing schema tests for only `partition` and `identify`, denominator 2–4, numerator 1..denominator, and bounded response selections.
- [ ] Add `MathFractionBarConfig` and the `math-fraction-bar` kind/Activity union member. The config stores numerator/denominator and mode; no decimal, equivalence, comparison, free text, or duplicate answer field.
- [ ] Implement pure equal-segment geometry/state and server scoring. Partition response records the chosen equal partition count; identify response records selected segments.
- [ ] Register the server/client definitions and make completeness tests pass; commit.

### Task 5: Build the fraction-bar Player

**Files:**
- Create: `src/activities/math-fraction-bar/Player.tsx`
- Create: `e2e/specs/meaningful-fraction.spec.ts`

- [ ] Add failing browser tests for partitioning into halves/thirds/fourths and selecting the requested numerator with tap and keyboard.
- [ ] Partition mode presents one whole bar and lets the child choose 2–4 equal partitions; animate only the divider reveal, reduced-motion safe.
- [ ] Identify mode renders equal labeled segments and lets the child select/deselect individual pieces. Announce “N of D equal parts selected.”
- [ ] Use CSS grid or inline SVG based on the simplest accessible implementation; correctness comes from segment state, never visual width measurements.
- [ ] Run fraction tests/Playwright; commit.

### Task 6: Structured-math verification

- [ ] Run `rg -n 'answer:' src/content src/activities/math-array` and verify no override remains.
- [ ] Run all schema/array/tenframe/fraction/generator/content tests and targeted Playwright.
- [ ] Run `bun run lint && bun run typecheck && bun run test`; commit fixes and report hashes.
