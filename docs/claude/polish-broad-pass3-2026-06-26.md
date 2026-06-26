# Polish Report — Broad Pass 3 (2026-06-26)

Source: `/polish` (broad, full autonomous to prod). Plan: `docs/superpowers/plans/2026-06-26-polish-broad-pass3.md`.
Third broad pass; prior: `5953c12` (pass 1), `058e769`/`ad42c41` (pass 2). Pre-pass live: `6637106`.

**Merged to main (A→B→C):** `67a88ac` (#21) → `6370ab4` (#22) → `353f91f` (#20).
**Deployed:** `registry.joyful.house/homelab/kaelyns-academy:353f91f` (cron→ArgoCD, Synced/Healthy 06:47). **Canary: PASS.**

## Method

Three Explore agents swept Pages/Routes, Components/UI, Backend/Infra. Headline: the **backend is
excellent** (fail-closed §8 gates, build-safe lazy factories, no real defects) and the **design system
is healthy** (no Lucide, no dynamic Tailwind class strings, semantic tokens, global `:focus-visible`
ring, every animation `motion-safe:`-gated, no raw `<img>`/`<Image>`, strong aria-label coverage).

A third same-week pass hits diminishing returns, so verification mattered: ~10 explorer findings were
**dropped first-hand as false positives or non-issues** before planning (Sun spin already
`motion-safe:`-gated; "Level X of Y" uses the mid `ink-soft` tone and clears AA; pre-ready progress
flash is guarded by `ResolvingSurface`; math-array minus already disabled at 0; reading-comprehension
already shows a check on the chosen card and is forgiving by design; sightword decoy double-nudge
trivial; Button opacity-disabled is a valid cue; ProgressRing live-region / Pill tones speculative;
the "16 missing shells" over-counted — parent/admin not-found shells from pass 2 already cover their
dynamic routes via boundary bubbling). The genuine work clustered in **accessibility**.

## What shipped (3 PRs, 13 concrete improvements)

### #21 `fix/polish3-activity-a11y` (→ `919b2719`)
- **Non-color correctness cue (WCAG 1.4.1):** on choice reveal, the correct answer was distinguished
  by green background **alone** in `lang-listen-match` and `lang-symbol-intro` — a colorblind child
  couldn't tell their wrong pick from the correct one. Added a `CheckCircleIcon` badge on the correct
  choice on reveal, matching the pattern `sightword-game`/`reading-comprehension` already use.
- **math-array stepper:** plus button now disabled at the ceiling (200), symmetric with minus at 0.
- **Kid-surface route shells (new carve-outs):** `(learner)/learn/error.tsx` + `not-found.tsx` —
  learner errors/404s previously fell through to the generic global shells (`bg-paper`, not
  `.surface-kid`). The new shells keep the kid voice (64px taps, Mascot, `size="kid"` actions).

### #22 `fix/polish3-shell-a11y` (→ `2a68ede`)
- **Skip-to-content links (WCAG 2.4.1 Bypass Blocks):** none existed; every shell has a sticky
  header/nav before `<main>`. Added a reusable `SkipLink` (visually hidden until focus, `z-[60]` above
  the sticky headers) wired into the kid (`AppShellKid`), parent (`DashboardShellParent`), and admin
  (`AdminShell`) shells, with `id`/`tabIndex={-1}` on each `<main>`.
- **Daily-goal validation:** an out-of-range value silently reverted to default with a misleading
  "Saved." Now shows an inline `Field` error (`aria-invalid` + `role=alert` + danger border) and blocks
  the save. A single pure `parseDailyGoal()` helper backs both validation and persistence (+6 tests).

### #20 `fix/polish3-seo-meta` (→ `17f10828`)
- **Structured data:** `EducationalOrganization` + `WebSite` JSON-LD on the public home (CSP-safe —
  `application/ld+json` is non-executable; static content via `dangerouslySetInnerHTML`).
- **Canonical:** `alternates.canonical = "/"` on the home (resolves via the root `metadataBase`).
- **Admin metadata:** static titles ("Program details", "Edit program") complete the metadata pattern
  and disambiguate tabs.

## Review (multi-model — codex earned the cross-model gate three times)

Per-branch ship-review agents ran a fresh opus-tier review + codex adversarial + gemini advisory +
simplifier + impeccable + `typecheck/lint/build/test`, then attested and opened PRs.
`merge-ready.sh check --pr` **PASS** on all three (498 → 504 tests with B's new suite).

- **codex (required) — three real findings opus missed:**
  1. **#21 error-boundary escape loop (Medium → fixed):** the new `learn/error.tsx` hardcoded
     `href="/learn"`, but the `/learn` picker itself can throw (`force-dynamic` + top-level `await`),
     so a picker failure would loop a non-reading child back to the broken page. Fixed by adopting the
     global boundary's `usePathname()` routing (nested `/learn/...` → `/learn`; picker failure → `/`).
  2. **#22 daily-goal parser mismatch (Medium → fixed):** validation used `Number()` (accepts
     `1e1` → 10) but persistence used `parseInt()` (`1e1` → 1) — `"1e1"` validated as valid yet saved
     `1` (silent mis-save). Fixed with one pure `parseDailyGoal()` (digits-only regex) used by both
     paths, + 6 tests.
  3. (#21) proposed announcing reveal correctness to screen readers — **declined** (correctly): it
     conflicts with the §8/DESIGN.md forgiving, no-failure child posture, is out of the WCAG 1.4.1
     (visual cue) scope, and the icon is required to stay `aria-hidden`. Pre-existing in `sightword`.
- **opus/impeccable (fresh ship-reviewers):** caught the new learner shells missing a `<main>`
  landmark (they replace `AppShellKid`'s `<main>`) → promoted to `<main>`; caught the daily-goal input
  not passing `invalid=` to `Field` (neutral border on error, off-spec vs DESIGN.md §5) → fixed.
- **code-simplifier:** no-op on all three (already idiomatic).
- **gemini (advisory):** unavailable all run (ACP init 10s timeout — infra, never blocks; same as pass 2).

## Canary (prod, `353f91f`)

Cron built main's tip and ArgoCD rolled it at 06:47 (Synced → Progressing → Synced/Healthy).
`/api/health` `/` `/learn` `/sign-in` `/sitemap.xml` `/robots.txt` → **200** · `/parent` `/admin` → **307**
(auth redirect) · **home JSON-LD: 1 `application/ld+json` block present** (structured data live). Pod
error scan (5 min, both app pods) surfaced exactly one `UnauthenticatedError: Not authenticated` — the
**documented pre-existing** cold-start/unauth-probe log noise (the canary's own unauthenticated
`/parent`+`/admin` probes trip the auth gate's error-level log; same line noted in pass 2's deferred
list). **Not a regression:** this pass touched no auth/tenancy/middleware code.

## Migrations

**None this pass** — no schema changes.

## Deferred (out of scope — recorded, not built)

- **FK indexes** on `programVersion.programId`, `unit.programVersionId`, `lesson.unitId`,
  `activity.lessonId` — a real perf/cascade-delete nicety, but it needs a Drizzle migration and the
  homelab pipeline does **not** auto-run migrations (manual `kubectl exec … psql`; `__drizzle_migrations`
  reconciliation still pending from pass 1). Adding an unapplied migration during an autonomous prod
  run is an avoidable hazard on a small (pilot) dataset — defer until the migration job lands.
- **Marketing-home skip link** — kept skip-links to the 3 app shells (highest keyboard-task density);
  including the home would have collided `page.tsx` between worktrees B and C. Minor.
- **`opengraph-image.tsx`** (proper 1200×630 OG vs the current 512² icon) — metadata carve-out but
  needs real image/design work; defer.
- **`mathArrayConfig.answer`** is an unbounded `z.number().int()` while the stepper caps at 200 — a
  content-model/schema concern, not a11y; no live content triggers it (max authored expected ≤ 144).
- Marginal a11y nits consciously declined: ProgressRing live-region, sightword decoy debounce, Button
  disabled fill, Pill missing tones.
- Carryover from pass 1/2: pre-sync migration job; `NEXT_PUBLIC_SENTRY_DSN` build-arg; `SOURCE_COMMIT`
  in Dockerfile; admin email verification (P4); account export/delete + provenance UI + per-learner
  settings UI (P6); Redis cluster-wide rate limiting (P1); STRUCTURE.md full refresh (frozen at P0).
