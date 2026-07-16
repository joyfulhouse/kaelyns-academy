# Lesson Interaction Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make activity readiness, response validation, scoring, evidence, persistence, generated-shelf ownership, and rewards trustworthy before changing lesson UIs.

**Architecture:** Split the plugin registry into a server-safe definition registry and the existing client Player registry. Each activity type gains a bounded `responseSchema`; a server action resolves the exact authored activity or learner-owned generated shelf row, parses config and response, computes the canonical score using plugin logic, and persists only that result. Hosts wait for the selected learner and pinned program, key Players by activity/version/config, await persistence, and own the only reward screen.

**Tech Stack:** Next.js Server Actions, TypeScript strict, Zod 4, React 19, Vitest, Drizzle-backed tutor store, bun.

**Spec:** `docs/superpowers/specs/2026-07-14-meaningful-lesson-interactions-design.md`, especially §§4, 7, 8, and 11.

## Global Constraints

- Apply every constraint in `2026-07-15-meaningful-lesson-interactions-orchestration.md`.
- The server-safe registry must not import React, Players, browser globals, or `@/activities` side effects.
- Authored attempts fail closed when the exact activity cannot be found in the learner's pinned program and route unit. Generated attempts must resolve a shelf row owned by the account and selected learner; in-session generated configs carry a server-issued bounded witness rather than trusting an authored ID plus arbitrary config.
- No optimistic mastery/reward from a client score. Guest mode may score locally through the same pure plugin definition, but account mode uses the server result.
- Persistence failure keeps the response locally and offers a calm retry; it does not award canonical progress until the retry succeeds.
- Activity-level `skillTags` are the authored source of truth. Config-carried skill fields never expand the server-authorized evidence set.

---

### Task 0: Split config contracts for worktree-safe parallelism

**Files:**
- Create: `src/content/activity-configs/*.ts` (one module per existing kind)
- Modify: `src/content/activity-configs.ts` (thin re-export and exhaustive `ACTIVITY_CONFIG_SCHEMAS` aggregator)
- Create: `src/content/programs/kaelyn-adaptive/*.ts` (one module per current top-level unit)
- Modify: `src/content/programs/kaelyn-adaptive.ts` (thin program metadata/unit aggregator)
- Modify: `src/content/activity-configs.test.ts` and existing content tests only as needed for import coverage

- [ ] Record the current config/content test baseline, then mechanically move each schema and its input type into a per-kind module without changing behavior or public imports.
- [ ] Keep `src/content/activity-configs.ts` as the stable public entry point: re-export all per-kind schemas/types and construct the exhaustive schema map from those imports.
- [ ] Mechanically move each current `kaelyn-adaptive` top-level unit into its own typed module and keep the public `kaelynAdaptive` export/path unchanged. Preserve exact serialized content and ordering.
- [ ] Add a completeness test proving every exported `ActivityKind` maps to exactly one schema and all existing authored configs parse identically.
- [ ] Run `bun run test src/content/activity-configs.test.ts src/content/content.test.ts` and `bun run typecheck`; commit this behavior-preserving split before any contract changes.

### Task 1: Add bounded response schemas to the plugin contract

**Files:**
- Modify: `src/content/types.ts`
- Create: `src/activities/definitions.ts`
- Modify: every `src/activities/*/logic.ts` and `src/activities/*/index.ts`
- Test: `src/activities/index.test.ts`
- Create: `src/activities/definitions.test.ts`

- [ ] Add a failing registry test asserting every key in `ACTIVITY_CONFIG_SCHEMAS` has one server definition and that both an invalid empty object and an over-bounded payload are rejected by its `responseSchema`.
- [ ] Extend `ActivityType<Config, Response>` with `responseSchema: ZodType<Response>`. Define a server-safe `ActivityDefinition` containing `kind`, `schema`, `responseSchema`, `score`, `skillsAffected`, and optional `validateGenerated`; keep `Player` only on the client registration type.
- [ ] In each `logic.ts`, export a Zod response schema matching only the response facts that plugin actually needs. Bound strings, arrays, counters, selected indices, recording metadata, and drawing/text participation summaries. Do not accept `stars` or `skillEvidence`.
- [ ] Create `src/activities/definitions.ts` with explicit imports of logic modules and an exhaustive `satisfies Record<ActivityKind, ActivityDefinition<unknown, unknown>>` map. Export `getActivityDefinition(kind)` and `allActivityDefinitions()`.
- [ ] Wire each client `index.ts` to expose its response schema, then update the registry completeness test.
- [ ] Run `bun run test src/activities/index.test.ts src/activities/definitions.test.ts` and `bun run typecheck`; commit.

### Task 2: Make scoring a server-authoritative operation

**Files:**
- Modify: `src/app/(learner)/actions.ts`
- Modify: `src/app/(learner)/actions.test.ts`
- Create: `src/activities/server-verification.ts`
- Create: `src/activities/server-verification.test.ts`
- Modify: `src/lib/tutor/store.ts`
- Modify: store tests colocated with the existing tutor store tests

- [ ] Add failing action tests for forged client score/evidence, malformed plugin response, authored activity in the wrong route unit, missing pinned activity, foreign generated shelf row, and a valid attempt. Assert the database receives only the server-computed score.
- [ ] Replace `RecordAttemptInput.score` and free-form `kind` with identifiers plus bounded `response`, `unitKey`, generated provenance fields, and an optional bounded opaque `verificationId`. The latter is a reserved witness seam for oral reading: reject it unless the resolved kind has a registered server verifier, and never accept verified response facts directly from the browser. Return `{ ok: true, score: ActivityScore }` on success and retain the existing calm failure reasons.
- [ ] Add a narrow server-only verification registry keyed by activity kind. A verifier receives the account/learner/program/unit/activity identity plus `verificationId`, returns canonical response facts or `null`, and is absent for ordinary deterministic plugins. Do not import Players or expose a general tool/plugin system.
- [ ] Resolve the learner-owned pinned program first. For authored activity, use `getUnit(program, unitKey)` and find `activityId` inside that unit rather than global `findActivity`. Parse its config using the server definition's config schema, parse the response with its response schema, call `definition.score`, and verify every emitted skill belongs to the resolved activity's `skillTags`.
- [ ] For shelf play, load the row through `getGeneratedActivity(accountId, learnerId, shelfItemId)`, safe-parse its stored config and response with the row kind's definition, derive skill tags only from the bound source activity/row, and preserve earn-once behavior. Reject foreign, spent, or mismatched rows.
- [ ] Persist the canonical score and server-derived kind/unit/checkpoint/provenance. Remove all use of client-supplied stars/evidence.
- [ ] Run `bun run test 'src/app/(learner)/actions.test.ts'` and the focused tutor store tests; commit.

### Task 3: Return canonical persistence results through learner state

**Files:**
- Modify: `src/components/learner/useLearnerState.ts`
- Modify/Create: `src/components/learner/useLearnerState.test.ts`
- Modify: any callers exposed by TypeScript

- [ ] Add failing pure tests for `record`: account mode waits for the server and applies its canonical score, guest mode derives a score from the local server-safe definition equivalent, inactive/error returns no progress mutation, and retry does not duplicate an attempt.
- [ ] Change `record(...)` to return a promise with a discriminated `{ ok, score?, reason? }` result. Remove the account-mode optimistic evidence/star merge based on Player input.
- [ ] Pass `unitKey`, activity identifiers, raw response, and generated shelf/witness metadata to the action. Reconcile account state only after a successful write.
- [ ] Keep guest storage support but compute the score from parsed config/response using the same pure definition; never accept a Player score.
- [ ] Run the focused test and `bun run typecheck`; commit.

### Task 4: Make both hosts readiness- and version-safe

**Files:**
- Modify: `src/components/learner/ActivityHost.tsx`
- Modify: `src/components/learner/GeneratedPracticeHost.tsx`
- Create: `src/components/learner/activityResolution.ts`
- Create: `src/components/learner/activityResolution.test.ts`

- [ ] Add failing resolver tests: account loading cannot play SSR content; account pinned tree missing route unit/activity returns moved/not-assigned; global duplicate activity ID in another unit cannot satisfy the route; guest may use SSR content; version/config changes produce a new Player key.
- [ ] Extract a pure `resolvePlayableActivity` helper returning `loading | blocked | moved | ready` with exact unit membership. Account mode never falls back to published SSR once session mode is known.
- [ ] Keep hooks unconditional, but render a calm loading skeleton until `ready`; render learner picker/session error/not-assigned before mounting any Player.
- [ ] Give Player a stable key containing learner, program version (or a deterministic resolved-tree/config fingerprint already available), unit, activity/shelf item, kind, and generated sequence so same-kind config replacement resets state.
- [ ] Parse config with `safeParse` in the host and render the calm malformed-content state instead of throwing.
- [ ] Pass Players only `config`, `onComplete(response)`, `onExit`, and bounded learner context. Await the promise before transitioning to reward.
- [ ] Run resolver tests and `bun run typecheck`; commit.

### Task 5: Centralize completion feedback and the single reward

**Files:**
- Modify: `src/content/types.ts`
- Modify: all 14 existing `src/activities/*/Player.tsx`
- Delete after migration: `src/activities/_shared/RewardOverlay.tsx`
- Modify: `src/components/learner/ActivityHost.tsx`
- Modify: `src/components/learner/GeneratedPracticeHost.tsx`
- Create: `src/activities/_shared/CheckFeedback.tsx`
- Create: `src/activities/_shared/CheckFeedback.test.ts` if the local test harness supports DOM rendering; otherwise test its pure state reducer.

- [ ] Add a failing registry/source test that Players call `onComplete(response)` only and that no Player imports `RewardOverlay`.
- [ ] Change `ActivityPlayerProps` so `onComplete` accepts only the typed response. Remove per-Player calls to `score(config, response)` and all local final reward phases.
- [ ] Add a small shared check/retry state primitive: neutral, gentle “try another way” after an incorrect local check, and “ready” after a valid final response. Keep plugin-specific correctness pure; do not create a universal interaction engine.
- [ ] Make host phase `saving | save-failed | reward`. On completion, call `record`, use only its canonical score, show one host reward on success, and provide retry/exit on failure without losing the response.
- [ ] Remove `RewardOverlay` once `rg 'RewardOverlay' src/activities` has no imports. Ensure generated practice follows the identical host reward path.
- [ ] Run all activity logic tests plus `bun run lint && bun run typecheck && bun run test`; commit.

### Task 6: Scope generated practice to the selected learner

**Files:**
- Modify: `src/lib/tutor/shelf.ts`
- Modify: `src/lib/tutor/shelf.test.ts`
- Modify: `src/lib/tutor/store.ts` (`PlayableShelfItem`, account-only lookup removal/replacement)
- Modify: `src/app/(learner)/actions.ts`
- Modify: `src/app/api/practice/route.ts`
- Modify: `src/app/(learner)/learn/[programSlug]/generated/[generatedId]/page.tsx`
- Modify: `src/components/learner/GeneratedPracticeHost.tsx`
- Modify: their existing tests

- [ ] Add failing tests proving generation/listing/completion cannot cross learner IDs under the same account and a shelf item's source activity/config/kind cannot be substituted at play or record time.
- [ ] Require learner ID throughout shelf target selection, generation locks, reads, and completion queries; keep account tenancy checks at every store boundary.
- [ ] Include the owning learner ID in the bounded shelf DTO and resolve the generated row only after selected-learner state is available. Block before Player render unless the selected learner owns the row; remove or stop using the account+program-only `getGeneratedActivityForAccount` path.
- [ ] Return a bounded server-issued practice item ID/witness for in-session generation and bind it to learner, program, source activity, kind, config hash, and short expiry using existing secret/HMAC conventions if an ephemeral row is not already available. Prefer persisting the existing generated row model over inventing a second token system.
- [ ] Update both hosts and practice route tests to pass only identifiers in account mode and use the server-bound config.
- [ ] Run the focused shelf/practice/action tests; commit.

### Task 7: Foundation verification

- [ ] Run `rg -n 'onComplete\([^)]*,|RewardOverlay|score: \{' src/activities src/components/learner 'src/app/(learner)'` and inspect every match.
- [ ] Run `bun run lint && bun run typecheck && bun run test && bun run build`.
- [ ] Smoke-test one authored and one generated activity in Chromium: no pre-readiness interaction, one reward, retry survives a simulated failed persistence call, and a second learner cannot see/play the first learner's shelf item.
- [ ] Commit any test-only fixes, record the green commands and final commit hash, and hand the branch back for wave-1 branching.
