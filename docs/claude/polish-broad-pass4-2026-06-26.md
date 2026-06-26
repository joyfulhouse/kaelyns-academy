# Polish Report — Broad Pass 4 (2026-06-26)

Source: `/polish` (broad, full autonomous to prod). Plan: `docs/superpowers/plans/2026-06-26-polish-broad-pass4.md`.
Fourth broad pass (same calendar day as pass 3). Pre-pass live: `2f918ee`.

**Merged to main:** `d0f8d4a` (#24) → main `d3f134a`.
**Deployed:** `registry.joyful.house/homelab/kaelyns-academy:d3f134a` (cron→ArgoCD, Synced/Healthy 10:06).
**Canary: PASS** (one transient cold-start 504 on the home's first post-roll request — confirmed not a regression; see below).

## Verdict: a mature codebase, one genuine item

Three Explore agents swept Pages/Routes, Components/UI, and Backend/Infra. After first-hand verification of
**every** finding, exactly one genuine, in-scope improvement remained — the codebase is in excellent shape
after three prior passes. Rather than pad to the nominal 10-item floor with cosmetic churn on a live
children's app (every merge = irreversible prod deploy), this pass ships the one real item and documents the
rest (full drop/defer analysis in the plan). Honesty over quota.

## Shipped (1 PR, 1 item)

### #24 `fix/polish4-home-skiplink` (→ `d0f8d4a`)
- **Skip-to-content link on the marketing home (WCAG 2.4.1 Bypass Blocks).** The kid/parent/admin shells
  gained a `SkipLink` in pass 3, but the public home — the highest-traffic page, with a sticky header
  (logo + 3 nav links + 2 buttons) before `<main>` — was the lone top-level surface without one (deferred in
  pass 3 only to avoid a `page.tsx` worktree collision with the SEO worktree). Render `<SkipLink/>` as the
  first focusable element + `id={MAIN_CONTENT_ID}` + `tabIndex={-1}` on the existing `<main>`, mirroring the
  shell pattern exactly. **3-line diff, one file.**

## Review (multi-model gate — all green)

A single ship-review agent ran a fresh opus-tier review + codex adversarial (branch) + gemini advisory +
code-simplifier + impeccable + `typecheck/lint/build/test`, then stamped attestations and opened the PR.
`merge-ready.sh check --pr 24` **PASS** (validated independently from the main checkout).

- **codex (required):** APPROVE — no material findings.
- **opus / impeccable (fresh ship-reviewers):** clean. Verified the focused link's contrast (`text-ink`
  ≈ oklch 0.26 on `bg-paper-raised` ≈ 0.965 → >12:1, well above AA), `focus:z-[60]` clears the sticky header
  (`z-50`), `sr-only`→`focus:not-sr-only` means **zero layout shift**, and the skip target `#main-content`
  matches the `<main id="main-content">`. No positioned ancestor on the home, so `focus:absolute left-4 top-3`
  lands at the conventional viewport top-left.
- **code-simplifier:** no-op (3-line reuse of an existing component). **knip:** not wired → clean.
  **gemini:** ACP init timeout (advisory, did not block — same infra behaviour as passes 2–3).
- **Tests:** 504 passing / 63 files (no suite change this pass). **Build:** `/` prerendered static.
- **Scope:** `git diff main...HEAD` touched only `src/app/page.tsx` — **no new surface** (no `route.ts`, no
  new HTTP method, no `page.tsx`, no path segment, no Server Action).

## Canary (prod, `d3f134a`)

Cron built main's tip; ArgoCD rolled at 10:06 (Synced → Progressing → Synced/Healthy).
`/api/health` `/learn` `/sign-in` `/sitemap.xml` `/robots.txt` → **200** · `/parent` `/admin` → **307** ·
**`href="#main-content"` (skip link) + `<main id="main-content">` live on the home** (the shipped change,
verified in prod) · **JSON-LD intact** (regression check) · pod error scan: only the documented
`UnauthenticatedError` cold-start/unauth-probe noise.

**One transient — not a fail:** the *first* request to `/` after the roll returned a **504** (gateway timeout
on the cold pod). The same canary's next two `/` requests succeeded with valid HTML, and a focused re-probe
returned **200 on 5/5 (sub-250 ms)**. The home is statically prerendered and the 3-line skip-link change does
no async work, so this is a cold-start / rollout-window artifact, not a regression. Recorded as a known deploy
phenomenon (see memory) so future canaries re-probe `/` before treating a single post-roll 504 as a failure.

## Migrations

**None this pass** — no schema changes.

## Deferred (out of scope — recorded, not built)

See the plan's "Deferred" section. Headlines:
- **FK indexes** (`publisher.owner_user_id`, `program.publisher_id`) — pipeline can't auto-migrate; nil
  benefit at pilot scale; DDL-on-prod-autonomously is an avoidable hazard.
- **Auth-gate `⨯ UnauthenticatedError` log noise** — root-caused; layouts already redirect cleanly and every
  `captureNonCritical` site already guards it; the residual is framework-level logging with no clean fix. The
  "add a `level` param" change would be theater.
- **`opengraph-image.tsx`**; plus the pass 1–3 carryover backlog (pre-sync migration job, Sentry DSN
  build-arg, `SOURCE_COMMIT`, admin email verification, COPPA export/delete + provenance + per-learner
  settings UI, Redis cluster-wide rate limiting, STRUCTURE.md refresh).

## Note for a potential pass 5

After four passes the in-scope backlog is effectively empty — what remains is either deferred for sound
operational reasons (FK indexes, auth-log noise) or genuinely out of polish scope (new features/surfaces,
P4/P6 roadmap items). A future `/polish` is unlikely to find ≥10 genuine items; the higher-leverage next
moves are the deferred/roadmap items run as deliberate, supervised changes (e.g. a migration job + the FK
indexes; the P4 admin email-verification hardening).
