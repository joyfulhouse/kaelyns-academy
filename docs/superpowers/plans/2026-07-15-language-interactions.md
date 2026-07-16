# World-Language Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn listening and symbol-introduction lessons into retryable, audio-first interactions that actually use the authored linguistic context and never penalize infrastructure failure.

**Architecture:** Keep the two existing plugins. Listening uses a pure per-item retry reducer and explicit optional romanization help. Symbol intro pages symbols in groups of 2–4, records meaningful exposure, uses meanings/examples/spoken prompts, then verifies with retained retry state. Shared audio exposes observable availability without becoming a new media framework.

**Tech Stack:** React 19, TypeScript strict, existing clip/TTS audio APIs, Zod 4, DOM/CSS, Vitest, Playwright, bun.

**Depends on:** integrated wave-1 commit and foundation completion/retry contract.

## Global Constraints

- Apply orchestration/foundation constraints. No tracing engine until real stroke-path data exists; no silent auto-advance; romanization is help, not a permanent answer label.
- Audio unavailability must be observable and offer replay/fallback; it never creates negative evidence.
- Generated symbols/choices must remain exact members of the server-selected language inventory.

---

### Task 1: Make shared audio failure observable

**Files:**
- Modify: `src/activities/_shared/useAudio.ts`
- Create: `src/activities/_shared/useAudio.test.ts` if testable without DOM, otherwise extract/test a pure fallback state machine
- Modify: language Players only at this task

- [ ] Add failing state-machine tests for clip success, clip failure then TTS success, both unavailable, replay after failure, and stale async completion ignored after item changes.
- [ ] Expose bounded `status: "idle" | "playing" | "ready" | "unavailable"` plus `play/retry/stop`. Keep the existing clip→TTS fallback and do not add streaming.
- [ ] Provide a calm visual/text unavailable state while retaining the visible prompt/help path. Run focused tests; commit.

### Task 2: Retryable listen-and-match rounds

**Files:**
- Modify: `src/content/activity-configs/lang-listen-match.ts`
- Create: `src/activities/lang-listen-match/model.ts`
- Create: `src/activities/lang-listen-match/model.test.ts`
- Modify: `src/activities/lang-listen-match/logic.ts`
- Create: `src/activities/lang-listen-match/logic.test.ts`
- Modify: `src/activities/lang-listen-match/Player.tsx`
- Modify: `src/activities/lang-listen-match/index.ts`
- Modify: affected `src/content/programs/world-languages/*.ts` files for contract migration

- [ ] Add failing tests for unique choices, bounded/in-range answer index, optional labels matching choice length, wrong-choice retry, first-try attempts, correct-only advance, and bounded final response.
- [ ] Implement per-item reducer state. Wrong selection produces gentle feedback and stays on the same prompt; replay remains available. Response stores final choice and attempt count per item.
- [ ] Hide `choiceLabels`/romanization behind an explicit Help toggle. Tapping Help cannot alter correctness but can be recorded as a bounded support flag if evidence policy needs it.
- [ ] Do not complete or emit not-yet evidence when audio is unavailable; offer retry and a visible supported fallback path.
- [ ] Run focused tests and a world-language browser journey; commit.

### Task 3: Guided symbol batches using authored context

**Files:**
- Modify: `src/content/activity-configs/lang-symbol-intro.ts`
- Create: `src/activities/lang-symbol-intro/model.ts`
- Create: `src/activities/lang-symbol-intro/model.test.ts`
- Modify: `src/activities/lang-symbol-intro/logic.ts`
- Create: `src/activities/lang-symbol-intro/logic.test.ts`
- Modify: `src/activities/lang-symbol-intro/Player.tsx`
- Modify: `src/activities/lang-symbol-intro/index.ts`
- Modify: affected `src/content/programs/world-languages/*.ts` files for contract migration

- [ ] Add failing schema/model tests for unique symbol IDs, batches of 2–4, every verify choice drawn from taught symbols, unique choices/in-range answer, exposed/activated symbol IDs, and retryable checks.
- [ ] Page 3–8 authored symbols into deterministic groups of 2–4. Each card shows glyph and meaning/example when provided; romanization is a help reveal. Tapping/focusing the card plays `spoken`; an example control uses `exampleSpoken`.
- [ ] Disable “I’m ready” until every symbol in the current batch has meaningful activation. Verification speaks `spokenPrompt`, retains wrong choices, and advances only after correct.
- [ ] Response includes bounded exposed symbol IDs, activation flags/support use, and per-check attempts. Server scoring emits only the config skill tags after genuine exposure/verification.
- [ ] Run focused tests/browser journey; commit.

### Task 4: Tighten generated world-language contracts

**Files:**
- Modify: `src/lib/ai/world-language-config.ts`
- Modify: `src/lib/ai/world-language-config.test.ts`
- Modify: plugin-local language validators/tests only; centralized AI files belong to the content-owner branch

- [ ] Add failing tests for invented glyph/id, duplicate symbol IDs/choices, verify choices outside taught inventory, mismatched romanization label arrays, and missing spoken prompts where required.
- [ ] Export exact plugin-local invariants and inventory checks for the content owner. Use existing inventory slicing; do not let the model invent tracing paths or translations.
- [ ] Run all language/AI tests; commit.

### Task 5: Language verification

- [ ] Extend the existing world-language Playwright spec for wrong-answer retry, Help toggle, audio unavailable, paged symbol activation, meaning/example use, and spoken verification prompt.
- [ ] Run `bun run lint && bun run typecheck && bun run test`; commit fixes and report hashes.
