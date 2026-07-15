# Curriculum Alignment and Final Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all deployed content and bounded generators to the new direct-interaction contracts, make evidence claims honest, and integrate the worktree waves into one verified release branch.

**Architecture:** Plugin branches migrate their disjoint per-unit authored files alongside their schemas. After wave 2 is integrated, one content-owner branch updates centralized AI briefs/validators, audits every active activity/evidence claim, and makes any cross-program corrections. The final integration branch runs all gates and independent reviews.

**Tech Stack:** TypeScript strict authored content, Zod 4, LiteLLM-bounded generation validators, Vitest, Playwright, Next.js build, git worktrees, bun.

**Depends on:** reviewed, integrated wave-2 commit. Plugin branches have already migrated their per-unit content. This branch is the sole owner of centralized AI briefs/validators and the final cross-program evidence audit.

## Global Constraints

- Apply orchestration/foundation constraints. The integrated result has no backward-compatibility fields that preserve contradictory answers; correct any active authored item still using a deprecated shape.
- Summer Bridge remains excluded from deployment, but validation must either cover it honestly or clearly scope and test its archived/non-active status. Never import `_archive/v2/`.
- Regular multiplication, division, area, fractions, and genuine regrouping are stretch/placement for an on-track child entering first grade; baseline/checkpoint activities remain placement-gated.
- Every emitted evidence skill is known, directly observed, and a subset of the authored `skillTags`.

---

### Task 1: Add whole-program interaction/evidence invariants

**Files:**
- Modify: `src/content/content.test.ts`
- Modify/Create: `src/content/activity-configs.test.ts`
- Modify: `src/lib/ai/generated-validators.test.ts`

- [ ] Add failing parameterized tests over every active program activity: config parses; answer indices and evidence references are valid; server definition exists; `skillsAffected(config)` is a subset of activity `skillTags`; per-kind evidence fixtures prove every actually emitted skill is also a subset; no deprecated response-proxy fields remain.
- [ ] Add policy tests for advanced structured-math band/checkpoint placement, journal prompts carrying no automatic sentence mastery, and language verification choices being drawn from taught inventory.
- [ ] Add fixture-based generated-validator tests for every generable kind, including malformed contradictions. Observe failures before migration.

### Task 2: Audit and correct structured-math and life-skills content

**Files:**
- Modify: `src/content/programs/kaelyn-adaptive/math.ts`
- Modify: `src/content/programs/kaelyn-adaptive/math-baseline.ts`
- Modify: `src/content/programs/kaelyn-adaptive/life-skills-math.ts`
- Modify: `src/content/skills.ts` only where evidence labels need correction
- Modify: `src/lib/admin/editor-model.ts`
- Modify: seed/admin tests affected by config shapes

- [ ] Convert `math-r2-a2` grouping-by-five from ten-frame to array.
- [ ] Convert `math-r8-a2` from a one-by-four array to `math-fraction-bar`; resolve `math-baseline-a5` as a genuine fraction bar or genuine area task, not mixed evidence.
- [ ] Remove fraction evidence from `math-r8-a1` if it observes only area. Remove every explicit math-array answer override.
- [ ] Make `math-r7-a1` an actual tens/ones trade with the new ten-frame make-ten mode or downgrade its evidence to addition; do not claim multi-digit regrouping from 7+8 alone.
- [ ] Align `math-r2-a1` runtime/authored multiplication skill tags. Mark regular multiplication/division/area/fraction work stretch; retain checkpoint gating for baseline items.
- [ ] Migrate measurement configs to actual object/unit placement and explicit weight facts; validate clock/money configs against new invariants.
- [ ] Add the fraction-bar default to the exhaustive admin editor map. Run content/admin tests; commit.

### Task 3: Audit and correct literacy and journal evidence claims

**Files:**
- Modify: `src/content/programs/kaelyn-adaptive/reading.ts`
- Modify: `src/content/programs/kaelyn-adaptive/word-study.ts`
- Modify: `src/content/programs/kaelyn-adaptive/writing.ts`
- Modify: `src/content/programs/kaelyn-adaptive/decodable-readers.ts`
- Modify: `src/content/programs/kaelyn-adaptive/reading-baseline.ts`
- Modify: `src/content/skills.ts` only if a participation label is needed

- [ ] Remove `writing.sentence`/stamina evidence from all journal participation prompts unless a separate direct observation contract exists.
- [ ] Reauthor sight-word configs into target rounds. Move prefix and shades-of-meaning semantic hunts to bounded comprehension/classification or remove unobserved mastery claims.
- [ ] Correct `reading-r3-a2`, `reading-r5-a1`, `word-r5-a2`, `word-r11-a2`, and `word-r12-a2` so their UI and tags observe the same skill. Ordinary choice questions cannot claim fluency/text-features/retell/morphology production.
- [ ] Mark oral activities cold or listen-repeat explicitly; remove phrasing/prosody evidence that STT cannot observe.
- [ ] Migrate phonics tile multiplicity and comprehension evidence/retell fixtures. Run content/plugin tests; commit.

### Task 4: Audit and correct world-language authored content

**Files:**
- Modify: `src/content/programs/world-languages/*.ts`
- Modify: language inventory/content tests

- [ ] Ensure intro activities use bounded 2–4 presentation batches at runtime while retaining their authored sets, populate/use meaning/example/exampleSpoken where available, and provide valid spoken verification prompts.
- [ ] Ensure listen choices are unique, labels align, answers are in range, and optional romanization is clearly a help field.
- [ ] Verify every symbol/id/choice against its language inventory and every activity's runtime evidence against its skill tags.
- [ ] Run language/content tests; commit.

### Task 5: Align every bounded generator

**Files:**
- Modify: `src/lib/ai/generable.ts`
- Modify: `src/lib/ai/generated-validators.ts`
- Modify: `src/lib/ai/generated-validators.test.ts`
- Modify: `src/lib/ai/practice.ts`
- Modify: `src/lib/ai/practice.test.ts`
- Modify: `src/app/api/practice/route.test.ts`

- [ ] Update exact JSON briefs for new sight-word, comprehension, array, ten-frame, and language schemas. Fix the current division brief that says rows×cols is the answer.
- [ ] Add validators for array model consistency/exact division, ten-frame capacity/mode invariants, fraction equal partitions, phonics inventory multiplicity, sight-word target uniqueness, comprehension evidence bounds, and language inventory membership.
- [ ] Keep fraction bar authored-only unless the approved generable map explicitly requires it; YAGNI favors authored-only for the new plugin.
- [ ] Assert malformed model output is discarded with the existing bounded fallback and no raw output reaches the child. Run all AI/practice tests; commit.

### Task 6: Verify the integrated content surface

- [ ] Confirm the branch starts from the reviewed wave-2 integration commit and has no unresolved worktree-only dependencies.
- [ ] Run the config/content/evidence and generator suites after Tasks 1–5; resolve every failure by correcting the owning content/validator, never by weakening the invariant.
- [ ] Run `bun run lint && bun run typecheck && bun run test`; commit the audited content/AI result.

### Task 7: Inspect all 15 kinds on the final integration branch

- [ ] Cherry-pick the reviewed content-alignment commits onto `integration/meaningful-lessons` from the wave-2 base. Re-run schema/content tests after each commit so any collision is localized.
- [ ] Use a table-driven Playwright smoke spec or existing focused specs to open at least one active authored config for each of the 15 registered kinds. Assert the direct manipulation appears, keyboard/tap completion works, wrong answers retry, persistence precedes exactly one reward, and no console error occurs.
- [ ] Explicitly test pinned missing/wrong-unit, malformed config, save/retry, sibling shelf isolation, same-kind generated remount, no microphone/audio, and reduced motion.

### Task 8: Full gates and independent reviews

- [ ] Run `bun run lint`.
- [ ] Run `bun run typecheck`.
- [ ] Run `bun run test`.
- [ ] Run `bun run build`.
- [ ] Start the built app and run targeted public/account Playwright projects for meaningful lessons, adaptive generation, oral reading, science, life-skills math, and world languages.
- [ ] Request one review focused on correctness/security/persistence, one on pedagogy/content/evidence, and one on accessibility/frontend DRY/YAGNI. Include `agy` (Gemini 3.1 Pro) and `agent` (Grok 4.5) feedback in the review packet when those local CLIs are available.
- [ ] Fix every actionable finding without disabling lint/tests, rerun the full gate, commit, and report exact commands, pass counts, commit hashes, and any deliberately deferred non-goals.
