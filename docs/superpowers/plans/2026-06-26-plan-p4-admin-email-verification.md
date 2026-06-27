# P4 — Admin gate hardening: require a verified email (and a server-side role) before the allowlist

> **Type:** Design / plan document. **No `src/` changes are made by this document.**
> **Date:** 2026-06-26
> **Phase:** P4 (security hardening)
> **Tracks:** `docs/claude/KNOWN-RISKS-P0-PILOT.md` → "Admin authorization (P4)"
> **Author:** plan only — implementation is a follow-up PR.

---

## 0. TL;DR / recommendation

Close the documented P4 admin-auth gap in **two layers**, smallest-blast-radius first:

1. **Defense (ship first, no email infra needed):** add a server-side **`role` column** on the
   `user` row and make `requireAdmin()` require **`role === "admin"`** in addition to the
   `ADMIN_EMAILS` allowlist. The allowlist becomes a *seed/recovery* mechanism, not the live
   authority. A self-registered allowlisted email gets `role = "user"` by default and is rejected.
   This removes the "unclaimed allowlisted email → instant admin" vector immediately, **without**
   waiting on an email transport.
2. **Identity proof (ship with email transport):** enable **Better Auth email verification**
   (`sendVerificationEmail` + `requireEmailVerification: true`) so a session's email is *proven* to
   belong to the user, and additionally require **`emailVerified === true`** in `requireAdmin()`.

The two layers are complementary and the plan lands them in that order so admin auth is hardened on
day one (role gate) and identity is proven as soon as an SMTP/transactional provider is sealed in.

**Recommended end state of `requireAdmin()`:** valid session **AND** `user.emailVerified === true`
**AND** `user.role === "admin"`. `ADMIN_EMAILS` is retained only as the seed list that grants the
`admin` role (via a one-shot grant action / backfill), never as the per-request authority.

---

## 1. Current state (precise)

### 1.1 How admin access is authorized today

Two independent checks, both keyed purely on `email ∈ ADMIN_EMAILS`:

**(a) Route gate — `src/app/(admin)/admin/layout.tsx`** (UX redirect, `export const dynamic = "force-dynamic"`):

```ts
const session = await getAuth().api.getSession({ headers: await headers() });
if (!session?.user) redirect("/sign-in");
if (!isAdminEmail(session.user.email, getEnv("ADMIN_EMAILS", ""))) redirect("/parent");
return <AdminShell>{children}</AdminShell>;
```

**(b) Action/data gate — `src/lib/admin.ts` → `requireAdmin()`** (the real authority; every admin
server action in `src/app/(admin)/admin/actions.ts` calls it first — 7 call sites: create/edit/save/
publish/clone/archive/list):

```ts
const session = await getAuth().api.getSession({ headers: await headers() });
if (!session?.user) throw new UnauthenticatedError();
const email = session.user.email;
if (!isAdminEmail(email, getEnv("ADMIN_EMAILS", ""))) throw new AdminForbiddenError();
// stale-session defense: confirm the user row still exists, else UnauthenticatedError
const [row] = await db.select({ id: schema.user.id }).from(schema.user)
  .where(eq(schema.user.id, session.user.id)).limit(1);
if (!row) throw new UnauthenticatedError();
return { userId: session.user.id, email };
```

`isAdminEmail(email, allowlist)` (pure): case-insensitive, comma-split, trimmed membership test.
Empty allowlist or no match → `false`.

The layout is **only UX** (it redirects). The security-bearing gate is `requireAdmin()` in the
server actions; an attacker hitting a server action directly never sees the layout. So the gate to
harden is `requireAdmin()` — the layout is hardened in lockstep purely so the UX matches.

### 1.2 The vector (verbatim from KNOWN-RISKS-P0-PILOT.md)

Self-serve signup is **on** (`emailAndPassword.enabled: true`, no `disableSignUp`) and email
verification is **off**. The email on a session is whatever the user typed at sign-up — it is **not
proven to belong to them**. An attacker who knows an allowlisted admin email that has **not yet been
registered** can self-register that address and is admitted to `/admin/*` as admin. The asset behind
the gate is authoring-only (create/edit/publish curriculum); child/parent data stays account-scoped
via `withAccount`/`requireAccount` (`src/lib/tenancy.ts`) independent of this gate. Accepted for the
single-operator P0 pilot; this plan is the P4 fix.

### 1.3 Is Better Auth email verification configured? — No.

`src/lib/auth.ts` (the lazy `getAuth()` factory) configures only:

```ts
betterAuth({
  database: drizzleAdapter(getDb(), { provider: "pg", schema }),
  secret: getEnv("BETTER_AUTH_SECRET"),
  baseURL: getEnv("BETTER_AUTH_URL", "http://localhost:3000"),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    requireEmailVerification: false,   // ← intentionally OFF until a transport exists
  },
});
```

There is **no** top-level `emailVerification` block and **no** `sendVerificationEmail`. The inline
comment is explicit: turning `requireEmailVerification` on without wiring `sendVerificationEmail`
"would lock out every new parent at sign-up." A repo-wide grep confirms **no email transport exists
anywhere in `src/`** (no `nodemailer`/`resend`/`sendgrid`/`postmark`/`smtp`/`sendVerificationEmail`).
The LiteLLM gateway (`src/lib/ai/models.ts`, `LITELLM_URL`/`LITELLM_API_KEY`) is for **AI chat
completions only** — it is **not** an email transport and cannot send mail.

### 1.4 What `emailVerified` looks like on the user row

- **Schema** — `src/lib/db/auth-schema.ts`:
  `emailVerified: boolean("email_verified").notNull().default(false)`.
- **Migration** — created in `drizzle/0001_cute_puck.sql`:
  `"email_verified" boolean DEFAULT false NOT NULL`.
- **Population:** because verification has never been enabled and `sendVerificationEmail` is unset,
  **every existing user row has `email_verified = false`** — including the legitimate operator
  (Bryan). This is the single most important rollout fact: flipping `requireEmailVerification: true`
  or adding an `emailVerified` gate **with no backfill would lock the operator out**. The Better Auth
  `User` type carries `emailVerified` (verified in `@better-auth/core/.../db/schema/user.d.mts`), so
  `session.user.emailVerified` is available in the gate without a DB read; the gate already does a DB
  read for staleness, so it can read `role`/`emailVerified` from the row authoritatively (preferred —
  see §3.3).

### 1.5 Sign-in / sign-up surface (what changes downstream)

- `src/app/(auth)/sign-in/page.tsx` and `sign-up/page.tsx` are thin server components rendering
  `<AuthForm mode=… />`.
- `src/app/(auth)/AuthForm.tsx` (client) calls `signUp.email({...})` / `signIn.email({...})` from
  `src/lib/auth-client.ts` and on success hard-redirects to `/parent` (`REDIRECT_TO`).
- With `requireEmailVerification: true`, **`signIn.email` for an unverified user fails** (Better
  Auth blocks session creation and prompts to verify). The form's current generic error string
  ("That email and password did not match") would mis-describe this. The form must learn the
  "verify your email" branch. This is a UX consequence of the security change, in scope here.

### 1.6 Migration conventions in this repo (to follow)

- Drizzle: schema at `src/lib/db/schema.ts` (re-exports `auth-schema.ts`), output `drizzle/`,
  dialect postgres (`drizzle.config.ts`). Generate with `bun run db:generate`.
- **Migrations do NOT auto-run on deploy** (per project memory): they are applied manually in-cluster
  (`kubectl exec … psql -U postgres`); `scripts/db.sh` peer-auth fails in-cluster. The plan accounts
  for this in rollout (§6).
- **Expand-only** is the house style — see `drizzle/0005_*.sql`: additive only, `IF NOT EXISTS`,
  plain (transactional) `CREATE`/`ALTER` (drizzle-kit `migrate` runs in a transaction; no
  `CONCURRENTLY`). A `role` column added with a `DEFAULT` and `NOT NULL` is expand-only and safe.

---

## 2. Design — Better Auth email verification

### 2.1 Verification flow (Better Auth v1.6.20, installed)

The exact option surface (confirmed in `@better-auth/core/.../types/init-options.d.mts`):

```ts
emailVerification?: {
  sendVerificationEmail?: (data: { user: User; url: string; token: string }, request?: Request) => Promise<void>;
  sendOnSignUp?: boolean;                 // send automatically right after sign-up
  sendOnSignIn?: boolean;                 // re-send on a sign-in attempt by an unverified user
  autoSignInAfterVerification?: boolean;  // create a session the moment they click the link
  expiresIn?: number;                     // token TTL seconds (default 3600 = 1h)
  afterEmailVerification?: (user: User, request?: Request) => Promise<void>;  // hook (see §3.2)
};
emailAndPassword: {
  enabled: true;
  requireEmailVerification?: boolean;     // block session creation until verified
  ...
};
```

**Flow once enabled:**

1. Parent submits sign-up → Better Auth creates the `user` row (`email_verified = false`) and, with
   `sendOnSignUp: true`, calls our `sendVerificationEmail({ user, url, token })`. `url` is the
   ready-made verify link (`{baseURL}/api/auth/verify-email?token=…&callbackURL=…`); we just deliver
   it.
2. With `requireEmailVerification: true`, no usable session is created until the email is verified;
   `signIn.email` by an unverified user is rejected (and, with `sendOnSignIn: true`, re-sends the
   link).
3. Parent clicks the link → Better Auth's `/api/auth/verify-email` route (already mounted by the
   catch-all `src/app/api/auth/[...all]/route.ts`) validates the token against the `verification`
   table, sets `email_verified = true`, fires `afterEmailVerification`, and (with
   `autoSignInAfterVerification: true`) redirects to `callbackURL` with a session.
4. The `verification` table already exists (`auth-schema.ts` + `drizzle/0001`); Better Auth manages
   its rows. **No schema change is needed for verification itself.**

**Decision — `autoSignInAfterVerification: true`** so the click lands the parent straight in
`/parent` (no second login). **`sendOnSignUp: true`** and **`sendOnSignIn: true`** so an unverified
parent who tries to log in re-triggers the email instead of being silently stuck. Keep
`expiresIn` at the 1h default; the resend path covers expiry.

### 2.2 The email transport (the real dependency)

Better Auth does **not** send email — `sendVerificationEmail` is a callback we must implement against
a transactional/SMTP provider. **Nothing in the repo can send email today** (§1.3). Options:

| Option | What it is | Fit for this homelab | Verdict |
|---|---|---|---|
| **A. SMTP via `nodemailer`** | Generic SMTP client; point at any relay (existing homelab Postfix/mail relay, Fastmail/Migadu app-password, etc.) | No external SaaS dependency; matches the self-hosted posture; one sealed-secret of SMTP creds | **Recommended** if a homelab SMTP relay or a mailbox app-password is available |
| **B. Transactional API (Resend / Postmark / SES)** | HTTPS email API + SDK | Best deliverability (SPF/DKIM/DMARC handled); adds a third-party + API key | Recommended **only** if no SMTP relay exists or deliverability to external parents matters at productization |
| C. LiteLLM gateway | AI chat gateway | **Cannot send email.** Listed only to rule it out | ✗ |
| D. Console/no-op transport | Log the URL to server logs | Dev/staging only; never production (would make verification a no-op) | dev only |

**Recommendation:** **Option A (SMTP + `nodemailer`)** as the default, because it keeps the
self-hosted posture and needs only a sealed SMTP secret. Use Option B if the operator has no usable
SMTP relay/app-password. Implement behind a tiny `src/lib/email.ts` seam (`sendEmail({to, subject,
html, text})`) so the transport is swappable and `sendVerificationEmail` only formats the message —
this also lets the future password-reset (`sendResetPassword`) and parent-report emails reuse it.

**Build-safety:** the transport client must be created **lazily per-call** (same rule as `getDb()`/
`getAuth()`), never at module top-level, so `next build` never opens a socket. `sendVerificationEmail`
must **never throw past Better Auth** in a way that blocks account creation in a confusing way — wrap
the send in try/catch, `captureNonCritical` on failure (`src/lib/capture.ts`), and rely on the
resend-on-sign-in path; a transient SMTP blip should not hard-fail sign-up.

**Latest stable versions to pin (verify at implementation time per CLAUDE.md, fetch npm):**
`nodemailer` (Option A) or `resend` (Option B). `better-auth` is already `^1.6.18` (1.6.20 installed)
and needs no bump.

### 2.3 Why verification matters for the gate

Verification is what makes `email` *trustworthy*. Without it, `email ∈ ADMIN_EMAILS` proves nothing
(the attacker typed the email). With `requireEmailVerification: true` + an `emailVerified` gate, an
unverified address can never satisfy `requireAdmin()` — the attacker would need to actually receive
mail at the allowlisted admin address, which they don't control. This is the identity half of the
fix; the `role` column (§3) is the authorization half.

---

## 3. Design — the admin gate change

### 3.1 The tradeoff: allowlist+verified-email **vs** a real `role` column

| Approach | How `requireAdmin()` decides | Pros | Cons |
|---|---|---|---|
| **(1) Allowlist + verified email** | `emailVerified === true` AND `email ∈ ADMIN_EMAILS` | Tiny change; no migration; allowlist stays the single source of truth | Authority still lives in an **env var** evaluated every request; rotating admins = redeploy; depends entirely on verification being on (if verification ever regresses to off, the vector reopens); still trusts a *string match* rather than a per-principal fact |
| **(2) Server-side `role` column** | `role === "admin"` (allowlist only **seeds** the role) | Authority is a **per-user DB fact**, not a request-time string; immune to the unverified-email vector **even before** verification ships; supports `parent`/`admin` per spec §7; future-proofs multi-admin, audit, and a real `account` table (tenancy.ts TODO) | Needs a migration + a grant/seed path; two concepts (`role` + allowlist) during transition |
| **(3) Both (recommended)** | `emailVerified === true` AND `role === "admin"`; `ADMIN_EMAILS` seeds the role | Belt-and-suspenders: proven identity **and** explicit per-principal grant; allowlist degrades to a convenience seed; matches spec §7 roles | Slightly more surface; clear once documented |

**Recommendation: (3), staged.** Land the **`role` column gate first** (no email dependency — closes
the vector immediately because a self-registered allowlisted email has `role = "user"`), then add the
**`emailVerified` requirement** when the transport ships. spec §7 already calls for `parent`/`admin`
roles, so the column is on the roadmap regardless; doing it here is not scope creep.

### 3.2 Target `requireAdmin()` (server authority)

Conceptual shape (illustrative — not applied by this doc):

```ts
export async function requireAdmin(): Promise<{ userId: string; email: string }> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) throw new UnauthenticatedError();

  // Authoritative read from the row (not the session blob): staleness + role + verified in one go.
  const db = getDb();
  const [row] = await db
    .select({ id: schema.user.id, email: schema.user.email,
              role: schema.user.role, emailVerified: schema.user.emailVerified })
    .from(schema.user).where(eq(schema.user.id, session.user.id)).limit(1);
  if (!row) throw new UnauthenticatedError();          // stale session (unchanged behavior)

  if (!row.emailVerified) throw new AdminForbiddenError();   // identity not proven (Stage 2)
  if (row.role !== "admin") throw new AdminForbiddenError(); // not granted (Stage 1)

  return { userId: row.id, email: row.email };
}
```

Reading `role`/`emailVerified` **from the DB row** (the gate already does the staleness `select`) is
preferred over trusting `session.user.*`: it cannot be stale, and a revoked admin loses access on the
next request even with a live cookie. `isAdminEmail` is **retained** and used by the **seed/grant**
path (§3.4) and tests, not by the live gate. Keep throwing `AdminForbiddenError` so the existing
mapping in `actions.ts` (→ `{ ok:false, reason, message }`) and `(admin)/admin/error.tsx` is
unchanged.

**Staging within the gate:** Stage 1 PR adds only the `row.role !== "admin"` check. Stage 2 PR adds
the `!row.emailVerified` check at the same time `requireEmailVerification` flips on. Keeping them
separate PRs means the verified-email gate never lands ahead of the transport (no lockout window).

Optionally use Better Auth's `afterEmailVerification` hook to auto-promote a freshly-verified user
whose email is in `ADMIN_EMAILS` to `role = "admin"` — convenient, but the explicit grant action
(§3.4) is clearer and auditable; treat the hook as optional sugar, not the mechanism.

### 3.3 The `role` column

Add `role text NOT NULL DEFAULT 'user'` to the `user` table.

- Values: `'user'` (default; covers parents) and `'admin'`. (spec §7 names `parent`/`admin`; `'user'`
  is the safe default for the better-auth base table and reads as "ordinary parent account". If we
  prefer the literal spec vocabulary, use `'parent'` as the default — pick one and document it. Using
  `'user'` avoids implying every account is a configured parent before onboarding.)
- Surface to Better Auth via `user.additionalFields` (confirmed supported in core options) so the
  field round-trips through the adapter and is present on `session.user`:
  ```ts
  betterAuth({ /* … */, user: { additionalFields: {
    role: { type: "string", required: false, defaultValue: "user", input: false /* never client-settable */ },
  }}});
  ```
  `input: false` is critical: it prevents a client from setting `role: "admin"` via the sign-up
  payload (privilege escalation). The DB `DEFAULT 'user'` is the backstop.
- Mirror in `src/lib/db/auth-schema.ts`:
  `role: text("role").notNull().default("user")`.

### 3.4 Seeding / granting the admin role

The allowlist becomes the **seed**, applied through one of:

1. **Recommended — a guarded server action / one-shot script** that, for each email in
   `ADMIN_EMAILS`, sets `role = 'admin'` on a matching **existing** user row (no-op if the email
   isn't registered yet). Reusable: re-running it reconciles the allowlist into roles. Runnable via
   `kubectl exec … psql` or a tiny `scripts/` helper.
2. **`afterEmailVerification` hook** (optional, §3.2) auto-promotes allowlisted users on verify.
3. **Manual SQL** for the initial single operator (§6) — fastest path to avoid self-lockout.

`ADMIN_EMAILS` stays in `.env.example`/sealed-secret as the seed list and as recovery (re-grant if a
role is accidentally cleared), but it is **no longer the per-request authority**.

### 3.5 The route layout (`(admin)/admin/layout.tsx`)

Mirror the gate so UX matches authority: redirect to `/sign-in` if no session; redirect to `/parent`
if `role !== "admin"` (and, Stage 2, if `!emailVerified`). Simplest correct approach: have the layout
call a small shared resolver (or reuse the same DB read) instead of re-deriving from `isAdminEmail`.
The layout remains UX-only; `requireAdmin()` in the actions remains the security boundary.

---

## 4. Files to change (list only — NOT edited by this document)

| File | Change |
|---|---|
| `src/lib/auth.ts` | Add top-level `emailVerification` block (`sendVerificationEmail`, `sendOnSignUp`, `sendOnSignIn`, `autoSignInAfterVerification`); add `user.additionalFields.role` (`input:false`, default `"user"`); **Stage 2:** set `emailAndPassword.requireEmailVerification: true`. Keep all factories lazy/build-safe. |
| `src/lib/db/auth-schema.ts` | Add `role: text("role").notNull().default("user")` to the `user` table. |
| `src/lib/admin.ts` | `requireAdmin()` reads `role` + `emailVerified` from the user row; assert `role === "admin"` (Stage 1) and `emailVerified === true` (Stage 2). Keep `isAdminEmail` for the seed/grant path + tests. Update the SECURITY doc-comment to "fixed in P4 (role + verified email)". |
| `src/app/(admin)/admin/layout.tsx` | Redirect on `role !== "admin"` (Stage 1) / `!emailVerified` (Stage 2) instead of `isAdminEmail`; reuse the shared resolver/DB read. |
| `src/lib/email.ts` *(new)* | Lazy transport seam: `sendEmail({to,subject,html,text})` over SMTP (`nodemailer`) or transactional API; `getEnv` for creds; never top-level connect; `captureNonCritical` on failure. Reused later by password-reset/report emails. |
| `src/lib/auth-email.ts` *(new, or inline in auth.ts)* | `sendVerificationEmail` impl: format the verify email (kid-brand-appropriate, plain + minimal HTML), call `sendEmail`, wrap in try/catch + `captureNonCritical`. |
| `src/app/(auth)/AuthForm.tsx` | Handle the "email not verified" branch: distinct copy + a "resend verification email" affordance (calls the client `sendVerificationEmail`/`verifyEmail` method on the auth client); stop showing "wrong password" for an unverified-login rejection. |
| `src/lib/auth-client.ts` | (If needed) export the client's `sendVerificationEmail`/`verifyEmail` helpers for the resend affordance. |
| `src/app/(auth)/verify-email/…` *(optional new)* | A friendly "check your inbox" / "email verified" landing (Better Auth handles the token route; this is just human-facing copy + a resend button). Not strictly required since `autoSignInAfterVerification` lands them in `/parent`. |
| `drizzle/0006_*.sql` + `drizzle/meta/*` *(generated)* | The `role` column migration (via `bun run db:generate`). |
| `.env.example` | Add SMTP/transactional vars (see §5); annotate `ADMIN_EMAILS` as "seed for the admin role, not the live authority." |
| `src/lib/admin.test.ts` / `src/lib/auth*.test.ts` *(tests)* | Cover the new gate matrix (§7). |
| `docs/claude/KNOWN-RISKS-P0-PILOT.md` | Once both stages ship, mark the "Admin authorization (P4)" section **closed** with the fix description (mirrors how the kid-curation section was marked closed). |
| `DEPLOY.md` | Add the new sealed-secret (`kaelyns-academy-email` or extend `-auth`) + the migration + role-seed step to the deploy notes. |

**Infra (separate repo `k3s-infra`, not `src/`):** a new sealed-secret for SMTP/transactional creds
and the deployment env wiring (§5).

---

## 5. Config / secrets needed

All secrets via **sealed-secrets** in `k3s-infra` (never plaintext — CLAUDE.md / spec §8). Add a new
sealed-secret (e.g. `kaelyns-academy-email`) or extend the existing `kaelyns-academy-auth`.

**Option A (SMTP / nodemailer):**

```
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=            # sealed-secret
EMAIL_FROM="Kaelyn's Academy <no-reply@kaelyns.academy>"
```

**Option B (transactional, e.g. Resend):**

```
RESEND_API_KEY=       # sealed-secret
EMAIL_FROM="Kaelyn's Academy <no-reply@kaelyns.academy>"
```

**Better Auth / app settings:**

- `BETTER_AUTH_URL` — already set; **must be the real public origin** (`https://kaelyns.academy`) in
  prod so the verification `url`/`callbackURL` in the email is clickable and on-origin. (Already
  `https://kaelyns.academy` in the deploy env per the P0 plan; dev stays `http://localhost:3000`.)
- `ADMIN_EMAILS` — retained as the **role seed list** (annotate in `.env.example`).
- No new `BETTER_AUTH_SECRET` change.

**Deliverability (Option A/B):** ensure SPF/DKIM/DMARC for `kaelyns.academy` so verification mail
doesn't land in spam (Cloudflare DNS). Note this in DEPLOY.md; for the single-operator pilot, even a
mailbox app-password relay is fine, but record the requirement for productization.

---

## 6. Rollout / backfill (do **not** lock the operator out)

The ordering is the whole game, because **every existing user row has `email_verified = false`** and
no row has `role = 'admin'` until seeded.

**Stage 0 — pre-work (no behavior change):**
1. Land the `role` column migration (expand-only, `DEFAULT 'user' NOT NULL`, `IF NOT EXISTS`). Apply
   in-cluster (`kubectl exec … psql -U postgres`) — migrations don't auto-run on deploy.
2. **Seed the operator immediately** so Stage 1 can't lock them out:
   ```sql
   UPDATE "user" SET role = 'admin'
   WHERE lower(email) IN (lower('bryan@askcv.ai') /*, other ADMIN_EMAILS */);
   ```
   (Or run the grant action/script of §3.4.) Verify: `SELECT email, role, email_verified FROM "user";`

**Stage 1 — role gate (no email dependency, closes the core vector):**
3. Ship the `requireAdmin()` + layout change to require `role === 'admin'`. Because the operator is
   already `admin` (Stage 0 step 2) they keep access; a self-registered allowlisted email is `'user'`
   and is now rejected. **The unclaimed-allowlisted-email → admin vector is closed here**, before any
   email work.

**Stage 2 — verified-email gate + verification on (needs transport):**
4. Add the transport (`src/lib/email.ts`) + `sendVerificationEmail` + the `emailVerification` block,
   but **leave `requireEmailVerification: false`** initially and deploy. Smoke-test that a real
   verification email is delivered and the link verifies (`email_verified` flips to `true`).
5. **Backfill verification for the operator** so step 6 doesn't lock them out. Either:
   - have the operator click a real verification email (cleanest — proves the transport), or
   - one-time SQL: `UPDATE "user" SET email_verified = true WHERE lower(email) IN (…trusted operator…);`
   Verify the operator row shows `email_verified = true`.
6. Flip `emailAndPassword.requireEmailVerification: true` **and** add the `!row.emailVerified` check
   in `requireAdmin()`/layout, then deploy. New parents must now verify before they get a session;
   the operator (already verified + admin) is unaffected.

**Backfill posture for existing non-admin parents:** at pilot there is effectively one household, so
the realistic set is the operator + the pilot parent. Decide per row whether to (a) trust-flip
`email_verified = true` for the known pilot parent, or (b) require them to verify on next login (with
`sendOnSignIn: true` they'll get the email automatically). For a clean productization story, prefer
(b) for anyone who isn't the operator; for pilot continuity, (a) for the single known parent is
acceptable and documented.

**Recovery / anti-lockout invariants:**
- Keep `ADMIN_EMAILS` as the re-grant seed: if an admin role is ever cleared, re-run the grant.
- The `role`/`emailVerified` columns are read from the DB row, so emergency access can always be
  restored with a single `UPDATE "user" SET role='admin', email_verified=true WHERE email=…`.
- Never deploy step 6 before step 5. Never deploy Stage 1 before Stage 0 step 2.

---

## 7. Risks + mitigations

| Risk | Mitigation |
|---|---|
| **Self-lockout** of the operator when the verified/role gate turns on (all rows are `false`/`'user'`) | Strict staging (§6): seed `role='admin'` and `email_verified=true` for the operator **before** each gate flips; emergency `UPDATE` always available since the gate reads the row. |
| **`sendVerificationEmail` not wired but `requireEmailVerification: true`** → every new parent locked out at sign-up | Stage 2 lands transport first (`requireEmailVerification` stays `false`), verifies real delivery, only then flips the flag. Two separate PRs. |
| **Email deliverability** (verification mail → spam / not delivered) | SPF/DKIM/DMARC for `kaelyns.academy`; `sendOnSignIn: true` resend path; "resend verification" button in `AuthForm`; `captureNonCritical` on send failure so blips are visible in Sentry, not silent. |
| **Privilege escalation via sign-up payload** (`role: "admin"` in the body) | `user.additionalFields.role` is `input: false` (server-only) + DB `DEFAULT 'user'`; role is granted only by the seed action / `afterEmailVerification`, never by client input. |
| **Transport breaks `next build`** (top-level connect) | Lazy per-call client in `src/lib/email.ts` (same rule as `getDb()`/`getAuth()`); no module-top-level I/O. |
| **Send failure hard-fails sign-up** confusingly | Wrap send in try/catch + `captureNonCritical`; let account creation proceed; rely on resend-on-sign-in. |
| **AuthForm mis-reports** "wrong password" for an unverified-login rejection | Add the explicit "verify your email" branch + resend affordance (in scope, §1.5). |
| **Migrations don't auto-run on deploy** → gate code ships before the `role` column exists → 500s | Apply the migration in-cluster **before** deploying the gate change (Stage 0); the `requireAdmin` DB read selecting a non-existent column would otherwise throw. Order is enforced in §6. |
| **Verification regresses to off later** (someone flips the flag back) | The `role` gate (Stage 1) is independent of verification, so even if verification regresses, the unclaimed-email vector stays closed. Defense in depth is the point of doing both. |
| **Child-data posture (spec §8)** — verification emails to **parents** only | Verification targets the parent account email; **no child email exists** and none is introduced. No child PII in the email. Consistent with §8 and the "no child PII in titles/metadata" memory. |
| **CSRF / origin** for the verify link | `BETTER_AUTH_URL` set to the real origin so `url`/`callbackURL` are same-origin; Better Auth trusts `baseURL`'s origin (already noted in `auth.ts`). |

---

## 8. Test plan

**Unit (vitest, `bun run test`) — gate matrix for `requireAdmin()` / `isAdminEmail`:**
- `isAdminEmail`: existing pure-fn cases stay green (case-insensitivity, trim, empty, no-match).
- `requireAdmin` (mock `getAuth().api.getSession` + the DB `select`):
  - no session → `UnauthenticatedError`.
  - session but user row missing → `UnauthenticatedError` (staleness, unchanged).
  - row `role='user'` → `AdminForbiddenError` (even if email ∈ allowlist) — **the core regression test
    for the vector**.
  - row `role='admin'`, `emailVerified=false` → `AdminForbiddenError` (Stage 2).
  - row `role='admin'`, `emailVerified=true` → returns `{ userId, email }`.
- Seed/grant action: allowlisted existing user → `role` becomes `'admin'`; allowlisted-but-unregistered
  email → no-op; non-allowlisted → unchanged.

**Integration / manual (local with a console/dev transport, then staging with real SMTP):**
- Sign-up sends a verification email (dev: assert the URL is logged/captured); unverified `signIn`
  is rejected once `requireEmailVerification` is on; clicking the link sets `email_verified=true`
  and (with `autoSignInAfterVerification`) lands in `/parent`.
- `AuthForm` shows the "verify your email" branch + working resend for an unverified login.
- Admin route: a verified non-admin parent hitting `/admin` → redirected to `/parent`; a verified
  admin → `AdminShell`. A direct call to an admin server action by a non-admin → `AdminForbiddenError`
  mapped to `{ ok:false }` (no redirect bypass).

**Build/lint/type gates (CLAUDE.md non-negotiable, before merge):**
`bun run lint && bun run typecheck && bun run test && bun run build` — and confirm `next build` still
succeeds (no top-level DB/auth/email connect; the email transport is lazy).

**Deploy canary:** `/api/health` schema-drift canary already returns 503 on missing critical columns;
add `user.role` to the canary's required-columns check if appropriate so a deploy that skipped the
migration fails closed (consistent with the health-canary pattern).

---

## 9. Open questions

1. **Transport choice — SMTP relay vs transactional API?** Does the homelab already have a usable
   SMTP relay / mailbox app-password (→ Option A), or should we add Resend/Postmark (→ Option B)?
   *(Biggest blocker — Stage 2 can't ship until this is answered and a sealed-secret exists.)*
2. **Role vocabulary:** default `'user'` vs spec §7's `'parent'`? (Plan assumes `'user'` as the
   better-auth-base default; trivial to switch — pick one and document.)
3. **Backfill policy for the known pilot parent:** trust-flip `email_verified=true`, or require them
   to verify on next login? (Operator is always trust-flipped to avoid lockout.)
4. **Do we want the `afterEmailVerification` auto-promote hook**, or keep role grants strictly via the
   explicit seed action (cleaner audit)? Plan leans explicit-action.
5. **Should `/admin` move behind SSO (Authentik) later?** spec §7 says "Authentik SSO optional for
   admin." Out of scope here, but the `role` column is the right substrate if/when SSO lands.
6. **Disable open self-serve signup entirely?** An alternative/complementary hardening: set
   `emailAndPassword.disableSignUp: true` and invite-only parents. Not required to close this vector
   (the role gate does), but worth a product decision for productization.

---

## 10. Recommendation recap

Land it in two PRs: **(PR1)** `role` column + grant-seed + `requireAdmin`/layout require
`role === "admin"` (closes the documented vector immediately, no email infra). **(PR2)** email
transport (`src/lib/email.ts` + `sendVerificationEmail`) + `emailVerification` config, then flip
`requireEmailVerification: true` and add the `emailVerified === true` requirement, with the operator
seeded/verified first at every step so there is never a lockout window. End state: **session AND
`emailVerified` AND `role === "admin"`**, allowlist demoted to a seed/recovery list.
