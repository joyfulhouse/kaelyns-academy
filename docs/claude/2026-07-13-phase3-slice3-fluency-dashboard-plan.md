# Phase 3 Slice 3 — Parent Fluency Dashboard — Implementation Plan

Date: 2026-07-13. Follows Slice 1 (WCPM recording, PR #62) + Slice 2 (scheduler, PR #63).
Roadmap: `docs/claude/2026-07-12-growth-roadmap-research.md` (Phase 3 "Fluency + memory").
Slice 3 of 4 (4 = decodable-text pipeline).

## Goal

Turn the WCPM (words correct per minute) that Slice 1 records into a **reading
fluency chart on the parent's learner page** — WCPM over time against an
age-appropriate reference band. Pure read + render: **no new tables, no
migration**. Parent-only, §8-clean (WCPM + dates are already-stored derived
data; no new child PII).

## Locked decisions (from scouting)

| Decision | Choice |
|---|---|
| Data source | `attempt.response` jsonb `.wcpm` on rows where `kind = "oral-reading"` (sentence mode only populates `wcpm`; word-mode rows have none and are dropped). Server-*computed* in Slice 1 but **client-echoed into the persisted attempt** (the platform's client-authoritative attempt model — same as every activity score; Slice 1 risk-accept). Treat as **indicative self-data**, not a secured metric; the reader clamps to the aligner's 0..300 range so a forged value can't distort a household's own chart. No new column/table. |
| Store reader | New `getFluencyHistory(accountId, learnerId, limit=60): Promise<FluencyPoint[]>` in `src/lib/tutor/store.ts`, mirroring `getRecentAttempts`. Tenancy via `withOwnedLearner` (fail-closed `[]`). Select `{day, response, createdAt}` where `learnerId` + `kind="oral-reading"`, `orderBy desc(createdAt)` + `limit`, then `.reverse()` to chronological — keeps the MOST RECENT 60 so the chart tracks recent growth rather than freezing on the first 60 attempts ever (corrected from an initial asc lock). Extract-and-filter `wcpm` in JS (`typeof === "number" && Number.isFinite`), NOT a `response->>'wcpm'` SQL cast. `FluencyPoint = {day, wcpm}`. |
| Parent data wrapper | New `getLearnerFluency(learnerId): Promise<FluencySeries | null>` in `src/app/(parent)/data.ts`, mirroring `getLearnerRewards`: `withAccount` → `withOwnedLearner`. Dedupe to **one point per day = that day's max wcpm** (the child's best that day), chronological; `label = relativeDay(day)` (exists at data.ts:125). `FluencySeries = {learner, points:[{day,wcpm,label}], latest, best}`. |
| Placement | `src/app/(parent)/parent/learners/[id]/page.tsx` — add `getLearnerFluency(id)` to the existing `Promise.all`; render a new `<ReadingFluencyCard>` section between `RecentAttempts` and `<CheckpointResultsPanel>` (the "Reading & Comprehension" story). Honest empty state (calm "No reading-aloud yet" line or render nothing) when `points.length === 0`. |
| Chart | Hand-rolled inline **SVG**, no library (package.json has none — grep-confirmed). Mirror `src/components/ui/ProgressRing.tsx`: SSR-safe `<svg>`, `role="img"` + `aria-label`, CSS-var/static-Tailwind strokes. New RSC `src/components/parent/FluencyChart.tsx`: deterministic viewBox, `<polyline>` + `<circle>` dots, x = index-spaced, y = scaled to a fixed ceiling. Phosphor icons only (e.g. `TrendUpIcon`), never Lucide. Deterministic (no Date.now/Math.random). |
| Reference band | Faint shaded rect / guide lines for the **early grade-1 band ~10–30 WCPM** — the pilot is ENTERING grade 1, so do NOT anchor to the 53 WCPM end-of-G1 Hasbrouck–Tindal norm. y-ceiling ~60–80 so the band sits low and growth is visible without implying "behind". Quiet label ("typical early 1st grade"). |
| §8 / tenancy | No new child PII: WCPM + day are already-stored derived numbers shown only in the auth-gated parent page body. Keep the child's name OUT of `document.title`/`generateMetadata` and the chart `aria-label` (page already sets `title:"Learner"` — memory `child-pii-not-in-document-title`). All reads `withAccount` → `withOwnedLearner`, `null`/`[]` fallback for non-owned (fail-closed). |

## Files

Create:
- `src/components/parent/FluencyChart.tsx` (+ `.test.tsx`) — RSC inline-SVG
  chart: props `{points:[{day,wcpm,label}], latest, best}`; draws the reference
  band + polyline + dots; `role="img"` aria-label summarizing latest/best/trend
  (no child name); renders an empty/nothing state for `points.length === 0`.
  Deterministic path from points → stable polyline (snapshot-testable).

Touch:
- `src/lib/tutor/store.ts` — add `FluencyPoint` + `getFluencyHistory` (import
  `asc` if missing).
- `src/app/(parent)/data.ts` — add `FluencySeries` + `getLearnerFluency`
  (per-day max dedupe, chronological, `latest`/`best`, `relativeDay` labels).
- `src/app/(parent)/parent/learners/[id]/page.tsx` — fetch in the `Promise.all`
  + render `<ReadingFluencyCard>`/`<FluencyChart>` section with the honest
  empty state.
- Tests: `src/app/(parent)/data.test.ts` — `getLearnerFluency` mapping
  (per-day max dedupe, chronological order, latest/best, empty → null-ish,
  non-numeric/absent wcpm dropped, non-owned learner → null fail-closed);
  `FluencyChart.test.tsx` — deterministic points → stable path; empty → empty
  state; aria-label has no child name.

## Sequencing / risks

- App-only, pure read+render. No infra, **no migration, no seed re-run**.
- Deterministic SSR chart (no clock/random) — snapshot-stable.
- **Tone risk:** this is parent-facing progress data for a 6-year-old. The band
  must read as *encouraging* (early-G1 band, growth-visible), never as a
  ranking/deficit. Reviewers to sanity-check the framing + that no child name
  leaks into title/aria-label.
- The pilot has no WCPM data yet (no learners in prod), so the empty state is
  the first thing that ships live — it must be calm and correct.
