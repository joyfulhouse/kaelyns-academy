# Polish Plan — Broad Pass 3 (2026-06-26)

Source: `/polish` (broad, full autonomous to prod). Third broad pass; prior passes
`5953c12` (pass 1) and `058e769`/`ad42c41` (pass 2, 2026-06-25). Live: `6637106` (docs-identical to `ad42c41`).

## Method & findings

Three Explore agents swept Pages/Routes, Components/UI, and Backend/Infra. **Backend posture is
excellent** (fail-closed §8 gates, build-safe lazy factories, no real defects). **Design system is
healthy** (no Lucide, no dynamic Tailwind class strings, semantic tokens, global `:focus-visible`
ring, every animation `motion-safe:`-gated, no raw `<img>`/`<Image>`). After first-hand verification,
~10 explorer findings were **dropped as false positives or non-issues**:

- Sun decorative spin "ungated" → it IS `motion-safe:animate-[spin…]` (StudioHome:367, page.tsx:63). Gated.
- "Level X of Y" low contrast → uses `text-ink-soft` (oklch 0.44, the *mid* tone) on light paper — clears AA.
- Pre-ready progress flash → guarded by `ResolvingSurface` loading beat; intentional hydration-safety.
- math-array minus-at-0 → already `disabled={value === 0}`.
- reading-comprehension "infinite retry" / color-only → forgiving by design; already shows a check on chosen.
- sightword decoy double-nudge → real but trivial; forgiving by design (declined).
- Button disabled "opacity-only" → opacity-50 + `pointer-events-none` is a valid cue (FILL retained).
- ProgressRing aria-live, TextInput icon guard, Pill missing tones → speculative / no caller (declined).
- "16 missing route shells" → over-counted; parent (`parent/not-found.tsx`) + admin (`admin/not-found.tsx`)
  shells from pass 2 already cover their dynamic routes via Next.js boundary bubbling. Only the `(learner)`
  group genuinely lacks a kid-surface error/not-found.

The genuine, in-scope improvements below are mostly **accessibility** (the highest-value theme this
pass), plus kid-surface route-shell completeness, one parent-form validation gap, and SEO/metadata.

## Items

| # | Item | Severity | Files | WT |
|---|------|----------|-------|----|
| 1 | Choice-reveal correct answer is distinguished by green bg **alone** (WCAG 1.4.1) — add a `CheckCircleIcon` badge on the correct choice on reveal, matching the pattern `sightword`/`reading-comprehension` already use | High (a11y) | `src/activities/lang-listen-match/Player.tsx` | A |
| 2 | Same color-only reveal in the symbol-intro quiz | High (a11y) | `src/activities/lang-symbol-intro/Player.tsx` | A |
| 3 | Answer stepper: plus button not disabled at max (200) though minus is disabled at 0 — symmetric bound | Low | `src/activities/math-array/Player.tsx` | A |
| 4 | Learner errors bubble to the generic global `error.tsx` (`bg-paper`, not `.surface-kid`) — add a kid-surface error boundary (bigger taps, Mascot, `captureNonCritical`+`reset()`) | Medium (kid UX) | `src/app/(learner)/learn/error.tsx` *(new carve-out)* | A |
| 5 | A bad program slug (`notFound()` at `learn/[programSlug]/page.tsx:22`) renders the generic global 404 — add a kid-surface not-found | Medium (kid UX) | `src/app/(learner)/learn/not-found.tsx` *(new carve-out)* | A |
| 6 | No skip-to-content link anywhere (WCAG 2.4.1 Bypass Blocks); every shell has sticky header/nav before `<main>` — add a reusable `SkipLink` + `id`/`tabIndex` on the kid shell's `<main>` | High (a11y) | `src/components/a11y/SkipLink.tsx` *(new component)*, `src/components/learner/AppShellKid.tsx` | B |
| 7 | Skip link on the parent dashboard shell (keyboard-dense) | High (a11y) | `src/components/parent/DashboardShellParent.tsx` | B |
| 8 | Skip link on the admin studio shell (sidebar + mobile nav) | High (a11y) | `src/components/admin/AdminShell.tsx` | B |
| 9 | Daily-goal out-of-range value silently reverts to default with a misleading "Saved." — add inline validation via `Field`'s `error` slot (`aria-invalid`+`role=alert`) and block Save while invalid | Medium (UX/a11y) | `src/components/parent/EnrollmentConfigForm.tsx` | B |
| 10 | Public marketing home has no structured data — add `EducationalOrganization` + `WebSite` JSON-LD | Medium (SEO) | `src/app/page.tsx` | C |
| 11 | Home has no explicit canonical — add `alternates.canonical` | Low (SEO) | `src/app/page.tsx` | C |
| 12 | Admin program-detail page has no `metadata` (falls back to bare site title) — add static title | Low (completeness) | `src/app/(admin)/admin/programs/[id]/page.tsx` | C |
| 13 | Admin program-edit page has no `metadata` | Low (completeness) | `src/app/(admin)/admin/programs/[id]/edit/page.tsx` | C |

**13 concrete improvements.** No two worktrees touch the same file (A=activities + learner route
shells; B=shared a11y shells + parent form; C=`page.tsx` + admin pages). No cross-worktree imports
(`SkipLink` is created and consumed entirely within B; C does not use it).

## Worktree A — `fix/polish3-activity-a11y`

Kid activity a11y + learner route shells.

- **lang-listen-match/Player.tsx** (item 1): in the choice map, when `reveal && isAnswer`, render a
  `CheckCircleIcon` (Phosphor, `weight="fill"`, `text-success`, `aria-hidden`) positioned in the
  corner of the choice button (e.g. `absolute right-2 top-2`) — exactly like `sightword-game`'s found
  card. Keep the existing `bg-success/30`. The button is already `relative`-able (add `relative` to its
  class). Do **not** change the reveal timing/scoring.
- **lang-symbol-intro/Player.tsx** (item 2): identical change (same `reveal && isAnswer` branch).
- **math-array/Player.tsx** (item 3): in `AnswerStepper`, change the plus `StepButton` to
  `disabled={disabled || value === 200}` (mirror the minus's `value === 0`). One line.
- **(learner)/learn/error.tsx** (item 4, NEW): `"use client"` segment error boundary, signature
  `{ error: Error & { digest?: string }; reset: () => void }`. `useEffect(() =>
  captureNonCritical("Learner route error", error), [error])`. Render a `.surface-kid` wrapper
  (`<div className="surface-kid …">`) with `<main>` containing `Mascot` (mood "think"),
  warm copy, and big `Button size="kid"` actions: "Try again" (`onClick={reset}`) and a link to
  `/learn`. Model copy/structure on the global `src/app/error.tsx` but with kid scaling + `size="kid"`
  buttons. Show `error.digest` as a small reference line. Import `Mascot` from `@/components/art/Mascot`,
  `Button` from `@/components/ui/Button`, `captureNonCritical` from `@/lib/capture`, Phosphor icons.
- **(learner)/learn/not-found.tsx** (item 5, NEW): server component, `export const metadata = { title:
  "Page not found" }`. `.surface-kid` wrapper, `Mascot` (mood "wave"), calm "this page wandered off"
  copy, `Button size="kid"` to `/learn` ("Go to the studio") and `/` ("Take me home"). Model on global
  `src/app/not-found.tsx` with kid scaling.

## Worktree B — `fix/polish3-shell-a11y`

Shared a11y (Bypass Blocks) + parent-form validation.

- **components/a11y/SkipLink.tsx** (NEW component): export `const MAIN_CONTENT_ID = "main-content"` and a
  `SkipLink` component rendering `<a href={`#${MAIN_CONTENT_ID}`} className="…">Skip to main content</a>`.
  Visually hidden until focused: use the standard pattern — `sr-only` plus `focus:not-sr-only
  focus:absolute focus:left-4 focus:top-3 focus:z-[60]` and on-paper styling (`focus:rounded-md
  focus:border focus:border-line focus:bg-paper-raised focus:px-4 focus:py-2 focus:text-ink
  focus:shadow-md`). It MUST be the first focusable element in the shell.
- **learner/AppShellKid.tsx** (item 6): import `SkipLink, MAIN_CONTENT_ID`; render `<SkipLink/>` as the
  very first child of the outer wrapper (before `<header>`); add `id={MAIN_CONTENT_ID}` and
  `tabIndex={-1}` to the existing `<main>`.
- **parent/DashboardShellParent.tsx** (item 7): same — `<SkipLink/>` first, `id`+`tabIndex={-1}` on its
  `<main>`. (Read the file first to find its `<main>`.)
- **admin/AdminShell.tsx** (item 8): same — `<SkipLink/>` as the first child of the outer
  `<div className="surface-parent …">`, `id={MAIN_CONTENT_ID}`+`tabIndex={-1}` on the `<main>` at the
  bottom of the desktop layout.
- **parent/EnrollmentConfigForm.tsx** (item 9): compute `goalError` — when `dailyGoal` is non-empty and
  not an integer in `[0,50]`, set a message like `"Enter a whole number from 0 to 50."`. Pass `error={goalError}`
  to the daily-goal `<Field>` (it already wires `aria-invalid`+`role=alert`+`aria-describedby`). In
  `handleSave`, return early if `goalError` is set; also add `|| Boolean(goalError)` to the Save button's
  `disabled`. Empty input keeps current behavior (treated as default). Do not alter the AI-practice or
  band logic.

## Worktree C — `fix/polish3-seo-meta`

SEO + admin metadata completeness. Owns `page.tsx` exclusively.

- **app/page.tsx** (items 10–11): add `export const metadata: Metadata = { alternates: { canonical: "/" } }`
  (import `type { Metadata }`; metadataBase is already set in the root layout). Inside the returned JSX
  (top of the fragment, before `<SiteHeader/>` is fine), render a JSON-LD script:
  `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(LD) }} />`
  where `LD` is a static `@graph` with an `EducationalOrganization` (name "Kaelyn's Academy", url
  `https://kaelyns.academy`, the site description, logo `/icons/icon-512.png`) and a `WebSite` (name +
  url). Content is fully static — no user input. `type="application/ld+json"` is data, not executable
  JS, so it is unaffected by the script-src CSP.
- **(admin)/admin/programs/[id]/page.tsx** (item 12): add `export const metadata: Metadata = { title:
  "Program details" }` (import `type { Metadata }`). It renders via the `%s · Kaelyn's Academy` template.
- **(admin)/admin/programs/[id]/edit/page.tsx** (item 13): add `export const metadata: Metadata = {
  title: "Edit program" }`.

## Deferred (out of scope / consciously declined)

- **Marketing-home skip link** — kept to the 3 app shells (highest keyboard-task density); the home's
  short header is low-value and including it would collide `page.tsx` between worktrees B and C. Minor.
- **FK indexes** on `programVersion.programId`, `unit.programVersionId`, `lesson.unitId`,
  `activity.lessonId` — a real perf/cascade-delete nicety, but it needs a Drizzle migration, and the
  homelab pipeline does **not** auto-run migrations (manual `kubectl exec … psql`; reconciliation of
  `__drizzle_migrations` still pending from pass 1). Adding an unapplied migration during an autonomous
  prod run is an avoidable hazard on a small (pilot) dataset. Defer until the migration job lands.
- **`opengraph-image.tsx`** (proper 1200×630 OG vs the current 512² icon) — a metadata carve-out but
  needs real image/design work; defer.
- Marginal a11y nits explicitly declined above (ProgressRing live-region, decoy debounce, Button
  disabled fill, Pill tones, double-`<h1>` check on admin edit page — both are conditional branches).
- Carryover from pass 1/2: pre-sync migration job; `NEXT_PUBLIC_SENTRY_DSN` build-arg; `SOURCE_COMMIT`
  in Dockerfile; admin email verification (P4); account export/delete + provenance UI + per-learner
  settings UI (P6); Redis cluster-wide rate limiting (P1); STRUCTURE.md full refresh (frozen at P0).

## Merge order

A → B → C (smallest-blast-radius first; all disjoint so no rebases expected). Build-gate after each;
mandatory `/api/health` canary after the final roll.
