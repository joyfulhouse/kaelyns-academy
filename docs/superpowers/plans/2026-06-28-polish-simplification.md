# Polish pass — Simplification & Maintainability (shared surfaces)

**Date:** 2026-06-28
**Focus:** simplification and maintainability; create shared internal surfaces where duplication exists.
**Workflow:** `/polish` (full autonomous pass → parallel worktrees → merge-ready gate → sequential merge → canary deploy to production).

## Scope interpretation

"Shared surfaces" = shared **internal code** (extracted `src/lib/*` helpers, shared React
components, shared hooks). This is a **refactoring** pass — visually and behaviourally identical
output, fewer copies of the same logic/markup. It does **NOT** introduce new product surface.

### Scope Boundary (NON-NEGOTIABLE — honoured by every worktree)

Never create in this pass: a new `route.ts`; a new HTTP method export in an existing `route.ts`;
a new `page.tsx` / navigable destination; a new path segment; a new Server Action (`'use server'`
function). Hardening/refactoring existing routes/actions/pages is fine. New shared **library
modules / components / hooks** under `src/lib`, `src/components` are allowed (internal code, not
product surface). Drizzle migrations only if expand-only — none needed here.

## Worktree partition — every worktree owns a DISJOINT set of files

The rule: **no two worktrees modify the same file.** Each worktree creates a shared surface AND
rewires its own consumers, so none depends on another's unmerged code.

| WT | Branch | New files | Modified files |
|----|--------|-----------|----------------|
| A | `refactor/shared-action-results` | `src/lib/actions/results.ts` (+`.test.ts`) | `src/app/(parent)/actions.ts`, `src/app/(admin)/admin/actions.ts` |
| B | `refactor/shared-session-resolver` | — (extends `src/lib/auth.ts`) | `src/lib/auth.ts`, `src/lib/tenancy.ts`, `src/lib/admin.ts`, `src/app/(parent)/data.ts` |
| C | `refactor/shared-api-helpers` | `src/lib/api/respond.ts`, `src/lib/api/http.ts`, `src/lib/api/rate.ts` (+ tests) | `src/app/api/practice/route.ts`, `src/app/api/tts/route.ts` |
| D | `refactor/shared-ui-primitives` | `src/components/ui/EmptyState.tsx`, `src/components/ui/PageHeader.tsx` (+ tests) | 8 parent `page.tsx`, `src/app/(admin)/admin/page.tsx`, `src/app/(admin)/admin/programs/[id]/edit/page.tsx`, `src/components/parent/{AiProvenanceList,CurriculumPanel,MarketplaceGrid}.tsx` |
| E | `refactor/shared-route-error` | `src/lib/hooks/useRouteError.ts` | `src/app/(parent)/parent/error.tsx`, `src/app/(admin)/admin/error.tsx`, `src/app/(learner)/learn/error.tsx`, `src/app/error.tsx` |
| F | `refactor/shared-ai-prompts` | `src/lib/ai/prompts.ts` | `src/lib/ai/practice.ts`, `src/lib/ai/report.ts` |

Pairwise-disjoint verified: A=app actions, B=lib auth/tenancy/admin + data.ts, C=api routes/lib api,
D=ui + pages + parent components, E=error.tsx + hook, F=lib/ai. No file appears in two rows.
(`(parent)/actions.ts` [A] ≠ `(parent)/data.ts` [B]; `admin/actions.ts` [A] ≠ `lib/admin.ts` [B];
pages [D] ≠ error.tsx [E].)

## Items (13 — exceeds the 10 minimum)

| # | Item | Severity | Files | WT |
|---|------|----------|-------|----|
| 1 | `parseInput(schema, input, fallbackMsg)` — collapse safeParse + first-issue-message blocks | Medium | `src/lib/actions/results.ts` | A |
| 2 | `mapActionError(error, ctx, unavailableMsg)` — collapse the unauthenticated/capture/unavailable catch tail | Medium | `src/lib/actions/results.ts` | A |
| 3 | `(parent)/actions.ts` adopts both helpers (≈8 catch tails, ≈6 parse blocks) | Medium | `src/app/(parent)/actions.ts` | A |
| 4 | `admin/actions.ts` adopts `parseInput` + shared base in `mapError` | Medium | `src/app/(admin)/admin/actions.ts` | A |
| 5 | `getSessionOrNull()` lazy session resolver in `auth.ts` | Medium | `src/lib/auth.ts` | B |
| 6 | `tenancy.ts` / `admin.ts` / `data.ts` adopt `getSessionOrNull()` (4 copies → 1) | Medium | those 3 | B |
| 7 | `jsonError(type,status)` API error envelope | Medium | `src/lib/api/respond.ts` | C |
| 8 | `readJsonBody(req, maxBytes)` — content-length guard + JSON parse | Medium | `src/lib/api/http.ts` | C |
| 9 | `resolveRateLimit(account, req, prefix, {account,anon})` key/policy selector | Medium | `src/lib/api/rate.ts` | C |
| 10 | `EmptyState` component + 7 consumers (dashed-border empty blocks) | Medium | `src/components/ui/EmptyState.tsx` + 7 | D |
| 11 | `PageHeader` component + 8 parent-page consumers | Medium | `src/components/ui/PageHeader.tsx` + 8 | D |
| 12 | `useRouteError(ctx, error)` hook + 3–4 error boundaries | Medium | `src/lib/hooks/useRouteError.ts` + boundaries | E |
| 13 | `UNTRUSTED_DATA_RULE` shared const | Low | `src/lib/ai/prompts.ts` | F |

## Deferred (out of scope this pass — recorded, not built)

- **`Alert` component** across 8 form files (`AddChildForm`, `EnrollmentConfigForm`,
  `AssignProgramControl`, `CurriculumPanel`, `AccountDataControls`, `LearnerDataControls`,
  `SettingsForm`, `CloneToDraftButton`). Touches form **error-display logic** with existing tests;
  bundle into its own focused pass to keep risk bounded.
- **`CenteredStateScreen` + StudioHome/ActivityHost/UnitView internal split** — large, risky
  kid-surface restructuring; its own feature-grade refactor.
- **`ListItemCard` / `ActivityRow`** shared rows — medium value, follow-up.
- **`phonics-repair.ts` extraction** from `practice.ts` — §8-sensitive AI path; defer (F stays
  const-only to minimise child-facing-AI risk).
- **Band enum dedup** (`["ready","stretch"]` across content/api/ai) — cross-cutting, would force
  multiple worktrees to share files; defer.
- **`learner/actions.ts` dedup** — uses a leaner result shape (no `message`, reason `"error"` not
  `"unavailable"`); would need a second helper variant. Defer to avoid over-generalising A.
- **Missing `loading.tsx` shells** beyond existing — carve-outs, not duplication.

## Per-worktree designs

### A — shared action results
`src/lib/actions/results.ts`:
- `parseInput<T>(schema: z.ZodType<T>, input: unknown, fallbackMessage: string): { ok: true; data: T } | { ok: false; reason: "invalid"; message: string }` — `safeParse`; on failure `error.issues[0]?.message ?? fallbackMessage`.
- `mapActionError(error: unknown, context: string, unavailableMessage: string): { ok: false; reason: "unauthenticated" | "unavailable"; message: string }` — `UnauthenticatedError` → `{reason:"unauthenticated", message:"Please sign in again."}`; else `captureNonCritical(context, error)` + `{reason:"unavailable", message: unavailableMessage}`.
- Apply ONLY where the existing code returns those exact reasons/messages. Leave special cases
  (`reason:"not-found"` for an invalid id in export/delete; `EnrollmentNotActiveError`→`"inactive"`;
  `isAPIError`→`"reauth-failed"`) as explicit caller branches before delegating the tail. Preserve
  every user-facing message string verbatim. Admin: route its `mapError` unauthenticated/default
  cases through the shared base; keep its domain-error mapping (DuplicateSlug, VersionNotDraft, …).

### B — shared session resolver
`auth.ts`: add `export async function getSessionOrNull()` returning
`getAuth().api.getSession({ headers: await headers() })` (import `headers` from `next/headers`).
Stays lazy/build-safe (no top-level `getAuth()`). Rewire `tenancy.requireAccount`, `admin.resolveAdminAccess`,
and `(parent)/data.ts`'s session read to call it. Preserve exact null-handling and return shapes.

### C — shared API helpers
- `respond.ts`: `jsonError(type, status)` → `NextResponse.json({ error: type }, { status })`. Keep
  `badRequest(zodError)` (flatten) local to practice OR add a typed variant. Preserve EXACT
  `error` strings + status codes (`invalid_json`/400, `payload_too_large`/413, `rate_limited`/429
  +`Retry-After`, `invalid_text`/400, `not_found`/404, `ai_disabled`/403, `generation_failed`/502).
- `http.ts`: content-length guard (`>16384` → 413) + `request.json()` with try/catch.
- `rate.ts`: account/IP key + policy selection; **per-route policies stay arguments** (practice
  30/10, tts 60/20). **Do NOT touch the §8 gate** in practice (ownership/content-binding/enrollment,
  fail-closed 403) — extract only the surrounding response/parse/rate plumbing. tts keeps its
  `typeof body !== "object"` null-guard. Tests `practice/route.test.ts` + `tts/route.test.ts` must pass unchanged.

### D — shared UI primitives
- `EmptyState.tsx`: props `{ icon?: ReactNode; title: string; description: string; action?: ReactNode }`
  rendering the exact `grid place-items-center rounded-xl border border-dashed border-line-strong p-10 text-center`
  block (icon → `font-display text-lg font-semibold` title → `text-ink-soft` description → action). Static classes only.
- `PageHeader.tsx`: props `{ eyebrow: string; title: string; description?: string; action?: ReactNode }`
  rendering `<header>` with `font-display text-sm font-semibold text-ink-faint` eyebrow,
  `mt-1 font-display text-3xl font-semibold tracking-tight` h1, `mt-2 max-w-prose text-ink-soft` description.
- Rewire each consumer to the component **with identical rendered classes + copy**. Where a consumer's
  block differs slightly, match it via props (don't force a consumer that genuinely differs — leave it).

### E — shared route-error hook
`useRouteError.ts`: `"use client"`? No — a hook file exports a hook; the `error.tsx` files keep
`"use client"`. Hook: `export function useRouteError(context: string, error: Error & { digest?: string }) { useEffect(() => { captureNonCritical(context, error); }, [error, context]); }`.
Each boundary calls it and keeps its bespoke JSX/copy/tone (kid vs parent vs admin) + the
`{error.digest && …}` reference line. `src/app/error.tsx` included only if it follows the same
pattern; skip `global-error.tsx` (separate full-document boundary).

### F — shared AI prompt const
`prompts.ts`: `export const UNTRUSTED_DATA_RULE = "…"` (copy the EXACT current string from
`practice.ts:82`). Import in `practice.ts` + `report.ts`; delete the local copies. Leave the
`"Do not use em dashes."` line and all other prompt wording untouched. `practice.test.ts` +
`report.test.ts` must pass unchanged.

## Gate (per branch, before merge)
`bun run lint && bun run typecheck && bun run test && bun run build`; opus code-reviewer (max
effort) + codex adversarial (`--scope branch`); gemini advisory; code-simplifier. knip:
`audit:dead-code` is NOT wired in package.json → attest `knip --status clean` with a note. docs:
attest `--status deferred` (STRUCTURE.md updated once, in the final consolidated docs PR, to avoid a
shared-file conflict across 6 branches). impeccable: required for D + E (frontend); skipped-no-frontend for A, B, C, F.

## Merge order (sequential; each = a production deploy)
F → E → B → A → C → D (smallest/lowest-risk first; D last as the broadest). Build-gate + canary
(`/api/health` → 200) after each. Then a final docs PR updates `docs/architecture/STRUCTURE.md`
and writes `docs/claude/polish-simplification-2026-06-28.md`.
