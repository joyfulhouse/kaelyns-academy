# Polish Report — Broad Pass 2 (2026-06-25)

Source: `/polish` (broad, full autonomous to prod). Plan: `docs/superpowers/plans/2026-06-25-polish-broad-pass2.md`.
Second broad pass the same day as pass 1 (`5953c12`). Three explore agents found the remaining
gaps; explorer false-positives were dropped after first-hand verification (home-page metadata already
correct via `default`; `health.ts REQUIRED_COLUMNS` already complete + prod-verified; rate-limit Map
already pruned on every new key; Switch disabled-state inherited via parent `opacity-50`; 44px
secondary kid links are WCAG-compliant).

**Deployed:** `registry.joyful.house/homelab/kaelyns-academy:058e769` — ArgoCD Synced/Healthy, 2/2 pods.
**Canary: PASS** (details below).

## What shipped (3 PRs, all merged to main, A→B→C)

### #17 `fix/polish2-resilience-seo`
- New route-shell carve-outs: `(parent)/parent/{error,not-found,loading}.tsx` and
  `(admin)/admin/{error,not-found,loading}.tsx` — adult `.surface-parent` tokens, parent/admin copy,
  `captureNonCritical` + `reset()` on the error boundaries.
- `generateMetadata` for the **curriculum** detail page (program title — public, non-PII).
- Removed a stale "Task 5.3 placeholder editor" comment in admin program detail.
- **Reverted during review (see codex catch #1):** the learner-detail dynamic title — child display
  name must not enter `<title>`. Learner title stays static `"Learner"`; `(parent)/data.ts` back to `main`.

### #18 `fix/polish2-backend-hardening`
- `api/practice`: §8 account-gate reads wrapped → explicit fail-closed `403 ai_disabled` (was a raw
  500 on a transient DB error); content-length > 16 KB → 413.
- `api/tts`: invalid-JSON / non-object body → JSON `{error:"invalid_json"}` envelope; 16 KB → 413;
  voice falls back to `enVoice()` unless `^[A-Za-z0-9_]{1,40}$`.
- `audio/[...path]`: SSRF guard rewritten with real IPv4 octet parsing (suffix checks kept).
- `api/health`: no longer echoes `err.message` publicly + **per-process 60 s Sentry throttle** (codex catch #2).
- `tutor/store` `recordAttempt`: enrollment row now `.for("update")` (curation race).
- `audio/phonemize`: manual cast → Zod `safeParse`.
- **+27 tests (471 → 498)**, incl. §8 gate-read-throws → 403 and gen-throws → 502 assertions.

### #16 `fix/polish2-ui-a11y`
- `TextInput`: removed the `outline-none` utilities that suppressed the global 3px `:focus-visible`
  ring (keyboard-focus a11y, WCAG 2.4.7) — browser-verified the ring renders.
- `globals.css` + `DESIGN.md`: `--color-ink-faint` `oklch(0.6…)` → `oklch(0.52…)` for AA on small
  text (measured 3.82 → 5.32:1 on paper; worst surface paper-sunk 4.56:1; ramp order preserved).
- `page.tsx`: ternary template-literal classNames → `cn()`.
- `EnrollmentConfigForm`: auto-dismiss "Saved" after 3 s (errors stay sticky).
- `sightword-game`: found cards get a non-color disabled cue (`opacity-75 cursor-not-allowed`).
- `SettingsForm` double-submit guard: already present → no-op (avoided a churn edit).

## Review (multi-model — codex earned the cross-model gate twice)

Per-branch ship-review agents ran a fresh opus-tier review + codex adversarial + gemini advisory +
simplifier + `typecheck/lint/build/test`, then attested and opened PRs. `merge-ready.sh check --pr`
**PASS** on all three.

- **codex (required) — two real findings opus missed:**
  1. **#17 §8 child-privacy (Medium → fixed):** the planned learner-detail `generateMetadata` put the
     child's **display name in `document.title`**, which leaks to browser history, OS tab/window
     previews, and Sentry breadcrumbs — surfaces auth-gating + robots-disallow don't cover. Reverted
     to a static title. (Captured in memory: `child-pii-not-in-document-title`.)
  2. **#18 health Sentry flood (Medium → fixed):** the new `captureNonCritical` in the health catch
     fired **once per probe** — a DB outage would bury the incident under k8s/ArgoCD/uptime probes.
     Fixed with a per-process 60 s throttle.
  - codex also proposed a streaming byte-cap for the 16 KB guard; **declined as out-of-scope** (new
    surface + breaks valid requests) — the real denial-of-wallet controls (rate limiter, §8 gate, zod
    bounds, `n` cap) are present and now test-pinned.
- **opus (fresh ship-reviewers):** clean on #18/#16; findings-fixed on #17.
- **impeccable:** #17 clean (shells token-pure, reduced-motion-safe, `role="status"` loaders); #16
  clean (ink-faint contrast independently re-derived → **KEPT**, no palette muddying); #18 clean
  (no visual surface — route handlers; attested per the gate's `src/app/`=frontend rule).
- **code-simplifier:** no-op on all three (already idiomatic; the only duplication, the 413 guard,
  would need a new exported function — forbidden by the Scope Boundary).
- **gemini (advisory):** unavailable all run (ACP init timeout — infra, never blocks).

## Canary (prod, `058e769`)

`/api/health` `/` `/learn` `/sign-in` `/sitemap.xml` `/robots.txt` → 200 · `/parent` `/admin` → 307
(auth redirect) · CSP live + enforcing with `media-src 'self' blob:` · ArgoCD Synced/Healthy 2/2.
A single `UnauthenticatedError: Not authenticated` appeared in the rollout-window pod scan; isolated
and **did not reproduce** on warm pods (public routes log nothing; unauthenticated `/parent`/`/admin`
return clean 307s) — a transient cold-start auth event on a protected route, not a regression.

## Migrations

**None this pass** — no schema changes (B's `.for("update")` is a query-level lock).

## Follow-ups shipped after the run

- **PR #19 — keyboard focus ring restored everywhere (a11y, WCAG 2.4.7); deployed `ad42c41`, canary green.**
  Removed the `outline-none` ring-suppression from `Select.tsx`,
  `components/admin/editor/ConfigEditor.tsx`, and `SkillTagCombobox.tsx` (trigger **and** popover
  search input) — plus, beyond the original Select/editor scope, the `activities/journal-prompt`
  kid input + textarea, which carried the identical bare-`outline-none` gap. A repo-wide grep now
  shows **zero** actual `outline-none` suppressions (only explanatory comments), closing the
  WCAG 2.4.7 keyboard-focus gap that began with `TextInput`. Gate green (typecheck/lint/498 tests/
  build; codex approve, no findings).

## Deferred (out of scope — recorded, not built)

- Auth gate logs `UnauthenticatedError` at error level on cold-start/unauth protected access →
  Sentry noise; pre-existing, non-reproducing on warm pods (observability tidy-up).
- content-length streaming byte-cap (codex's declined item).
- `STRUCTURE.md` full refresh (frozen at P0; doesn't document the route tree).
- Carryover from pass 1: pre-sync migration job + `drizzle.__drizzle_migrations` reconciliation;
  `NEXT_PUBLIC_SENTRY_DSN` build-arg (browser Sentry dark in prod); `SOURCE_COMMIT` in Dockerfile;
  admin email verification (P4); account export/delete (P6); per-learner settings UI (P6); Redis
  cluster-wide rate limiting (P1); phonics-repair fast-fail circuit-breaker (perf).
