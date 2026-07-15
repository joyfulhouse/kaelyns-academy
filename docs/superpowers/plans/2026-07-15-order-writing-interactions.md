# Order, Sorting, and Writing Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace guided-answer sorting/sequencing and blank-pass journal completion with genuine construction, rearrangement, and participation evidence.

**Architecture:** Sorting and sequencing use stable seeded shuffles, dnd-kit where it already fits, and first-class tap/keyboard placement/reordering. Journal keeps Canvas for marks but reports a bounded participation summary; mastery/evidence distinguishes supported participation from independently observed writing.

**Tech Stack:** React 19, TypeScript strict, dnd-kit, Canvas, Web Speech APIs behind existing hooks, Zod 4, Vitest, Playwright, bun.

**Depends on:** final foundation commit.

## Global Constraints

- Apply orchestration/foundation constraints. No activity completes before the child has constructed an answer or made a mark/text/dictation contribution.
- Shuffles are stable per mount/config and never re-randomize on render. Wrong checks preserve all placements and allow rearrangement.
- Do not persist Canvas PNG/data URLs in attempts. Do not infer spelling/sentence mastery from participation alone.

---

### Task 1: Free-placement sorting model

**Files:**
- Modify: `src/content/activity-configs/sort-categories.ts`
- Create: `src/activities/sort-categories/model.ts`
- Create: `src/activities/sort-categories/model.test.ts`
- Modify: `src/activities/sort-categories/logic.ts`
- Modify: `src/activities/sort-categories/logic.test.ts`
- Modify: `src/activities/sort-categories/Player.tsx`
- Modify: `src/activities/_shared/shuffle.ts` only if a reusable seeded primitive is missing
- Modify: `src/content/programs/kaelyn-adaptive/science-nature.ts`

- [ ] Write failing tests for stable seeded initial order, place/move/unplace, complete assignment, derived correctness, and preserving placement after a wrong check.
- [ ] Response schema carries bounded `{ itemIndex, binId }[]` assignments and attempts; scoring maps assignments to authored bin IDs and rejects missing/duplicate items.
- [ ] Start with all items in a shuffled source tray. Child may place any item in any bin, then move it between bins before checking. Remove forced “current item” progression.
- [ ] dnd-kit drag is optional/secondary; tapping an item selects it and tapping a bin places it; keyboard exposes the same select/place/move operations with clear focus.
- [ ] Run focused tests; commit.

### Task 2: Free-arrangement sequence model

**Files:**
- Modify: `src/content/activity-configs/seq-order.ts`
- Create: `src/activities/seq-order/model.ts`
- Create: `src/activities/seq-order/model.test.ts`
- Modify: `src/activities/seq-order/logic.ts`
- Modify: `src/activities/seq-order/logic.test.ts`
- Modify: `src/activities/seq-order/Player.tsx`
- Modify: `src/content/programs/kaelyn-adaptive/science-nature.ts`

- [ ] Add failing tests for a deterministic non-identity shuffle, placing into numbered slots, swap/move/reorder, complete permutation validation, and exact authored order scoring.
- [ ] Start with all cards shuffled and visible plus numbered 1st…Nth slots. Child can place in any slot and rearrange freely before check; no next-card guidance.
- [ ] Provide drag plus tap-to-select/tap-slot and Arrow-key reordering. Announce position changes.
- [ ] Keep wrong arrangements intact and highlight only that the order needs another look, not the correct slots.
- [ ] Run focused tests; commit.

### Task 3: Define honest journal participation evidence

**Files:**
- Modify: `src/content/activity-configs/journal-prompt.ts`
- Modify: `src/activities/journal-prompt/logic.ts`
- Modify: `src/activities/journal-prompt/logic.test.ts`
- Modify: `src/content/skills.ts` only if the approved participation skill is absent
- Modify: `src/content/programs/kaelyn-adaptive/writing.ts`

- [ ] Write failing tests: blank response cannot complete; one mark, non-empty typed text, or successful dictation can complete; text/transcript/strokes/PNG/data URL are absent from the attempt; participation yields encouraging stars but no automatic `writing.sentence` solid evidence; a structured independently observed response may emit only explicitly authored evidence.
- [ ] Define the exact response summary `{ markCount, textLength, usedDictation, mode, didDraw }` with capped integers/enum/booleans only. Do not send text content, transcript, strokes, or image data in the attempt.
- [ ] Implement participation scoring separately from mastery: completion can earn 1–3 participation stars, but `skillEvidence` is empty or targets a dedicated authored participation/habit skill. Remove stale `writing.sentence` tags from prompts that cannot observe it.
- [ ] Run journal and content-validation tests; commit.

### Task 4: Repair journal input behavior and completion gate

**Files:**
- Modify: `src/activities/journal-prompt/Player.tsx`
- Modify: `src/activities/journal-prompt/useDictation.ts`
- Create: pure journal state helpers/tests if state is currently embedded
- Create: `e2e/specs/meaningful-journal.spec.ts`

- [ ] Add failing tests/journeys for disabled Done when blank, drawing one mark, typing without caret jumps, dictation fallback/error without data loss, clearing, and successful completion without a data URL payload.
- [ ] Track mark count from pointer strokes and text length from controlled input while preserving selection/caret. Keep scribe/type/dictate modes only when allowed by config.
- [ ] Treat microphone/STT unavailability as a calm switch-to-type/scribe path, never negative evidence. Never auto-submit on a speech callback.
- [ ] Enable Done only after a qualifying contribution. Submit the bounded summary and clear any in-memory Canvas data on unmount/completion.
- [ ] Run focused tests and Playwright; commit.

### Task 5: Order/writing verification

- [ ] Add targeted Playwright journeys for sort and sequence covering drag-free keyboard/tap paths and preserved wrong attempts.
- [ ] Run `rg -n 'toDataURL|writing\.sentence|RewardOverlay' src/activities/journal-prompt src/content` and inspect every match.
- [ ] Run all sort/sequence/journal/content tests plus `bun run lint && bun run typecheck && bun run test`; commit fixes and report hashes.
