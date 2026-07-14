# Shared-Device Handoff + Grown-Up PIN Gate — Design

Date: 2026-07-14. Approved by user (full scope, always-on PIN model).
Origin: pilot-account setup surfaced that nothing explains how a child starts
learning (no child login by design, §8), and `/parent` is unprotected on a
shared device.

## Problem

1. **Discoverability**: a parent who signs in and adds a child lands on
   `/parent` with no pointer to the kid surface (`/learn`), no explanation that
   the child rides the parent's session, and no one-tap way to hand the device
   over with the right learner selected.
2. **Protection**: on a shared device the child shares the parent's session, so
   nothing stops her tapping into `/parent` (reports, settings, data export,
   profile delete).

## Decisions (locked)

| Decision | Choice |
|---|---|
| Scope | Handoff UX **and** PIN gate in one slice. |
| PIN model | **Always-on once set**: any entry to `/parent` challenges, with a ~15-minute grace window after success. Opt-in — accounts without a PIN see no challenge. |
| Enforcement | **Server-side.** Gate in the `(parent)/layout.tsx` (which already resolves the session and bounces unauthenticated visitors). PIN never verified client-side. |
| PIN storage | New **`parent_pin` table** (`account_id` PK → `user.id` cascade, `pin_hash`, `updated_at`) via additive migration 0013. Keeps Better Auth's `user` table untouched. Hash with Node `crypto.scrypt` (per-record salt); never logged, never returned. |
| Unlock token | HttpOnly, `Secure`, `SameSite=Lax` cookie `ka-parent-unlock`, value = HMAC-SHA256(`BETTER_AUTH_SECRET`) over `accountId.expiresAt`, expiry 15 min. No new secret, no DB session row. Kid cannot bypass via localStorage/source. |
| Brute force | Server rate limit via existing `checkRateLimit` (`src/lib/rate-limit.ts`): 5 attempts per account+IP, then 60 s cooldown. Constant-time compare. |
| Recovery | "Forgot PIN" → re-enter the **account password** (Better Auth credential verify) → PIN cleared; parent sets a new one in settings. |
| PIN format | 4–6 digits, numeric only (kid-proof ≠ crypto secret; the account password remains the real credential). |
| Sign-out | Ungated (not a data risk; blocking it is hostile UX). |
| Admin area | Out of scope (role-gated already). |
| Kid surface | Never gated; §8 unchanged (no child PII, no child credentials). |

## Components

### A. PIN core — `src/lib/parent-pin.ts` (pure) + `parent_pin` table
- `hashPin(pin)` / `verifyPin(pin, hash)` — scrypt, per-record salt, constant-time.
- `mintUnlockToken(accountId, now, secret)` / `verifyUnlockToken(token, accountId, now, secret)` — pure HMAC helpers, clockless (caller passes `now`), unit-testable.
- Store fns (lazy `getDb()`): `getPinHash`, `setPin`, `clearPin` — account-scoped.

### B. Gate — `(parent)/layout.tsx`
After the existing session check: load `pin_hash` for the account; if set and
the `ka-parent-unlock` cookie fails verification → render `<PinChallenge/>`
instead of `{children}` (no parent data fetched behind the gate). Grace: a
successful verify action sets the cookie; the layout re-renders children.

### C. Actions — `(parent)/pin-actions.ts`
- `verifyParentPinAction(pin)` — rate-limited, verifies, sets the cookie.
- `setParentPinAction(pin)` — requires an UNLOCKED state (or no existing PIN).
- `clearParentPinByPasswordAction(password)` — Better Auth password check, then clear.
All return calm discriminated results (existing action idiom), never throw to client.

### D. Handoff UX
- **`HandoffButton`** (client): writes the learner id to the existing
  `ka:account-learner` localStorage slot, then routes to
  `/learn/kaelyn-adaptive` — the child lands on **her** map, picker skipped
  (mirrors `useLearnerState`'s account-selection read).
- Placement: `ProfileCard` on `/parent` (primary learner) and each learner card
  on `/parent/learners`; `AddChildForm` success state gains one explainer line
  ("Kaelyn learns on this device through your account — no child login") + the button.
- **Handoff beat**: brief kid-styled fullscreen interstitial ("Passing to
  Kaelyn — tap GO!") before the map, so the device changes hands on a friendly
  screen. Static Tailwind classes, Phosphor icons, reduced-motion safe.
- **First-handoff nudge**: if the account has no PIN, the interstitial offers
  "Lock the grown-up area first?" (skippable, links to settings#pin).

### E. Settings — `/parent/settings`
New "Grown-up lock" section: set/change PIN (enter twice), remove PIN
(password), copy explaining the 15-minute grace window.

## Testing
- Unit: hash/verify round-trip + wrong-pin; token mint/verify (expiry, tamper,
  wrong account); rate-limit lockout; store fns tenancy.
- Component: PinChallenge (error/cooldown states), SettingsForm PIN section.
- e2e (`e2e/specs/parent-pin.spec.ts` + handoff case): set PIN → `/parent`
  challenges → wrong PIN rejected → correct unlocks → handoff lands on the
  learner's map without the picker; no-PIN account never challenged (existing
  suite must stay green — it never sets a PIN).

## Non-goals
Child accounts/sessions; idle auto-lock; admin gating; PIN on kid surface;
multi-device unlock sync (cookie is per-browser by design).

## Rollout
App + one additive migration (0013). Health canary gains the `parent_pin`
columns (live 200 = migration applied, per Slice-2 convention). No seed run.
COPPA export unaffected (no child data added; PIN is parent data —
export/delete of the account already covers the `user` cascade).
