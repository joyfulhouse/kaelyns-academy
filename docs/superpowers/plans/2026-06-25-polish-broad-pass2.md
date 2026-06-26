# Polish Plan — Broad Pass 2 (2026-06-25)

Second broad `/polish` pass, run the same day as pass 1 (`5953c12`, live + canaried). Pass 1
shipped root error/global-error/not-found, learner loading shells, sitemap/robots/OG, enforcing
CSP + security headers, DB indexes, TTS source guard, `Pill` stretch token. This pass targets the
**remaining** gaps the three explore agents surfaced (and that I verified first-hand), after
dropping explorer false-positives (home-page metadata already correct via `default`; `health.ts`
`REQUIRED_COLUMNS` already complete & prod-verified; rate-limit Map already pruned on every new
key; Switch disabled-state already inherited via parent `opacity-50`; kid 44px secondary links are
WCAG-compliant).

All items refine surfaces that already exist. No new routes, HTTP methods, pages, path segments, or
Server Actions. New files are limited to allowed carve-outs (loading/error/not-found shells for
routes that already have a `page.tsx`).

Merge order: **A → B → C** (A is lowest-risk new files; C carries the one sensitive token change,
so it merges last and rebases on the others). Each merge auto-deploys; canary between each.

---

## Worktree A — Resilience & SEO  (branch `fix/polish2-resilience-seo`)

Route-shell carve-outs + dynamic metadata for the parent/admin groups. All files are either new
shells for existing routes or small edits to existing pages.

**Files:**
- `src/app/(parent)/parent/error.tsx` *(new carve-out)* — client error boundary. Parent-appropriate
  copy ("Something went wrong loading your dashboard."), a `reset()` button, and `captureNonCritical`.
  Keep it inside the `(parent)` layout so the parent chrome stays. Match the visual language of root
  `error.tsx`.
- `src/app/(parent)/parent/not-found.tsx` *(new carve-out)* — parent-scoped 404 ("We couldn't find
  that. It may have been removed from your account.") with a link back to `/parent/learners`. NOT the
  root "Go to the studio" copy.
- `src/app/(parent)/parent/loading.tsx` *(new carve-out)* — calm pulse skeleton fallback for the
  parent routes that lack their own (`/parent`, `/parent/learners`, `/parent/settings`,
  `/parent/curriculum/[slug]`). The existing `curriculum/loading.tsx` and `learners/[id]/loading.tsx`
  override it for those segments.
- `src/app/(admin)/admin/error.tsx` *(new carve-out)* — admin-scoped error boundary + `reset()` +
  `captureNonCritical`.
- `src/app/(admin)/admin/not-found.tsx` *(new carve-out)* — admin-scoped 404 with a link to `/admin`.
- `src/app/(admin)/admin/loading.tsx` *(new carve-out)* — admin loading skeleton fallback.
- `src/app/(parent)/parent/learners/[id]/page.tsx` — replace `export const metadata = { title: "Learner" }`
  with `export async function generateMetadata({ params })` that resolves the learner via
  `getLearnerDetail(id)` and returns `{ title: detail?.learner.displayName ?? "Learner" }`. (Route is
  auth-gated + robots-disallowed, so the child's display name in the tab title is fine.)
- `src/app/(parent)/parent/curriculum/[slug]/page.tsx` — add `generateMetadata` that resolves the
  program title (mirror the existing detail-fetch the page already does) → `{ title: ... ?? "Program" }`,
  replacing the static `metadata`.
- `src/app/(admin)/admin/programs/[id]/page.tsx` — delete the stale "placeholder editor entry point
  (… lands in Task 5.3)" comment; the editor is shipped.
- `docs/architecture/STRUCTURE.md` — IF it documents the route tree, add the new shells; else attest
  docs `deferred` (a full STRUCTURE.md refresh is a separate follow-up).

**Expected commits:** `feat(resilience): parent/admin error + not-found + loading shells`,
`feat(seo): dynamic titles for learner & program detail`, `chore: drop stale admin editor comment`.

---

## Worktree B — Backend hardening  (branch `fix/polish2-backend-hardening`)

API-route + lib hardening. Hardens existing surfaces only.

**Files:**
- `src/app/api/practice/route.ts` —
  (a) Wrap the **account/§8 path reads** (`getLearner`, `resolveLearnerProgram`, and the
  `Promise.all([getLearnerSettings, getEnrollmentForGate])`) in try/catch. On ANY read error →
  `captureNonCritical(...)` + return `NextResponse.json({ error: "ai_disabled" }, { status: 403 })`
  (explicit fail-closed; today a DB blip throws a raw 500). The explore path and the existing
  `generate()` try/catch are unchanged.
  (b) Add a content-length guard before `request.json()`: if `content-length` > ~16 KB → 413.
- `src/app/api/tts/route.ts` —
  (a) Replace the two `new Response(null, { status: 400 })` (invalid JSON, non-object body) with
  `NextResponse.json({ error: "invalid_json" }, { status: 400 })` to match the api/practice envelope.
  (b) Content-length guard → 413.
  (c) Light voice validation: cap length (≤40) and restrict to `[A-Za-z0-9_]` before use (defense in
  depth; don't enumerate voices — just reject control chars/injection; fall back to `enVoice()` if
  invalid).
- `src/app/audio/[...path]/route.ts` — rewrite `isPrivateHttpHost` to parse IPv4 literals into
  octets and range-check (10/8, 172.16-31/12, 192.168/16, 127/8) instead of the prefix regexes; keep
  the hostname-suffix checks (localhost, `.local`, `.internal`, `.svc`, `.cluster.local`, `.test`).
- `src/app/api/health/route.ts` — in the catch, stop returning raw `err.message` to the public
  endpoint; `captureNonCritical` the detail and return a generic `{ status: "down", reason:
  "internal_error" }` (keep 503; keep the `missing` array for the schema-drift branch — column names
  are ops-useful, not sensitive).
- `src/lib/tutor/store.ts` — add `.for("update")` to the `enrollment` select inside `recordAttempt`
  (lock the enrollment row so a concurrent pause/remove can't slip an attempt through; mirrors the
  existing skill_state `.for("update")`).
- `src/lib/audio/phonemize.ts` — replace `(data as { phonemes?: unknown }).phonemes` with a tiny
  `z.object({ phonemes: z.string() }).safeParse(data)` (same fail-soft `null` on miss; idiomatic).

**Expected commits:** `fix(api): §8 practice gate fails closed on read errors`,
`fix(api): consistent error envelopes + request-size + input guards`,
`fix(security): real IPv4 parsing in audio SSRF guard; don't leak health errors`,
`fix(db): lock enrollment row in recordAttempt`.

---

## Worktree C — UI / a11y / brand  (branch `fix/polish2-ui-a11y`)

Accessibility + brand-consistency + form-UX refinements to existing components.

**Files:**
- `src/components/ui/TextInput.tsx` — remove `focus-visible:outline-none` (it overrides the global
  3px `:focus-visible` outline in globals.css:163, leaving only a 1px border on keyboard focus —
  a real WCAG 2.4.7 regression). Keep `focus:border-accent` for the aesthetic; let the global outline
  show for keyboard users. Verify the `invalid` border path still reads.
- `src/app/globals.css` (+ `DESIGN.md`) — **sensitive:** gently darken `--color-ink-faint` from
  `oklch(0.6 0.016 65)` to ≈ `oklch(0.52 0.017 64)` so small (xs/sm) faint text clears ~4.5:1 on
  paper while staying clearly the lightest ink tone (ink 0.26 / ink-soft 0.44 / ink-faint 0.52).
  Update the matching value/line in DESIGN.md. **Flagged for mandatory impeccable + opus review in
  ship; if it muddies the palette, revert to the original token and defer.**
- `src/app/page.tsx` — convert the two ternary template-literal classNames (lines ~123, ~130) to
  `cn(...)` (import from `@/lib/cn`) for consistency with the rest of the codebase. (Behavior
  identical — both classes are literal so JIT already sees them; this is consistency only.)
- `src/components/parent/EnrollmentConfigForm.tsx` — auto-dismiss the "Saved" success state after
  ~3 s via a `useEffect` cleanup timer (read the file first; keep the error state sticky).
- `src/app/(parent)/parent/settings/SettingsForm.tsx` — disable the Save button while `isPending`
  and show "Saving…" (prevents double-submit). Read the file first (pass-1 already edited it).
- `src/activities/sightword-game/Player.tsx` — give the found/disabled word card a clearer non-color
  cue (e.g. reduced opacity + `cursor-not-allowed`) so a young child sees it's locked.

**Expected commits:** `fix(a11y): restore keyboard focus ring on TextInput`,
`fix(a11y): bump ink-faint contrast to AA for small text`,
`refactor(ui): use cn() for conditional classNames`,
`fix(ux): settings/enrollment form feedback + sightword disabled state`.

---

## Deferred (out of scope — new surface or needs separate effort)

- Program-editor completion, per-learner settings UI, learner avatar customization, skill-detail
  deep-dives, parent activity replay (new product surface — feature runs, not polish).
- Curriculum-marketplace DB read switch-over (P1) and its migration/seed validation.
- Admin email verification + forgot-password (P4; needs email transport).
- Account export/delete implementation (P6; pass 1 only hid dead buttons).
- Cluster-wide (Redis) rate limiting (P1 infra).
- Pre-sync migration job + `drizzle.__drizzle_migrations` reconciliation; `NEXT_PUBLIC_SENTRY_DSN`
  build-arg; `SOURCE_COMMIT` in Dockerfile; full `STRUCTURE.md` refresh (infra follow-ups).
- Phonics-repair fast-fail circuit-breaker tightening (perf nicety; current behavior is §8-safe).
