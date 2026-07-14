# Shared-Device Handoff + PIN Gate — Implementation Plan

Spec: `docs/superpowers/specs/2026-07-14-device-handoff-pin-gate-design.md` (locked decisions there).
Branch: `feat/handoff-pin-gate`.

## Study first (read before writing code)
- `src/app/(parent)/layout.tsx` — the session gate to extend (force-dynamic, lazy getAuth()).
- `src/app/(parent)/actions.ts` — action idiom: zod parse → withAccount → discriminated result via `mapActionError`; `revalidatePath`.
- `src/lib/rate-limit.ts` (`checkRateLimit`) + `src/lib/request-ip.ts` — reuse, do not reinvent.
- `src/lib/auth.ts` — Better Auth instance; password verify for PIN recovery (use `auth.api.signInEmail` against the session user's email, or better-auth's credential-check API if exposed — verify which and note it).
- `src/lib/db/schema.ts` + `drizzle/` — table idiom, `$defaultFn(uuid)`, additive migrations; `src/lib/db/health.ts` REQUIRED_COLUMNS.
- `src/components/parent/AddChildForm.tsx` (success state), `src/app/(parent)/parent/page.tsx` `ProfileCard`, `/parent/learners` cards, `src/app/(parent)/parent/settings/SettingsForm.tsx`.
- `src/components/learner/useLearnerState.ts` (`ka:account-learner` read) and `StudioHome.tsx` picker skip logic — the handoff must set EXACTLY what the picker would set.
- `e2e/helpers.ts` (`signIn`, `selectAccountLearner`) and an existing parent spec for the project structure.

## Tasks (in order)

### T1 — Schema + core
1. `parent_pin` table in `src/lib/db/schema.ts`: `accountId` text PK → `user.id` cascade, `pinHash` text notNull, `updatedAt` timestamptz. `bun run db:generate` → migration 0013 (additive only).
2. Add the new columns to `REQUIRED_COLUMNS` in `src/lib/db/health.ts` (+ test).
3. `src/lib/parent-pin.ts`: `hashPin`/`verifyPin` (crypto.scrypt, per-record random salt, timingSafeEqual), `mintUnlockToken`/`verifyUnlockToken` (HMAC-SHA256 over `accountId:expiresAtMs`, clockless — `now` injected), constants `UNLOCK_TTL_MS = 15*60_000`, `PIN_REGEX = /^\d{4,6}$/`. Pure; unit tests alongside.
4. Store fns in `src/lib/tutor/store.ts` or a new `src/lib/parent-pin-store.ts` (lazy getDb()): `getParentPinHash(accountId)`, `setParentPin(accountId, hash)` (upsert), `clearParentPin(accountId)`.

### T2 — Gate + actions
1. `(parent)/pin-actions.ts` (server actions, `"use server"`, NO type re-exports — see the use-server pitfall note in CLAUDE.md history):
   - `verifyParentPinAction(pin)`: zod parse → withAccount → `checkRateLimit("parent-pin:"+accountId+ip, {5 attempts, 60s})` → verifyPin → on success `cookies().set("ka-parent-unlock", token, { httpOnly: true, secure: true, sameSite: "lax", path: "/parent", maxAge: 900 })`.
   - `setParentPinAction(pin, confirmPin)`: allowed when no PIN exists OR request currently unlocked; hash + upsert; refresh cookie.
   - `clearParentPinByPasswordAction(password)`: verify account password via Better Auth; clear row + cookie.
2. `layout.tsx`: after session resolve — `getParentPinHash`; if set and `verifyUnlockToken(cookie)` fails → render `<PinChallenge/>` (inside `DashboardShellParent` minimal chrome, no data). Children only when unlocked.
3. `src/components/parent/PinChallenge.tsx` (client): numeric input (inputMode numeric, autoFocus), calm error + cooldown message from the action result, "Forgot PIN?" flow (password field → clear action → toast "PIN removed — set a new one in Settings").

### T3 — Handoff UX
1. `src/components/parent/HandoffButton.tsx` (client): props `learnerId`, `learnerName`, `programSlug` (default `kaelyn-adaptive`); onClick → `localStorage.setItem("ka:account-learner", learnerId)` → `router.push('/learn/'+programSlug+'?handoff='+learnerName-safe-flag)`. Placement: ProfileCard (dashboard), learner cards on /parent/learners, AddChildForm success state (+ one explainer sentence).
2. Handoff beat: in the learner surface, a `handoff` search param renders a one-tap fullscreen interstitial ("Passing to <name> — tap GO!", big single button, Wonder-Studio styled, static classes, reduced-motion safe) that dismisses to the map. If the account has NO pin set, show the skippable "Lock the grown-up area first?" line linking `/parent/settings#pin`. IMPORTANT §8: the interstitial uses the learner display name only (already on-screen data), never in `document.title`.
3. Settings: "Grown-up lock" section in SettingsForm (set/change/remove; helper copy re 15-min grace).

### T4 — Tests + gates
- Unit: parent-pin.ts round-trips, token expiry/tamper, rate-limit path (inject clock), store tenancy (wrong accountId no-op).
- Component tests for PinChallenge states; SettingsForm section.
- e2e `e2e/specs/parent-pin.spec.ts` (parent project): set PIN via settings → open /parent in new context → challenge appears → wrong PIN error → correct PIN unlocks; handoff spec: click "Hand the device to" → lands on /learn/kaelyn-adaptive map with the learner active (no picker). MUST leave the existing suite green (e2e accounts never set a PIN). Clean up: remove the PIN at spec end (password flow) so reruns are stable.
- `bun run lint && bun run typecheck && bun run test && bun run build` all green; knip stays clean (no unused exports — export only what's imported).

## Constraints (non-negotiable)
- Lazy getDb()/getAuth() only; no top-level connections (build safety).
- No eslint-disable/@ts-ignore; static Tailwind maps; Phosphor icons only.
- §8: no child credentials/PII added; PIN + hash never logged (scrub from Sentry capture paths); kid surface untouched except the handoff interstitial.
- Migration additive-only; never `:latest`; no plaintext secrets (HMAC uses existing BETTER_AUTH_SECRET).
- The existing e2e pre-deploy gate must pass: do not alter guest flows, reward-CTA-is-link, karaoke behavior.
