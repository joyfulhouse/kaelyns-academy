# Adventure 2.0 Phase C — Slice C1: Baseline Placement

**Date:** 2026-07-03
**Status:** Design approved; awaiting user spec review
**Parent design:** `docs/superpowers/specs/2026-07-01-adventure-2-design.md` (§3.5 assessment data model, §5 parent surface, §10 assessment & placement, §13 non-goals)
**Predecessor slices:** Phase A (choice & motivation), B1 (Life Skills Math), B2 (Science & Nature) — all shipped, live. C1 follows the same slice pattern.
**Original placement intent:** `docs/curriculum/kaelyn-adaptive/assessment.md` (per-strand entry-rung probes, the "breezes / solid / struggles" decision rule).

## 1. Context

Phase C is "assessment & placement": the platform should measure a learner's
real level and start her there, instead of everyone grinding from unit 1. Today
this is unbuilt — `unit.checkpoint` is a **badge only** (rendered as a
"· check-in" label in `UnitView`), the `checkpoint_result` capture from the v3
spec was never written, and there is no placement engine. The pilot learner is a
just-finished-kindergarten, on-track (and in math, ahead — she already
multiplies) child, so "don't make her review what she owns" is the highest-value
outcome in the whole phase.

Phase C is sliced like Phase B. **C1 = Baseline Placement** — the first,
highest-value cut: a one-time, forgiving "show what you know" check-in per
academic strand whose result, once a parent confirms it, starts the learner at
her real level. Mid/final checkpoints, re-placement from ongoing play, and a
numeric band engine are later slices (C2).

## 2. Goal

When a new learner starts `kaelyn-adaptive`, she is offered a short, no-fail
**baseline check-in** in each of the three deep academic ladders — **Reading,
Word Study, Math**. Her first-try accuracy is captured to a new
`checkpoint_result` row (nothing about her level changes yet). The parent sees a
per-skill result on the learner detail page and, with one explicit tap, **applies
the placement** — pre-seeding `skill_state` for the skills she demonstrably owns
so the **existing recommender** starts her past the rungs she's beyond. Built on
the current mastery/recommender engines with a single small additive change; no
auto-apply.

## 3. Architecture — the end-to-end loop

1. **Offer.** A strand whose learner has no baseline `checkpoint_result` surfaces
   its `checkpoint:"baseline"` unit first ("Show me what you know!"). Forgiving
   and no-fail like every activity; the child never sees a score.
2. **Play & capture.** Each item records through the existing `recordAttempt`.
   The unit is resolved from the activity via the same server-side
   membership-witness lookup the star-mint gate already uses
   (`findUnitIdOfActivity`); when that unit's `checkpoint` is `"baseline"`, the
   attempt folds **only into the `checkpoint_result` row — it does NOT advance
   `skill_state`.** This is what guarantees *nothing changes about her level
   until a parent confirms*. She still earns stars per activity (to her it is
   simply play).
3. **Finalize & suggest.** When the check-in unit is complete, its
   `checkpoint_result` (`phase:"baseline"`, `scores`: per-skill first-try rate)
   is finalized and the **placement engine** computes a per-skill verdict + the
   set of skills to seed.
4. **Parent confirms.** The suggestion surfaces on `parent/learners/[id]` with an
   explicit **Apply** (and **Not now / Redo**). No auto-apply (§13).
5. **Apply.** `applyPlacement` pre-seeds `skill_state`: for each "breezed" skill
   it writes a `solid` evidence entry tagged `source:"baseline"`, in one
   transaction, and flips the result `status→applied`. The **existing
   recommender** (`strandProgress` → first not-yet-solid lesson) now starts her
   past the mastered rungs. The recommender itself is unchanged.

Reuses unchanged: `recordAttempt` tx, `star_ledger`, the recommender
(`nextBest`/`strandProgress`), the plugin contract, forgiving scoring.

## 4. Data model

- **New table `checkpoint_result`** (spec §3.5, extended for the parent gate):
  - `id` (uuid, pk)
  - `learnerId` (fk learner, cascade)
  - `enrollmentId` (fk enrollment, cascade)
  - `unitId` (text — the authored baseline unit's stable key)
  - `phase` (text: `"baseline" | "mid" | "final"` — C1 only writes `"baseline"`)
  - `scores` (jsonb: `{ [skillSlug]: number }` — first-try rate 0..1 per probed skill)
  - `status` (text: `"pending" | "applied" | "dismissed"`, default `"pending"`)
  - `createdAt` (timestamp), `appliedAt` (timestamp, nullable)
  - Unique index on `(learnerId, unitId, phase)` — one live baseline result per
    strand check-in per learner (Redo deletes the row so it can be re-taken).
- **`skill_state.evidence` entries gain `source: "play" | "baseline"`** —
  optional, defaults to `"play"` when absent (back-compatible with existing
  rows). This is the provenance seam that keeps the parent report honest.
- **COPPA (§3.7):** `checkpoint_result` is added to `buildLearnerExport` (read)
  and covered by `deleteLearner` (cascade FK) in the same PR that creates it;
  the export type gains a `checkpointResults` array.
- **No star-ledger change:** baseline activities earn stars via the existing
  `activity_complete` reason (they are ordinary forgiving activities). The
  reserved `checkpoint` ledger reason stays for C2.

## 5. The baseline check-in content (3 authored units)

Three `checkpoint:"baseline"` units — one per strand (Reading, Word Study, Math)
— authored as static TS appended to `kaelyn-adaptive`, world-themed like the
strand, each ~5–8 items **ascending through that strand's skills** (roughly one
probe per rung/skill) using **existing activity kinds only** (no new plugins).

- **Forgiving / no-fail** is inherited (wrong answers re-prompt; every item
  finishes ≥1 star). The child sees encouragement, never a score. The placement
  signal is the silently-recorded **first-try** rate (`attempts` →
  `firstTryRateFromAttempts`), not completion.
- **Parent-reviewed for correctness** before seeding (same bar as all content);
  answer keys hand-audited.
- Rides `seed-content.ts` — **required prod re-seed** after merge (curriculum is
  DB-preferred), exactly as B1/B2.
- Each unit carries `checkpoint:"baseline"`; it is surfaced first in its strand
  and, once its `checkpoint_result` exists, treated as done (not re-offered)
  until a parent uses **Redo**.

## 6. The placement engine (mapping rule)

A pure, framework-free module `src/lib/placement/` (mirrors `src/lib/tutor/mastery.ts`):

- **Input:** a finalized `checkpoint_result.scores` + the program's skill list.
- **Output:** `{ seed: SkillTag[]; verdicts: { skill: SkillTag; band: "breezed" | "mixed" | "not_yet"; rate: number }[] }`.
- **Rule per probed skill:**
  - `rate ≥ 0.8` → **breezed** → seed `solid` (she owns it).
  - `0.5 ≤ rate < 0.8` → **mixed** → do not seed (she'll practice it normally).
  - `rate < 0.5` → **not_yet** → do not seed.
  - Thresholds are named constants (`BREEZED_MIN = 0.8`, `MIXED_MIN = 0.5`),
    tunable in one place.
- **Forward-only:** baseline can only *skip review*; it never places a learner
  below the start. If she breezes nothing, applying is a no-op and she begins at
  rung 1 (today's behavior).
- Deterministic and unit-tested; consumes no I/O.

## 7. Parent confirmation surface

On `src/app/(parent)/parent/learners/[id]/page.tsx`, a **"Check-in results"**
panel (a neighbor of the per-domain progress rows and `RewardsPanel`):

- For each strand with a `pending` baseline result: the per-skill verdicts
  ("breezed / practicing / not yet") and a plain summary ("Start her past N
  skills in Math"), with **Apply — start her here** and **Not now / Redo**.
- **Apply** → `applyPlacement(checkpointResultId)` server action: tenancy-checked
  (account owns the learner), **idempotent** (re-apply is a no-op on an already
  `applied` row), writes the seeded `source:"baseline"` evidence and flips
  `status→applied` in one transaction.
- **Redo** deletes the `checkpoint_result` row (and never seeds), so the strand's
  check-in is offered again.
- Applied results render "Placed from check-in on <date>."

## 8. The one mastery-engine change

`src/lib/tutor/mastery.ts` + the `skill_state` write path:

- Evidence entries carry an optional `source`. `deriveOutcome`'s **logic is
  unchanged** — a `baseline`-sourced `solid` counts as `solid` for progression,
  so the recommender starts her ahead with no recommender change.
- The **parent report** (`getLearnerDetail` / `SkillsByDomain`) reads `source` to
  label a placed skill distinctly ("placed from check-in") vs one mastered over
  time. Missing `source` ⇒ `"play"` (back-compatible).

This is the only change to the mastery engine: additive, back-compatible, and it
keeps the report honest (a one-session probe is shown as "placed," never
overclaimed as "mastered").

## 9. Testing

- **Placement engine (`src/lib/placement`):** threshold mapping (breezed/mixed/
  not_yet), forward-only (all-low → empty seed), provenance in the seed, and
  edge cases (empty scores, all-breezed).
- **`checkpoint_result` store:** a baseline unit's attempts fold into the result
  and NOT into `skill_state`; finalize; `applyPlacement` seeds the right skills
  with `source:"baseline"` and is idempotent; tenancy is enforced; Redo clears.
- **COPPA:** export includes `checkpointResults`; delete cascades (round-trip
  test).
- **Content validation:** the 3 baseline units parse, use registered kinds +
  existing skills, unique ids, and carry `checkpoint:"baseline"`.
- **e2e smoke (prod-gated):** a baseline check-in renders and can be completed;
  the parent "Check-in results" panel shows a pending result.
- Full gate before merge: `bun run lint && bun run typecheck && bun run test &&
  bun run build` + `bun run audit:dead-code`.

## 10. Deploy & CI

- Content rides `seed-content.ts` (the pre-deploy E2E gate already seeds it) —
  **no CI-gate change needed**. **Required post-merge prod `seed-content.ts`
  re-run** (DB-preferred curriculum), as B1/B2.
- **One DB migration** (the `checkpoint_result` table + the `skill_state`
  evidence shape is jsonb, so no column migration for `source`). Migrations
  auto-run via the deploy migrate initContainer.
- If the e2e smoke asserts new seeded check-in data, that data rides
  `seed-content` so the gate already has it (no separate seed to wire, unlike
  Phase A's motivation gate).

## 11. Non-Goals (this slice)

- **No mid/final checkpoints** or branch-reconvergence checkpoints (C2).
- **No auto-apply** — a parent always confirms a placement (§13).
- **No numeric "band" learner-state field / band engine** beyond the threshold
  rule; no re-placement from ongoing play ("several too-easy sessions → jump a
  rung") — C2.
- **No Science / Life Skills baseline** (single shallow units, no ladder to place
  along yet).
- `reach_checkpoint` quest kind stays reserved (C2).
- No change to the recommender, quest, or star systems (they consume skill_state
  generically).

## 12. Decision Log

| Decision | Choice | Alternatives |
|---|---|---|
| Phase C slicing | Baseline placement first (C1) | Measurement-only; full Phase C at once |
| Placement effect | Pre-seed `skill_state` (placed provenance) | Per-strand entry-point field; numeric band engine (§3.5 full) |
| Check-in delivery | Authored per-strand `baseline` check-in unit (reuse the `unit.checkpoint` seam) | One cross-strand check-in; implicit/ambient placement |
| Strand scope | The 3 academic ladders (Reading, Word, Math) | Math-only; all strands incl. Science/Life Skills |
| Pre-confirm behavior | Baseline attempts fold ONLY into `checkpoint_result`, never `skill_state` | Fold into both, roll back on dismiss |
| Placement direction | Forward-only (skip review; never place below start) | Bidirectional (step down on struggle) — C2 |
| Apply model | Parent-confirmed, explicit, idempotent | Auto-apply (a later opt-in, §13) |
| Report honesty | `source:"baseline"` → shown as "placed", not "mastered" | Treat placed = mastered (overclaims) |
