# Polish Plan — Broad Pass 5 (2026-06-26)

Source: `/polish` (broad, no focus, full autonomous to prod). Fifth broad pass.
Pre-pass live: `d8121ab` (main; ArgoCD Synced/Healthy, canary 200 verified before exploration).

## Method

Three Explore agents swept Pages/Routes, Components/UI, and Backend/Infra. In parallel I
read the source first-hand (the §8 gate, admin gate, the shared `Field`/`Select`/`Button`
primitives, the three async forms, `globals.css` focus ring, `schema.ts` indexes, the full
`src` inventory) and the four prior pass reports + `KNOWN-RISKS-P0-PILOT.md` to dedupe.

This pass follows the precedent pass 4 set explicitly: **after four passes + the
deferred-items sweep, the in-scope backlog is effectively empty.** Every merge here is an
irreversible deploy to a live children's app, so the bar is "genuine, verified, in-scope" —
not a nominal 10-item quota. Honesty over quota.

## Verification of explorer findings (every one checked first-hand)

| # | Finding (explorer) | Verdict | Evidence |
|---|---|---|---|
| R1–R15 | Pages/Routes: auth gates, fail-closed errors, SSRF, §8, metadata, shells | **all already-handled / by-design** | routes explorer's own bottom line: zero open; cross-checked notFound()/redirect guards, boundary bubbling covers nested shells |
| B-H1 | `enrollment(learnerId)` index "missing → seq-scan" | **FALSE POSITIVE** | `uniqueIndex("enrollment_learner_program_uq").on(learnerId, programSlug)` (schema.ts:140) leads with learnerId; every query (`listEnrollments` store.ts:136, `getEnrollmentForGate`, etc.) filters learnerId-first → served by composite btree leading-column prefix. A standalone index is redundant (nil benefit, esp. at one-learner pilot). No programSlug-alone query exists. |
| B-H2/H3 | `/api/tts` + `/api/practice` explore body "no Zod" | **already-handled** | both Zod-validated (`exploreSchema` practice:96; tts typeof guards + length/voice regex); 413 + 16KB guards present |
| B-M1..M6 | rate-limiter per-instance, health Sentry throttle, putClip fire-and-forget, JSONB fail-closed, inflight map, recordAttempt lock | **all already-handled / documented** | each carries an explanatory comment + test; §8 JSONB fails CLOSED by design |
| U-H1 | EnrollmentConfigForm save-state "no aria-live" | **FALSE POSITIVE** | success `<span role="status">` (EnrollmentConfigForm.tsx:244 — implicit `aria-live=polite`); error `<span role="alert">` (253); field error via `Field` role="alert" |
| U-H2 | AuthForm errors "not announced" | **FALSE POSITIVE** | field errors via `Field` (role="alert", Field.tsx:58); form/server error `<p role="alert">` (AuthForm.tsx:162) |
| U-H3 | AddChildForm error "not announced" | **FALSE POSITIVE** | field error via `Field`; success `role="status"` (129); generic error `role="alert"` (136) |
| U-H4 | kid button focus "merges with border" | **FALSE POSITIVE** | `:focus-visible { outline: 3px solid var(--color-accent); outline-offset: 2px }` (globals.css:165-167) — 2px gap + distinct accent hue separate it from the 3px ink border; focus-ring coverage already verified pass 2 (#19) + pass 3 |
| U-H5 | Select caret "blocks iOS tap" | **FALSE POSITIVE** | caret has `pointer-events-none` (Select.tsx:48) → taps pass through to the native `<select>`; cannot block the hit target |
| U-M1 | AI button not re-gated on live parent toggle | **decline (out of scope)** | server enforces 403 (§8 intact); explorer itself notes it needs a new real-time subscription capability = new surface |
| U-M2 | NextThingCard overflow < 300px | **decline** | sub-300px viewport on a 5–7yo surface is effectively nonexistent (smallest common ~375px); cards already truncate/wrap; speculative, no repro |
| U-M3..M5 | aria-label bloat, hero SVG fallback, iOS hint sr-only | **already-handled** | explorer marked all three already-handled |

My own grep sweep: **zero** Lucide, **zero** `eslint-disable`/`@ts-ignore`/`@ts-expect-error`,
**zero** raw AI-provider SDKs outside `src/lib/ai`, **zero** real `any` (one false hit: the word
"any" in a comment). All TODOs are documented P4/P6 phase-markers or the intentional
"coming soon" placeholder for unregistered activity kinds — not gaps.

## What this pass ships (1 worktree, 1 item)

### Worktree A — `docs/polish5-structure-refresh`

**Item 1 (the one genuine in-scope item): refresh `docs/architecture/STRUCTURE.md`.**

- **Severity:** Medium (developer-experience / accuracy; zero runtime risk — docs only).
- **Why it's genuine and in-scope:** flagged "broadly stale" in pass 1's follow-ups (#4) and
  deferred every pass since ("needs a dedicated refresh, not piecemeal"). It is the
  CLAUDE.md "Architecture / directory map" task-routing doc, so future sessions read it
  first. It still says *"Current as of P0"* and documents only the P0 skeleton: no route
  groups (`(admin)/(auth)/(learner)/(parent)`, `~offline`, `audio`, `serwist`), no
  `src/components/*` tree (it says that lands "in P2"), no `src/lib/{ai,audio,content,tutor,pwa}`,
  no `src/content/*`, no `src/activities/`; and it describes `scripts/migrate.ts` as "for the
  deploy Job" when it now runs as a Deployment `migrate` initContainer.
- **Carve-out class:** documentation refresh (explicitly allowed; backs the `docs` attestation).
- **File:** `docs/architecture/STRUCTURE.md` (rewrite the tree + conventions + "what lands
  later" to match the live `src` inventory and the current deploy mechanism). No code touched.
- **Expected commit:** `docs(architecture): refresh STRUCTURE.md to the current tree (P0→P6 landed)`.

No second worktree: there is no other genuine in-scope item, and a single file has no
conflict surface, so the parallel-worktree machinery would add ceremony with no benefit.

## Deferred (out of scope — recorded, not built)

- **P4** admin email verification (needs an email transport decision — no SMTP/transactional
  sender exists; plan: `2026-06-26-plan-p4-admin-email-verification.md`). Documented known-risk.
- **P6** account-level COPPA export/delete + AI-provenance UI + per-learner settings UI (new
  surface; plan: `2026-06-26-plan-p6-coppa-export-delete.md`).
- **P1** Redis cluster-wide rate limiting (needs a self-hosted Redis; plan:
  `2026-06-26-plan-p1-redis-rate-limiting.md`).
- ProgramPicker "show all published when zero enrollments" — cosmetic; doesn't affect what a
  child can play/record (KNOWN-RISKS). 
- `mathArrayConfig.answer` unbounded vs stepper cap 200 — no live content triggers it
  (max authored ≤ 144); content-model concern, not polish (declined pass 3).

These are roadmap **features / infra** (new surface) or conscious content decisions — not
polish refinements. They are the higher-leverage next moves, but as deliberate supervised
work, not an autonomous polish merge.

## Gate + deploy

Single branch (no worktree needed). Run the full merge-ready gate even though the diff is
docs-only: `typecheck && lint && test && build` (confirms nothing broke) + opus + codex
(adversarial, branch) + simplifier + `docs` attestation (`--status updated`) +
`impeccable --status skipped-no-frontend` (no `*.tsx/css` in the diff) + `knip clean`.
`merge-ready.sh check --pr` must be green before merge. Merge → cron/ArgoCD roll → canary
(`/api/health` 200, key routes, Sentry 5-min scan; re-probe `/` on a lone cold-start 504).
