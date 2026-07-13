# Phase 3 Slice 2 — Spaced-Repetition Scheduler — Implementation Plan

Date: 2026-07-13. Follows Slice 1 (sentence reading v2, PR #62 @ 11b04ad).
Roadmap: `docs/claude/2026-07-12-growth-roadmap-research.md` (Phase 3 "Fluency + memory").
Slice 2 of 4 (3=parent fluency dashboard, 4=decodable pipeline).

## Goal

When a learner masters a skill, schedule it to resurface for review on a
**1 / 3 / 7 / 21-day ladder** (promote on a successful review, demote on a
struggle). Due reviews appear as a **"Warm up" row** on the home surface,
resurfacing the AUTHORED activities that practice the due skill. Pure DB — no
LLM, not AI-gated (it replays authored content). The "memory" half of the
fluency-and-memory phase.

## Locked decisions (from scouting)

| Decision | Choice |
|---|---|
| Data model | **New sparse `review_schedule` table**, keyed `(learnerId, skill)` — one row per skill that reached `solid` (NOT a column-widening of the hot `skill_state` row, which `getSkillState` reads on every learner-surface load). Matches the codebase's concern-table pattern (`checkpoint_result`, `generated_activity`, `star_ledger`). Columns: `id` (uuid pk), `learnerId` (fk learner, cascade), `skill`, `programSlug`, `intervalIndex` (int 0..3 into `[1,3,7,21]`), `nextReviewOn` (date), `lastReviewedOn` (date, nullable), `lastOutcome`, `updatedAt`. Unique `(learnerId, skill)`; index `(learnerId, nextReviewOn)`. |
| Ladder | `REVIEW_LADDER_DAYS = [1, 3, 7, 21]`. Promote: `intervalIndex = min(idx+1, 3)`, `nextReviewOn = day + LADDER[newIdx]`. Demote (a scheduled skill comes back emerging/not_yet): `intervalIndex = 0`, `nextReviewOn = day + 1`. Pure ladder math in a new `src/lib/tutor/schedule.ts` (mirrors `mastery.ts`, unit-tested). |
| Where scheduling writes | In `recordAttempt` (`src/lib/tutor/store.ts`), inside the existing single tx, in the non-checkpoint skill-evidence fold branch, per skill, reusing the freshly-derived `outcome` (from `deriveOutcome`). Follow the same skill-sorted `FOR UPDATE` lock ordering to avoid deadlocks. Checkpoint attempts skip (already isolated); generated-practice attempts DO fold skill_state so they feed the scheduler too. First time a skill becomes `solid` → insert a `review_schedule` row at `intervalIndex 0`, `nextReviewOn = day + 1`. |
| Baseline-placed solids | Parent baseline placements (`source:"baseline"`, never practiced in-app) that resolve to `solid` **ARE scheduled**, starting at `intervalIndex 0` (`nextReviewOn = day + 1`) so the first review validates the placement. (Scout's open question — resolved: yes, schedule them.) |
| Due-item read | New `getDueReviews(accountId, learnerId, programSlug, today)` in `store.ts`: `review_schedule` rows where `nextReviewOn <= today`, scoped to this program's skills, mapped skill → authored activities that practice it (reuse the resolved authored tree + `recommend.ts` helpers; exclude activities already completed today). Added to the `Promise.all` in `getLearnerStateAction`; new `dueReviews` field on `LearnerStateResult`. |
| Surface | A **"Warm up" row** on `StudioHome` (sibling of `TodaysAdventures`, shown above the map when non-empty), curated through `curateAdventureCandidates` (respects parent unit-curation). Review items are authored activity ids → play through the normal `recordAttemptAction` authored path; NO new play/scoring surface. Copy: warm, low-pressure ("Let's warm up with something you know!"). Never a chore/streak framing. |
| Gating | Pure DB. NOT AI-gated (no LLM). Only the existing tenancy + `available` (active-enrollment) checks in `getLearnerStateAction` apply. No new child PII (skill ids + dates only). |
| Migration | `bun run db:generate` → `drizzle/0012_*` (journal last tag `0011_thankful_franklin_richards`). Add the table to `REQUIRED_COLUMNS` in `src/lib/db/health.ts` (schema-drift canary) and add a column-list + FK-cascade test to `src/lib/db/schema.test.ts`. Migrations auto-run via the deploy initContainer. |

## Files

Create:
- `src/lib/tutor/schedule.ts` (+ `schedule.test.ts`) — pure ladder math:
  `promote(idx)`, `demote()`, `nextReviewOn(day, idx)`, and a
  `nextSchedule(current, outcome, day)` reducer returning the new
  `{intervalIndex, nextReviewOn, lastReviewedOn, lastOutcome}` (or "unschedule"
  when never-solid). Deterministic; takes `day` as input (no clock reads).
- `drizzle/0012_*` migration (generated).

Touch:
- `src/lib/db/schema.ts` — `reviewSchedule` table + relations.
- `src/lib/db/health.ts` — add `review_schedule` REQUIRED_COLUMNS entry.
- `src/lib/db/schema.test.ts` — column list + FK cascade test.
- `src/lib/tutor/store.ts` — schedule upsert inside `recordAttempt` tx (per
  skill, reuse derived outcome, sorted lock order); new `getDueReviews`.
- `src/app/(learner)/actions.ts` — `getLearnerStateAction` folds
  `getDueReviews` into the `Promise.all`; `LearnerStateResult` gains
  `dueReviews`.
- `src/components/learner/StudioHome.tsx` — render the "Warm up" row from
  `dueReviews` (through `curateAdventureCandidates`), non-empty only.
- `src/components/learner/adventureCandidates.ts` — fold review candidates
  through the existing curation.
- Tests: `schedule.test.ts` (ladder promote/demote/first-schedule/baseline),
  store tests (schedule written on solid; demote on struggle; getDueReviews
  filters by date + program + not-completed-today), a learner-state test that
  `dueReviews` surfaces, and a StudioHome render test for the Warm-up row.

## Sequencing / conventions

- Copy the shape of C1 baseline-placement (PR #54/#55) and B3 shelf (PR #56):
  new table → store logic → server-action field → surface → tests.
- App-only slice (no infra). No new authored content, so **no prod
  seed-content re-run needed** (schema migration auto-runs on deploy).
- The scheduler must be deterministic (no `Date.now()` in pure modules — pass
  `attempt.day`); StudioHome render stays deterministic + static class maps +
  Phosphor icons; never-red / low-pressure kid copy.
- §8: no new child PII (skill ids + dates); no LLM; server-authoritative reads
  behind the existing tenancy/enrollment gate.

## Risks / open items

- **"Warm up" row vs the One Big GO single-hero principle:** Phase 1 deliberately
  reduced parallel choices. The Warm-up row must not compete with the hero — show
  it as a *small* secondary row (or fold the single most-due review into the hero
  as the "Continue" target when nothing else is pending), not a second big CTA.
  Codex/review to sanity-check the hierarchy.
- **Item-level vs skill-level:** Slice 2 schedules at the *skill* grain (simpler,
  matches skill_state). Item-level scheduling is a later refinement.
- **Demotion source:** only demote a skill that HAS a `review_schedule` row (was
  solid) and comes back emerging/not_yet on a *review* — don't thrash on unrelated
  practice of the same skill. Verify the write path keys on the scheduled row.
