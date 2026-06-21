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

## Admin authorization (P4)

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

**Planned fix (P4).** Require a **verified** email before the allowlist check
(and/or a server-side `role` column on the user row that the allowlist seeds
rather than trusts at request time), so an unverified/unproven address can never
satisfy `requireAdmin`. Tie this to turning on Better Auth email verification.

---

## Kid-surface curation (parent assignment not strictly enforced)

**Where:** `src/components/learner/ProgramPicker.tsx` (the `visibleSlugs: … : null`
fallback) and `src/app/(learner)/actions.ts` — `ensureEnrollmentAction`.

**Vector.** When a signed-in child has **zero active enrollments**, the picker
shows **all published programs** (`visibleSlugs = null`), and opening a tile
lazily self-enrolls the learner into that program (`ensureEnrollmentAction`). So
a child can reach and enroll in any published program the parent never explicitly
assigned — parent curation is not strictly enforced on the kid surface.

**Scope / bounds.** Forgiving by design — a child never lands on an empty or
locked screen. The exposure is tightly bounded:

- **Tenancy holds:** only a learner the signed-in account actually owns is
  enrolled (`getLearner` ownership check before any write). No cross-account
  exposure.
- **Removed stays removed:** `ensureEnrollment` is an `onConflictDoNothing`
  insert; it never resurrects a soft-removed or paused enrollment. A program the
  parent removed stays removed and the §8 AI gate keeps blocking it.
- **Published only:** unpublished (draft/archived) programs are not reachable.

**Why accepted for P0.** One pilot learner whose parent is the operator. The
"curation" being relaxed is the parent's own program list for their own child;
there is no harmful content to gate against in the pilot catalog. A frustrating
empty/locked kid screen is judged worse than a child opening an unassigned but
benign published program.

**Planned fix (when curation matters — multi-program / multi-family).** Enforce
parent assignment on the kid surface: when a learner has zero active
enrollments, show an explicit "ask a grown-up" state instead of the full
catalog, and gate `ensureEnrollmentAction` on an existing parent assignment
(rather than auto-creating one on open).
