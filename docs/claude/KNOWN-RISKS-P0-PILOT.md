# Known risks — P0 homelab pilot (accepted, deferred)

This file records security/curation gaps that have been **consciously accepted**
for the P0 single-operator homelab pilot, with the vector, why it's tolerable
now, and the planned fix. These are not bugs to silently fix later — they are
documented decisions. Update or remove a section when its fix lands.

Pilot context (why these are acceptable today):

- A single trusted operator (the parent/author), no public traffic.
- One pilot learner; no third-party / customer data behind any surface.
- Homelab deployment (k3s via ArgoCD), not a multi-tenant SaaS.

---

## Admin authorization (P4) — Stage 1 SHIPPED (role gate); Stage 2 (verified email) deferred

**Where:** `src/lib/admin.ts` — `requireAdmin()`.

**Vector.** The admin gate authorizes purely by `email ∈ ADMIN_EMAILS`
(`isAdminEmail`). Self-serve signup is enabled and email verification is OFF, so
the email on a session is whatever the user typed at signup — it is **not proven
to belong to them**. An attacker who knows an allowlisted admin email that has
**not yet been claimed** could self-register that address and be admitted to the
studio (`/admin/*`) as an admin.

**Scope / bounds.** Authoring-only surface (create/edit/publish curriculum). No
access to other accounts' child data — the parent/learner surfaces remain
account-scoped via `withAccount` independently of this gate. Requires the
attacker to both know an allowlisted email and have it still unregistered.

**Why accepted for P0.** Single trusted operator, no public traffic, allowlist
controlled by the operator, and the only asset behind the gate is the operator's
own curriculum content. The window (an allowlisted-but-unregistered email) is
small and operator-controlled.

**Fix — Stage 1 (SHIPPED).** `requireAdmin()` now authorizes by a server-side
**`role` column** on the user row (`role === "admin"`), read authoritatively from
the DB; the `ADMIN_EMAILS` allowlist is demoted to a **seed**, never the per-request
authority. A self-registered allowlisted email now defaults to `role = "user"` and
is rejected — the "unclaimed allowlisted email → instant admin" vector is closed.
The seed (`scripts/seed-admin-roles.ts`) grants admin **only to email-verified**
allowlisted rows, so it can't re-open the vector by promoting a pre-registered,
unverified allowlisted address; while verification is off the operator is
bootstrapped out of band by **confirmed user id** (an email isn't proof of
ownership) — see DEPLOY.md → "Granting admin access". The role is surfaced to Better Auth via
`additionalFields.role` with `input: false` (a sign-up payload cannot set it), and
`user.role` is in the `/api/health` REQUIRED_COLUMNS so a deploy that skipped the
0007 migration fails closed.

**Fix — Stage 2 (DEFERRED, needs an email transport).** Additionally require
`emailVerified === true` so the session's email is *proven* to belong to the user
(belt-and-suspenders, e.g. against an operator listing an address they don't
control). Blocked on choosing/configuring an email sender (none exists; LiteLLM
cannot send mail) — see
`docs/superpowers/plans/2026-06-26-plan-p4-admin-email-verification.md`.

---

## Kid-surface curation (ENFORCED for play + record — Fix-F #2)

**Status:** the previously-accepted gap below is now **closed** for account
(signed-in) learners. Parent curation is enforced: a signed-in child can only
**play** and **record progress** for programs they have an **ACTIVE** enrollment
in (the pilot default `kaelyn-adaptive` + parent assignments via
`assignProgram`). Removed/paused/never-assigned programs, and units curated out
of a non-empty `activeUnitKeys`, are unreachable — a calm "ask a grown-up to add
this" state replaces the map/world/activity. Guest mode (not signed in,
localStorage) is unchanged: it has no account/enrollments and still plays every
published program.

**What enforces it (Fix-F A1–A4):**

- **No lazy auto-enroll-on-open (A1).** `getLearnerStateAction` no longer calls
  `ensureEnrollment`, and `useLearnerState` no longer fires
  `ensureEnrollmentAction` on open. Opening a program never self-activates it.
  (`ensureEnrollmentAction` remains exported but is no longer called by the
  surface; `ensureHouseholdLearner`'s default-program enrollment + parent
  `assignProgramAction` are the only paths that create an active enrollment.)
- **Availability signal (A2).** `getLearnerStateAction` reads the enrollment
  status (`getEnrollmentForGate`) and returns `available: true` with a playable
  pinned `program` ONLY when status is `active`; otherwise
  `{ ...EMPTY_STATE, available: false }` (no program).
- **Render-gating (A3, client-side).** `StudioHome` / `UnitView` / `ActivityHost`
  render a `NotAssigned` ("ask a grown-up") state in **account mode** when
  `available === false` OR the route's `unitKey` is curated out of a non-empty
  `config.activeUnitKeys`. The Fix-D `loadedForActive`/`ready` guard is kept, so
  while state loads the surface shows the calm loading beat, not a flash-of-block.
- **Record fails closed (A4, SERVER-authoritative).** `recordAttemptAction` now
  threads `programSlug`, and `recordAttempt` verifies an ACTIVE enrollment for
  `(learner, programSlug)` **inside the transaction** (after the tenancy
  re-check) before persisting. A removed/paused/missing enrollment throws
  `EnrollmentNotActiveError` → no attempt and no skill_state are written, and the
  action returns `reason: "inactive"`. So progress can never be recorded for a
  removed/unassigned program even via a direct API call that bypasses the UI.

**Threat model note (why render-gating stays client-side).** A3's render-block is
client-side because learner identity is client-resolved (the same trust model as
the version-pinned tree render). The SERVER-authoritative gates are tenancy
(`withAccount` / `getLearner`), the §8 AI gate (`/api/practice`), and now
`recordAttempt` (A4). This is appropriate to the threat model — a child with a
URL, not an attacker, and authored curriculum is not sensitive cross-account
data. A signed-in child can still *fetch* a published program's tree by direct
URL (it renders the published prop only in guest mode; in account mode the block
shows), but cannot **record** against it (A4) and cannot generate AI for it (§8).

**Remaining (deferred) bound.** `src/components/learner/ProgramPicker.tsx` still
shows all published programs when a learner has zero active enrollments (so a
child never sees an empty picker), but opening any of them now yields the
`NotAssigned` state rather than self-enrolling. Tightening the picker itself to a
"nothing assigned yet — ask a grown-up" tile (instead of the full catalog) is a
cosmetic follow-up; it no longer affects what a child can actually play or record.
