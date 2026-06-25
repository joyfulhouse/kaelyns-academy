# Polish Report — Broad Pass (2026-06-25)

Source: `/polish` (broad, no focus). Plan: `docs/superpowers/plans/2026-06-24-polish-broad.md`.
**Deployed:** `registry.joyful.house/homelab/kaelyns-academy:d05ff0b@sha256:5ff8c2f5e8f2f015e66af98b9ffc8eba8d28fb4c103de2c3ab86b07ffce46244` — ArgoCD Synced/Healthy, 2/2 pods.

## What shipped (4 PRs, all merged to main)

- **#12 `feat/polish-resilience-seo`** — root `error.tsx`/`global-error.tsx`/`not-found.tsx`; `loading.tsx` skeletons for the force-dynamic learner/parent routes; `sitemap.ts` + `robots.ts`; OpenGraph/Twitter metadata in root layout; admin page `metadata`.
- **#15 `fix/polish-ui-brand`** — `Pill.tsx` `stretch` tone → `--color-stretch` token (contrast verified 13.3–13.8:1); removed dead P6 export/delete buttons in settings; **TTS guarded at source** (`useSpeech.speak`) so the speaker button can't throw; admin-editor save-error test coverage.
- **#13 `fix/polish-data-integrity-perf`** — 3 indexes (`learner(accountId)`, `skillState(learnerId)`, `attempt(learnerId,generated)`); write-time Zod validation in `tutor/store`; `captureNonCritical` stderr fallback + original-context logging.
- **#14 `fix/polish-security-hardening`** — security headers + **enforcing CSP**; `AUDIO_ORIGIN` scheme validation; `requireAdmin` stale-session check; `/api/tts` JSON 400 body.

## Review (multi-model, all findings fixed before merge)

- **opus** (4 exhaustive reviews; `rev-B` verified the CSP against *two real prod builds* + live headers + 4 doc/source cross-checks).
- **codex** — found real bugs opus missed and **earned the cross-model gate**:
  - **#14 HIGH:** `media-src 'self'` would have **silenced kid TTS audio** under the enforcing CSP (narration plays a `blob:` URL via `new Audio`). Fixed → `media-src 'self' blob:` (live, header-confirmed).
  - **#12:** error-boundary "Go home" pointed back at the failed `/learn`; global-error used non-alerting capture. Fixed.
  - **#13:** migration `IF NOT EXISTS`; capture logs original context.
  - **#15:** the `safeSpeak` guard missed the shared `SpeakerButton` tap → guarded at source instead.
- **code-simplifier** — collapsed the now-redundant per-call `safeSpeak` into the single source guard (#15).
- **gemini** — advisory, unavailable all run (ACP init timeout — infra, not blocking). **codex** was briefly rate-limited mid-run; resolved by re-authing the CLI to a new subscription, then completed all four.

Merge-ready gate (`scripts/merge-ready.sh`) PASS on all 4 (note: advisory only — no enforcing hook in this repo).

## Canary (prod)

`/api/health` 200 · `/` `/learn` `/sitemap.xml` `/robots.txt` 200 · live CSP enforcing with `media-src 'self' blob:` · `robots.txt` Disallow `/learn/` · app JS chunks + `/serwist/sw.js` load 200 under CSP · no server errors in pod logs post-roll.

**⚠️ Pending user spot-check:** the in-browser **CSP-violation console check** and **TTS audio playback** test could not run — the Claude Chrome extension was not connected this session. Recommend opening `kaelyns.academy/learn` with DevTools open: confirm zero `Refused to … Content Security Policy` errors on hydration / SW registration / sign-in, and that a read-aloud actually plays audio. (All non-browser CSP evidence is green; this is the one remaining confirmation.)

## Migrations — applied manually (pipeline gap)

The deploy pipeline does **not** auto-run migrations (the pre-sync job is an unlanded P0 item — DEPLOY.md treats migrations as manual until then), and `drizzle.__drizzle_migrations` is **empty** (the live schema was applied via `drizzle-kit push`, not tracked `migrate`). PR #13's 3 indexes were therefore pending; applied directly to the prod CNPG DB as idempotent `CREATE INDEX IF NOT EXISTS` (expand-only, sub-ms lock at one-learner volume) and verified present.

## Deferred (out of scope — recorded, not built)

- Admin **email verification** + forgot-password (P4; needs email transport) — tracked in `KNOWN-RISKS-P0-PILOT.md`.
- Account-level **data export / deletion** implementation (P6) — polish only hid the dead buttons.
- Per-learner settings UI (P6); cluster-wide (Redis) rate limiting; CSP `CONCURRENTLY` index path (needs a non-transactional migration runner).

## Follow-up infra items (found during this run)

1. **Wire the pre-sync migration job** so deploys apply Drizzle migrations automatically (and reconcile `drizzle.__drizzle_migrations`, currently empty → a future `drizzle-kit migrate` would try 0000+ and conflict).
2. **Browser Sentry is dark in prod** — `next.config.ts` derives the CSP `connect-src` Sentry host from `NEXT_PUBLIC_SENTRY_DSN`, but the homelab Dockerfile doesn't pass it as a build-arg, so the browser SDK is un-inlined and `connect-src` stays `'self'`. Add the DSN build-arg to enable client telemetry (CSP auto-widens to match).
3. **Dockerfile omits `SOURCE_COMMIT`** that DEPLOY.md says CI must pass.
4. **`STRUCTURE.md` is broadly stale** (predates the route-group tree, `src/components/`, `src/activities/`) — needs a dedicated refresh, not a piecemeal one.
5. Audio SSRF private-host matcher is a loose string match (operator-set env, not attacker-reachable) — could tighten with real IP parsing.
