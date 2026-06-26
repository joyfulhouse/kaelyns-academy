# Polish Plan — Broad Pass 4 (2026-06-26)

Source: `/polish` (broad, full autonomous to prod). **Fourth** broad pass, same calendar day as pass 3.
Prior: `5953c12` (pass 1), `058e769`/`ad42c41` (pass 2), `353f91f`→`2f918ee` (pass 3). Pre-pass live: `2f918ee`.

## Method & verdict

Three Explore agents swept Pages/Routes, Components/UI, Backend/Infra. After **first-hand verification of
every finding**, the honest verdict: **the codebase is mature.** Three prior passes (especially pass 3's
accessibility sweep) closed the high-value gaps, so exactly **one** genuine, in-scope, worth-shipping item
remained.

The skill's 10-item floor presumes a real backlog. Manufacturing nine filler changes on a live children's
app — where every merge is an irreversible production deploy — would violate the skill's own deeper
principles (*depth over breadth, stay in scope, don't churn*) and the project's quality rules. So this pass
ships the one real item and documents everything else as dropped or deferred. **Honesty over quota.**

## Shipped (1 item)

| # | Item | Severity | File | WT |
|---|------|----------|------|----|
| 1 | Marketing home has no skip-to-content link (WCAG 2.4.1 Bypass Blocks). The kid/parent/admin shells each got a `SkipLink` in pass 3, but the public home — the highest-traffic page, with a sticky header (logo + 3 nav links + 2 buttons) before `<main>` — was the lone top-level surface without one (deferred in pass 3 *only* to avoid a `page.tsx` worktree collision with the SEO worktree). Add `<SkipLink/>` as the first focusable element + `id={MAIN_CONTENT_ID}` + `tabIndex={-1}` on the existing `<main>`, mirroring the shell pattern exactly. | High (a11y) | `src/app/page.tsx` | A |

## Dropped as false-positive / already-handled (each verified first-hand)

- **Switch "color-only" toggle** — FP. The knob *position* changes (`translate-x-6`/`translate-x-1`) and it is a
  proper `role="switch"` + `aria-checked`; the component's own docstring states *"color is never the only
  signal."* Position is a non-color cue → already WCAG 1.4.1-compliant.
- **`Field` error not announced to screen readers** — FP. The error `<p>` already carries `role="alert"` (an
  implicit assertive live region) and the input gets `aria-invalid` + `aria-describedby`. Adding `aria-live`
  would be redundant/contradictory.
- **journal-prompt word-bank tappable during dictation** — speculative; appending a word while dictating is
  harmless on a forgiving compose surface, and greying the buttons mid-speech would be *more* confusing.
- **NextThingCard `truncate` "has no ellipsis"** — FP. Tailwind's `truncate` includes `text-ellipsis`.
- **6× "missing `loading.tsx`"** (home, parent/learners, parent/settings, parent/curriculum/[slug],
  admin/programs/[id], …/edit) — FP. The group-level `(parent)/parent/loading.tsx` and
  `(admin)/admin/loading.tsx` already cover all nested children via App-Router boundary nesting (skeletons
  verified: `role="status"`, `motion-safe:`, on-brand). The learner group has its own loader plus three
  granular ones. Only the root home `page.tsx` is uncovered — and it is statically prerendered (not
  `force-dynamic`), so a root `loading.tsx` would rarely render and would carry broad blast radius
  (it would also wrap `(auth)` and `~offline`). Dropped.
- **auth / offline page metadata** — already present (`Sign in`, `Create account`, `Offline`).
- **home custom `description`** — correct as-is via the root `SITE_DESCRIPTION` fallback.
- **All 8 activity Players re-swept** — the color-only-cue theme was fully closed in pass 3; every Player
  now has an icon / position / aria cue, not color alone.

## Deferred (out of scope / consciously not built)

- **FK covering indexes** on `publisher.owner_user_id` and `program.publisher_id` (the lesson/unit/activity
  FKs are *already* covered by unique indexes). A real best-practice gap at scale, but: the homelab pipeline
  does **not** auto-run migrations, the benefit is nil at pilot scale (1 publisher, ~3 programs), and running
  DDL on the prod DB autonomously during a polish deploy is an avoidable hazard. Defer (consistent with
  passes 1 & 3) until a migration job lands and a human can apply it.
- **Auth-gate `⨯ UnauthenticatedError` log noise** — root-caused and *deliberately not "fixed."* The
  parent/admin layouts already `redirect("/sign-in")` cleanly (no throw), and every `captureNonCritical`
  call site already guards `UnauthenticatedError` *before* capturing. The residual pod-log line is Next.js
  framework-level logging of benign edge-case throws (e.g. `requireAdmin`'s stale-session path). There is no
  clean single-site fix without restructuring the auth flow or suppressing framework logs — not worth it on a
  live kids' app. The tempting "add a `level` param to `captureNonCritical`" change would be **theater** (the
  noise isn't emitted by `captureNonCritical` at all). Defer.
- **`opengraph-image.tsx`** (proper 1200×630 OG vs the current 512² icon) — needs real image/design work.
  Carryover defer.
- Carryover from passes 1–3: pre-sync migration job; `NEXT_PUBLIC_SENTRY_DSN` build-arg; `SOURCE_COMMIT` in
  Dockerfile; admin email verification (P4); account export/delete + provenance UI + per-learner settings UI
  (P6); Redis cluster-wide rate limiting (P1); STRUCTURE.md full refresh (frozen at P0).

## Merge

Single worktree A → PR #24 → merge → cron build → ArgoCD roll → mandatory `/api/health` canary.
