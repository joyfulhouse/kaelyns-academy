# Polish Plan — Broad Pass (2026-06-24)

Source: `/polish` (no focus area → broad scan). Explore agents: Pages&Routes, Components&UI, Backend&Infra (all returned). Key files read firsthand: learner unit/activity render pages, `ActivityHost.tsx`, root layout, `next.config.ts`, repository/version-pin path.

## Health baseline (verified, not changed)
- **§8 AI-practice gate** — dual-control (per-learner `settings.aiPractice` + per-enrollment `config.aiPractice`), server-enforced, fail-closed, defensive jsonb parsing. `api/practice/route.ts:119-130`. **Correct.**
- **Version-pin** — render pages use published only as guest/pre-hydration SSR fallback; `ActivityHost`/`UnitView` resolve the learner's **pinned** tree and override (`ActivityHost.tsx:100-118`). **No divergence — by design (Fix-E L2).**
- **Build-safety** — no module-top-level `getDb()`/`getAuth()`. **Clean.**
- **AI routing** — all via LiteLLM `@/lib/ai/models`; no raw provider SDK. **Clean.**
- **Lint discipline** — no `@ts-ignore`/`eslint-disable`. **Clean.**
- Admin email-verification gap is **already tracked** in `docs/claude/KNOWN-RISKS-P0-PILOT.md` (P4; needs email transport) → **deferred, not a polish item.**

## Worktree plan (4 worktrees — no two touch the same file)

Merge order (smallest-risk first, canary between each): **A → D → C → B.**

### Worktree A — `feat/polish-resilience-seo` (carve-outs: shells + metadata)
Completes existing surfaces; adds no new product route/endpoint.
| # | Item | Sev | Files |
|---|------|-----|-------|
| A1 | On-brand `error.tsx` + `global-error.tsx` (Wonder Studio, `captureNonCritical`, reset button) | High | `src/app/error.tsx` (new), `src/app/global-error.tsx` (new) |
| A2 | On-brand `not-found.tsx` (kid-friendly, link home) | High | `src/app/not-found.tsx` (new) |
| A3 | `loading.tsx` shells for the `force-dynamic` routes (learner `learn`/`[programSlug]`/`[unitId]`/`[activityId]`, parent `curriculum`, parent `learners/[id]`) — skeletons; kid routes use calm mascot, not spinners | Med | `loading.tsx` (new, per route) |
| A4 | `sitemap.ts` + `robots.ts` (public marketing routes only; disallow `(admin)`/`(parent)`/`api`) | Med | `src/app/sitemap.ts` (new), `src/app/robots.ts` (new) |
| A5 | OpenGraph/Twitter metadata in root layout (title template already present) | Med | `src/app/layout.tsx` |
| A6 | Admin index page `metadata` export (only page missing it) | Med | `src/app/(admin)/admin/page.tsx` |

### Worktree B — `fix/polish-security-hardening` (highest risk → merges last)
| # | Item | Sev | Files |
|---|------|-----|-------|
| B1 | Security headers via existing `next.config.ts` `headers()` — `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY` (or frame-ancestors), `Permissions-Policy`, HSTS. **CSP as `Content-Security-Policy-Report-Only` first** (must not break Next inline/serwist SW/motion/fonts/MinIO audio/LiteLLM) | High | `next.config.ts` |
| B2 | Audio proxy: validate `AUDIO_ORIGIN` is `https://` and well-formed before fetch (defense-in-depth atop the path-segment guard) | Med | `src/app/audio/[...path]/route.ts` |
| B3 | `requireAdmin()`: after the allowlist check, confirm the session user row still exists (block stale sessions for deleted/disabled users). Fail-closed; preserve current redirect behavior | Med | `src/lib/admin.ts` |
| B4 | `api/tts`: empty/invalid text → structured `{ error: "invalid_text" }` body (currently bare 400) | Low | `src/app/api/tts/route.ts` |

### Worktree C — `fix/polish-data-integrity-perf`
| # | Item | Sev | Files |
|---|------|-----|-------|
| C1 | Add indexes: `learner(accountId)`, `skillState(learnerId)`, `attempt(learnerId, generated)` — **expand-only** migration | High(perf) | `src/lib/db/schema.ts`, `drizzle/0005_*.sql` (new) + `drizzle/meta/*` |
| C2 | Validate enrollment `config` + learner `settings` with their Zod schemas **at write time** (`assignProgram`/`setEnrollmentConfig`/`saveLearnerSettings`) — defensive parse already exists on read | Med | `src/lib/tutor/store.ts` |
| C3 | `captureNonCritical()`: on Sentry failure, `console.error` fallback so monitoring-down isn't silent | Med | `src/lib/capture.ts` |

### Worktree D — `fix/polish-ui-brand`
| # | Item | Sev | Files |
|---|------|-----|-------|
| D1 | `Pill.tsx`: replace inline `oklch(...)` `stretch` tone with a `--color-stretch` token; verify `success/15` text contrast ≥4.5:1 (bump opacity/tone if short) | Med | `src/components/ui/Pill.tsx`, `src/app/globals.css` |
| D2 | Settings: hide the disabled P6 "export data" / "delete account" buttons until implemented (don't show dead controls) | Med | `src/app/(parent)/parent/settings/SettingsForm.tsx` |
| D3 | Math activities: surface a calm fallback if `speech.speak()` fails (don't go silent) | Low | `src/activities/math-array/Player.tsx`, `src/activities/math-tenframe/Player.tsx` |
| D4 | Admin editor: error state + rollback on failed save (currently keeps stale data silently) | Med | `src/components/admin/editor/ProgramEditor.tsx` |

## Deferred (out of scope — new surface or P4/P6)
- **Admin email verification / forgot-password** — needs email transport (P4); already in KNOWN-RISKS. New auth flow = new surface.
- **Account-level data export + account deletion** (the settings buttons) — new server actions/surface (P6). Polish only *hides* the dead buttons (D2).
- **Per-learner settings UI** (P6) — new UI surface.
- **Cluster-wide rate limiting** (Redis/Postgres counter) — acknowledged per-instance design; infra change.
- **CSP enforcement** (vs report-only) — promote to enforcing only after report-only shows a clean report.
- **OpenAPI/API docs route** — new route.

## Gate per worktree (Step 5, before any merge)
`bun run typecheck && bun run lint && bun run build && bun run test`; opus + codex review (gemini advisory); code-simplifier; `knip` (not wired → treat clean); docs check vs `STRUCTURE.md`; stamp attestations; `merge-ready.sh check --pr <n>` (no enforcing hook — run it manually, hard gate). Then sequential merge + mandatory `/api/health` canary + Sentry check after each.
