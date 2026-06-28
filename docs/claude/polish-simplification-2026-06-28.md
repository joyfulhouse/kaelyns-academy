# Polish pass — Simplification & Maintainability (2026-06-28)

Autonomous `/polish` run, focus: **simplification, maintainability, create shared surfaces where possible.**
Pure-refactoring pass — no new product/API surface, behaviour preserved throughout. Plan:
`docs/superpowers/plans/2026-06-28-polish-simplification.md`.

## What shipped (5 PRs, merged sequentially to main)

| PR | Branch | Shared surface created | Consumers rewired | Net |
|----|--------|------------------------|-------------------|-----|
| #35 | `refactor/shared-route-error` | `src/lib/hooks/useRouteError.ts` — error-boundary Sentry effect | 4 `error.tsx` (root, parent, admin, learner) | −20/+17 |
| #34 | `refactor/shared-session-resolver` | `getSessionOrNull()` in `src/lib/auth.ts` (lazy/build-safe) | `tenancy.ts`, `admin.ts`, `(parent)/data.ts` | dedup 4→1 |
| #33 | `refactor/shared-action-results` | `src/lib/actions/results.ts` — `parseInput` + `mapActionError` | `(parent)/actions.ts`, `(admin)/admin/actions.ts` | ~−53 |
| #36 | `refactor/shared-api-helpers` | `src/lib/api/{respond,http,rate}.ts` | `api/practice/route.ts`, `api/tts/route.ts` | dedup envelopes/guards/rate |
| #37 | `refactor/shared-ui-primitives` | `src/components/ui/{EmptyState,PageHeader}.tsx` | 6 parent pages + `MarketplaceGrid` | +276/−77 |

Final integrated `main` (`17af636`): **typecheck 0, lint 0, 587 tests pass (73 files), build 0.**

## Process

- 3 parallel Explore agents → first-hand reads → 13-item plan across 6 **file-disjoint** worktrees
  (no two worktrees touched the same file → zero merge conflicts; verified before dispatch).
- Each worktree implemented + self-gated (typecheck/lint/test/build) in isolation.
- Merge-ready gate per branch: **opus** code-reviewer (max effort) returned CLEAN on all 5;
  **codex** adversarial review APPROVE on all 5; **code-simplifier** no-op on all 5;
  focused **impeccable** design critique on the two frontend branches (#35, #37) — clean.
- Merged sequentially E→B→A→C→D with a `bun run build` gate on `main` after each (~5–14s each, all green).

## Deferred (recorded, deliberately NOT built this pass)

- **WT-F (`UNTRUSTED_DATA_RULE` shared const) — DROPPED.** The constant is **not** duplicated: it is
  tailored per §8 caller — `practice.ts` says *"data describing the task"*, `report.ts` says
  *"data (such as the child's name)"*. Unifying it would change child-facing prompt wording (a §8
  product decision, not a refactor). Left both verbatim.
- **`Alert` component** across 8 form files — touches form error-display logic with existing tests;
  its own focused pass to keep risk bounded.
- **`CenteredStateScreen` + StudioHome/ActivityHost/UnitView internal split** — large, risky
  kid-surface restructure; feature-grade, not polish.
- **`ListItemCard` / `ActivityRow`** shared rows; the badge-icon `<section>` empty-state variant
  (left inline by WT-D rather than distorting the `EmptyState` primitive); `learner/actions.ts`
  dedup (leaner result shape, no `message` — would need a second helper); band-enum dedup
  (cross-cutting, would force shared files); `phonics-repair.ts` extraction (§8-sensitive).

## Notes / known drift

- **gemini** review unavailable (Google hard-deprecated the individual Code Assist client →
  "migrate to Antigravity"). It is advisory-only and never blocks; opus + codex (required) both ran.
- **knip** (`bun run audit:dead-code`) is still not wired in `package.json`; per the interim ship
  rule it was stamped clean (branch-scoped manual verification; no new dead exports introduced).
  Pre-existing tree-wide knip debt (`_archive/v2`, etc.) is out of scope.
- `STRUCTURE.md` updated in this docs PR to register `src/lib/actions/`, `src/lib/api/`,
  `src/lib/hooks/`, and the `EmptyState`/`PageHeader` primitives.

## Deploy + canary

GitOps (Forgejo `*/15` cron → Harbor → ArgoCD); the 5 merges coalesce into one build of `main`
tip `17af636`. Canary result (`/api/health` → 200) recorded below once the roll completes.

**Canary — PASS (2026-06-28).** ArgoCD rolled `17af636` (Synced + Healthy). `/api/health` → 200
(verified 4×). Spot-checks all 200: `/`, `/sign-in`, `/learn`, `/parent` (auth→sign-in), `/admin`
(auth→sign-in), `/goodbye`. Both app pods `1/1 Running` (fresh roll); zero error/exception/drift
lines in post-roll pod logs. (Sentry MCP was disconnected this session, so the post-roll error
check was done via in-cluster pod-log scan instead.)
