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

---

## Unit sequencing (pacing, not access control) — enforced for sequential programs

**Where:** `src/components/learner/unitAccess.ts` — `playableUnitIds`, the one
derivation the world map, the unit route, the activity route, and every offered
destination (hero pick, warm-up row, quest) now share.

**Status: closed for account learners on sequential programs.**

Previously `computeUnlockedIds` gated only `StudioHome`'s world-map tiles, so an
enrolled child who deep-linked into a later, still-locked unit played it anyway.
A signed-in learner resolving a locked unit now gets `UnitLocked` ("Not open
yet!") on both the unit and activity routes, and the tutor no longer *offers*
locked destinations it would then refuse.

**Only programs whose unit ORDER is pedagogy are sequenced.** `computeUnlockedIds`
sequences by array position, so enforcing it only makes sense where position
means something — `keyboard-club` (home row before top row). It does not for the
other served programs, and enforcing it there was actively wrong:

- `kaelyn-adaptive`'s units are seven parallel SUBJECT STRANDS. Array order put
  Math behind Reading → Word Study → Writing, contradicting the recommender's
  documented contract that "each strand advances INDEPENDENTLY … never lets a
  strong strand wait on a weak one" (`src/lib/tutor/recommend.ts`).
- `world-languages`' units are four INDEPENDENT languages. Array order put
  Korean behind Mandarin phonetics.

This also fixes a pre-existing MAP bug: those programs were already *displaying*
those units as locked. The tiles were lying; now they aren't.

The flag lives in code keyed by slug, not as a `Program` field, because the
DB-assembled tree is built from explicit columns (`src/lib/content/store.ts`) —
a new field would arrive `undefined` for DB-served programs, and content is
DB-preferred in production, which would silently disable this everywhere it
matters. When marketplace programs need to declare their own pacing, it becomes
a real column with an explicit default.

**Access is monotonic.** Every started unit stays open. `computeUnlockedIds`
alone only opens a unit whose PREDECESSOR is started, so it could revoke a unit
a child was mid-way through: assign only one unit, let her play it, then widen
the assignment, and array-order sequencing would lock it — taking her replays,
her due reviews, and her generated shelf with it. Progress may open doors; it
must never close one.

**A unit with no activities counts as started.** It can never be completed, so
treating it as a barrier would strand the learner behind it forever. Authored
trees can legitimately contain one.

**Only BASELINE check-ins are exempt from sequencing.** They carry `order: 0`
but sit at the END of the authored array, so position-based sequencing would
bury a new learner's placement behind the entire program. `mid` and `final`
check-ins are deliberately scheduled later and stay sequenced — exempting them
would open a final assessment on day one.

**Still open, by design — guest mode.** A guest has no enrollment whose pacing
could be circumvented, and the activity route is never handed the published unit
graph the gate needs (it receives only the single SSR unit). `e2e/specs/typing.spec.ts`
deep-links through this exemption and is expected to keep working.

**Deliberately absent from the write path.** `recordAttemptAction` still checks
enrollment, curation, and the version pin — but NOT sequencing. Pacing must
never cost a child work they finished. Curation stays enforced there because it
is access control; sequencing is not.

**Parent skip-ahead still works.** Sequencing runs INSIDE curation and the first
curated segment is always open, so assigning only unit 7 opens unit 7. Note that
`applyPlacement` seeds *skills* solid (skipping spaced review); it never marks
units complete, so it does not and is not meant to move a learner forward on the
map.

**Residuals.**
- `resolveGeneratedPractice` is not sequence-gated (reachable only by
  deep-linking a generated-practice UUID; curation still applies).
- During the account-load window the unit route still renders published SSR
  content before `ready`, so a tile tapped in that window can resolve to
  `UnitLocked` afterwards. Pre-existing anti-flicker behavior (Fix-E), not
  introduced here.
