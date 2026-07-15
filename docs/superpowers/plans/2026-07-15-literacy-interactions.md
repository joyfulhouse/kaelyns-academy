# Literacy Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make phonics, sight-word, reading-comprehension, and oral-reading lessons directly observe the literacy skill they claim without timers, moving targets, or fabricated evidence.

**Architecture:** Preserve each existing plugin. Phonics uses stable tile instances and a retained sound-sweep build; sight words become bounded target rounds; comprehension pairs choices with authored evidence or structured retell; oral reading explicitly separates cold reads from listen-and-repeat and binds server verification to the pinned activity.

**Tech Stack:** React 19, TypeScript strict, Zod 4, existing audio/TTS/STT seams through server routes, DOM/CSS, Vitest, Playwright, bun.

**Depends on:** integrated wave-1 commit and the foundation server-authoritative contract.

## Global Constraints

- Apply orchestration/foundation constraints. Do not add moving words, speed timers, universal drag, streaming STT, prosody grading, or open-ended AI.
- Microphone, permission, browser, gateway, and adult-fallback failures produce no negative mastery evidence.
- Every evidence slug must be directly observable from the bounded response and be a subset of the authored activity tags.
- Do not import provider SDKs; oral verification stays behind existing bounded server routes and LiteLLM/audio services.

---

### Task 1: Make phonics builds use real tile inventory

**Files:**
- Modify: `src/content/activity-configs/phonics-wordbuild.ts`
- Create: `src/activities/phonics-wordbuild/model.ts`
- Create: `src/activities/phonics-wordbuild/model.test.ts`
- Modify: `src/activities/phonics-wordbuild/logic.ts`
- Modify: `src/activities/phonics-wordbuild/logic.test.ts`
- Modify: `src/content/programs/kaelyn-adaptive/word-study.ts`

- [ ] Add failing tests for repeated grapheme copies, consuming/releasing tile instances by index, exact word segmentation, silent tiles, bounded response builds, and generated words that cannot be built from the supplied multiplicity.
- [ ] Model palette tiles as stable indexed instances rather than string values. Response records each target word index, ordered tile indices, and attempts; the server derives constructed text and rejects reuse/unknown indices.
- [ ] Implement/export plugin-local validation that every word has at least one exact segmentation using the available tile instances and that declared silent/say keys exist in the inventory. The content-owner branch wires this into centralized AI validation.
- [ ] Ensure scoring emits only build-observable decoding/phonics skills, never morphology/meaning from spelling assembly alone.
- [ ] Run phonics/generator tests; commit.

### Task 2: Retain the build and perform a phoneme sweep

**Files:**
- Modify: `src/activities/phonics-wordbuild/Player.tsx`
- Modify: `src/content/phonics.ts` only if a pure segmentation helper belongs there
- Create: `e2e/specs/meaningful-phonics.spec.ts`

- [ ] Add failing browser journeys for repeated letters, tap-add/remove, optional drag, a wrong retained build, correct check, per-tile sound sweep excluding silent tiles, and final whole-word audio.
- [ ] Tapping/Enter/Space a palette instance places that exact copy in the next slot; tapping/keyboard Delete a placed tile returns it. Drag may reorder/place but cannot be the only path.
- [ ] Wrong check gently marks the build for another look without clearing it. Correct check keeps the word visible, highlights one tile at a time while playing bounded audio, then plays the whole word and submits.
- [ ] Keep sweep state local and reduced-motion safe; do not persist audio timing or tile labels beyond bounded indices.
- [ ] Run focused Playwright, lint, and typecheck; commit.

### Task 3: Replace sight-word hunting with spoken target rounds

**Files:**
- Modify: `src/content/activity-configs/sightword-game.ts`
- Modify: `src/activities/sightword-game/logic.ts`
- Modify: `src/activities/sightword-game/logic.test.ts`
- Modify: `src/activities/sightword-game/Player.tsx`
- Modify: `src/activities/sightword-game/index.ts`
- Modify: `src/content/programs/kaelyn-adaptive/word-study.ts`

- [ ] Add failing schema/logic tests for 1–8 target rounds, unique bounded choices, exactly one target occurrence, retained wrong choices, per-round attempts, and completion only after the correct target in every round.
- [ ] Migrate config to rounds containing `target`, `choices`, and optional bounded context/spoken prompt. Response contains final choice index and attempts per round; server recomputes accuracy.
- [ ] Player speaks/shows one stable target or short context, offers static word cards, leaves a wrong choice available, and advances only after correct. No timer, motion target, or speed evidence.
- [ ] Export the exact round schema and plugin-local consistency validator. The content-owner branch owns the centralized AI brief/validator. Reauthor semantic prefix/shades-of-meaning activities there rather than pretending they are sight-word recognition.
- [ ] Run plugin/AI tests and a new browser journey; commit.

### Task 4: Require evidence for comprehension claims

**Files:**
- Modify: `src/content/activity-configs/reading-comprehension.ts`
- Create: `src/activities/reading-comprehension/model.ts`
- Create: `src/activities/reading-comprehension/model.test.ts`
- Modify: `src/activities/reading-comprehension/logic.ts`
- Modify: `src/activities/reading-comprehension/logic.test.ts`
- Modify: `src/activities/reading-comprehension/Player.tsx`
- Modify: `src/content/programs/kaelyn-adaptive/reading.ts`
- Modify: `src/content/programs/kaelyn-adaptive/word-study.ts` for semantic choice migrations

- [ ] Add failing tests for answer-index bounds, unique choices, evidence sentence indexes in passage range, answer plus supporting-evidence scoring, and structured retell as an exact bounded event permutation.
- [ ] Extend question configs with optional required `evidenceSentenceIndexes` or evidence choices. Add an explicit structured-retell branch with stable event IDs; do not score the existing free `retellPrompt`.
- [ ] Response records answer attempts and selected evidence per question, or ordered event IDs for retell. Literal choice alone cannot emit retell, fluency, text-feature, or morphology-production evidence.
- [ ] Player makes the child select an answer and, when authored, tap the supporting passage sentence before checking. Retell mode arranges bounded event cards with tap/keyboard parity.
- [ ] Export plugin-local bounds/consistency validation for the content owner to reuse, then run focused unit/browser tests; commit.

### Task 5: Separate cold and modeled oral reading

**Files:**
- Modify: `src/content/activity-configs/oral-reading.ts`
- Modify: `src/activities/oral-reading/logic.ts`
- Modify: `src/activities/oral-reading/logic.test.ts`
- Modify: `src/activities/oral-reading/Player.tsx`
- Modify: `src/activities/oral-reading/Player.test.ts`
- Modify: `src/activities/oral-reading/SentenceReader.tsx`
- Modify: `src/activities/oral-reading/SentenceReader.test.ts`
- Modify: `src/activities/oral-reading/recording.ts`
- Modify: `src/content/programs/kaelyn-adaptive/word-study.ts`
- Modify: `src/content/programs/kaelyn-adaptive/decodable-readers.ts`
- Modify: `src/content/programs/kaelyn-adaptive/reading-baseline.ts`

- [ ] Add failing tests for the orthogonal `presentation: "cold" | "listen-repeat"` field, cold-mode audio suppression until attempt settlement, modeled flow, bounded verified response, and zero evidence for unavailable/permission/error/adult fallback.
- [ ] Keep existing word/sentence mode; add presentation separately. Cold mode cannot auto-read or expose a speaker before the recorded attempt settles. Listen-repeat explicitly labels the model step.
- [ ] Response distinguishes `verified` from `participated-unverified`. Only verified server facts may emit decoding/word-accuracy evidence; never emit phrasing/prosody from transcript matching.
- [ ] Preserve calm fallback completion without not-yet evidence. Run component/logic tests; commit.

### Task 6: Bind oral verification to authored content

**Files:**
- Modify: `src/app/api/oral-reading/route.ts`
- Modify: `src/app/api/oral-reading/route.test.ts`
- Modify: `src/activities/oral-reading/Player.tsx`
- Modify: `e2e/specs/oral-reading.spec.ts`

- [ ] Add failing route/action tests showing a client cannot substitute target/passage, matched words, per-word accuracy, or WCPM for a different pinned activity.
- [ ] In account mode accept learner/program/unit/activity identifiers and audio only. Resolve the pinned activity server-side, derive the expected text, perform verification, and persist a short-lived verification row bound to learner+activity. Return its bounded ID through the foundation `verificationId` seam.
- [ ] Register the oral-reading verifier through the foundation extension point; it consumes only the bound verification ID and rejects tampering/replay across learners/activities. Do not reopen the core attempt shape. Guest mode remains participation-only unless it has a locally trusted deterministic path.
- [ ] Run route/action/oral Playwright tests; commit.

### Task 7: Literacy verification

- [ ] Run all phonics/sightword/comprehension/oral and AI tests.
- [ ] Run targeted Playwright journeys including no-mic and cold-read cases.
- [ ] Run `bun run lint && bun run typecheck && bun run test`; commit fixes and report hashes.
