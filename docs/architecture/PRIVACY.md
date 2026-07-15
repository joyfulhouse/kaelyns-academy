# Privacy, Retention & Data Inventory

Current as of **P6** (COPPA-grade export/delete, AI provenance, per-learner settings).

This is the document the account-export **manifest points at** (`manifest.policy`).
It states, in one place: what child/parent data we keep, how long, what an export
contains, and what deleting an account removes. It is the operator + reviewer
reference for the §8 promises in `docs/specs/2026-06-13-platform-v3-design.md`.

> Source of truth for behavior is the code. When the data model changes, update
> this doc **and** the export manifest/inventory guard together — the test
> `src/lib/tutor/account-export.test.ts` fails CI if a new table that references
> a learner/user isn't given an export disposition.

---

## 1. Data minimization (what we keep)

Per the §8 child-data posture, we collect the **minimum** to run an adaptive
learning account:

| Subject | What we store | What we deliberately do NOT store |
|---|---|---|
| Parent (account) | email, password **hash** (Better Auth), timestamps, role | no name required, no phone, no address, no payment |
| Child (learner) | display name, **birth month only** (never a full DOB), avatar, per-learner settings | no full birth date, no photos, no contact info, no free-text profile |
| Learning data | enrollments, attempts (score + bounded per-kind response), derived skill_state | journal responses retain only counts/mode flags — **never text, transcript, strokes, or image data** |
| AI provenance | per generated attempt: model route, path tag, generated-at (**metadata only**) | **never the raw prompt** (a prompt can embed the child's display name → PII) |
| Oral-reading verification | a five-minute opaque witness with activity identity and derived tri-state/per-word/count/WCPM facts | **never audio, transcript, target text, or passage text** |
| Audio | shared, **content-addressed** narration clips keyed by `sha256(text|voice|speed)` | clips reference **no** learner/account (no PII); see §5 |

There is **no open-ended child↔LLM chat**. All child-facing AI is bounded and
schema-validated server-side by the durable shelf generator
(`ensureLessonPractice`), gated by the §8 controls below.

---

## 2. The §8 AI controls (parent kill-switches)

AI practice generation is **fail-closed** and gated at two independent levels,
both server-enforced by the durable shelf-generation server action:

- **Per-learner** `settings.aiPractice` — the all-programs kill-switch. Editable
  per child at `/parent/learners/[id]/settings` (and the primary child at
  `/parent/settings`). A stored `false` is **sticky** (never silently
  re-enabled).
- **Per-enrollment** `config.aiPractice` — per-program.

Either set to `false`, or a non-active enrollment, or a malformed stored value →
**no generation** (the gate degrades closed). See MEMORY "AI practice gate: two
controls".

---

## 3. Export (the "clear data inventory")

A parent can export **one child** (`exportLearnerAction`) or the **whole account**
(`exportAccountAction`) as a single machine-readable JSON file, downloaded
client-side (no server temp files). The account bundle is:

```
{ manifest, account, learners[] }
```

The **manifest** is the self-describing data inventory (`schemaVersion`,
`exportedAt`, `contents[]`, `notExported[]`, `policy` → this doc).

| Inventory category (`manifest.contents`) | Source | Notes |
|---|---|---|
| `account` | `user` row | id, email, createdAt — **never** password/tokens |
| `learners` | `learner` rows | display name + birth month only |
| `enrollments` | `enrollment` | program slug, status, config |
| `skillState` | `skill_state` | derived outcomes + per-day evidence |
| `reviewSchedules` | `review_schedule` | spaced-repetition skill ids, ladder position, and review dates |
| `attempts` | `attempt` | score (stars/correct/total), the full bounded response stored for that activity kind, day, createdAt. Journal responses contain only `markCount`, `textLength`, `usedDictation`, `mode`, and `didDraw` — never journal text, transcript, strokes, or image data. |
| `aiProvenance` | `attempt` (generated rows) | model, route, generatedAt — metadata only |

**Deliberately not exported** (`manifest.notExported`), and why:

- **narration audio** — shared, content-addressed, references no one; not the
  parent's to export and carries no PII.
- **raw AI prompts** — not stored at all (only the bound metadata is); see §1.
- **short-lived oral-reading witnesses** — operational claim rows, not learner
  artifacts. Once consumed, the canonical child-safe result is already exported
  in `attempts`; audio and transcripts are never stored at all.
- **passwords / auth tokens** — security-sensitive; never leave the system.

**Inventory guard.** A reviewer can diff `manifest.contents` against the DB tables
that reference a learner/user and confirm nothing child-bearing is silently
dropped. This is enforced: every table whose FK references `learner` or `user`
must be either an export category or an explicit non-export, or CI fails.

---

## 4. Retention & deletion

**Policy: delete on request, immediately and permanently (hard delete).** There
is no soft-delete / undo window — a 30-day grace would mean child data persists
*after* a parent asked to remove it, which is worse for COPPA than honoring the
request at once.

- **Delete one child** — `deleteLearnerAction` → `deleteLearner`. A single
  `DELETE FROM learner` cascades `enrollment`, `attempt`, `skill_state`, and
  `oral_reading_verification` via FK `ON DELETE CASCADE`.
- **Delete the whole account** — `deleteAccountAction` → `deleteAccount`. A single
  `DELETE FROM "user"` cascades the entire child-data graph **plus** the Better
  Auth `session` and `account` (credential/oauth) rows. The Better Auth
  `verification` table has **no** FK to `user`, so the same transaction also
  explicitly deletes this parent's `verification` rows — matching both Better Auth
  key shapes (`identifier = email` for email-verification, and `value = user.id`
  for reset / delete-account tokens) so nothing auth-related is left behind.
  `publisher.ownerUserId` is `ON DELETE SET NULL` (a published program does **not**
  vanish because its author closed their account — ownership nulls out). The FK
  cascade map is guarded by `src/lib/db/schema.test.ts`.

**Re-authentication (account delete).** Because account delete is irreversible,
it is gated by **two** checks, both verified server-side *before* anything is
deleted — fail either and nothing is touched:

1. a **typed confirmation**: the parent must type their own account email; and
2. a **password re-verification** through Better Auth's `verifyPassword`
   endpoint (a zero-side-effect hash check — no new session, no token rotation).

On success the session is invalidated and the parent lands on the public
`/goodbye` page.

**Deletion audit.** Immediately *before* the account cascade, a `deletion_audit`
row is written (in the same transaction): `userId`, `deletedAt`, `learnerCount`,
`attemptCount`, `requestedBy`. It has **no FK to `user`**, so it survives the
delete it records. It holds **no child PII** — only counts — and is an internal
operational record (it is **not** part of any export).

---

## 5. Audio is out of scope for export and delete

Narration clips are derived from **authored/approved text**, deduplicated by a
content hash, and stored in a shared bucket keyed by that hash. No audio row
references a learner or an account, so:

- audio carries **no child PII**, and
- deleting a learner/account **must not** touch shared clips (they belong to no
  one). Delete operates only on `learner`-cascaded rows + the auth rows above.

---

## 6. Provenance ("what the AI made")

Every AI-generated practice attempt records **metadata only** — the logical model
route, a path tag (band or language id), and the generation timestamp — derived
server-side at generation and surfaced to the parent at
`/parent/learners/[id]/activity`. We never store the raw prompt or model output
(it can embed the child's display name). Old generated rows (pre-P6) show "model
not recorded" rather than fabricating provenance.

**Trust level (v1).** This metadata is computed server-side and stored on the
learner-owned generated shelf row. Attempt recording reloads that row and derives
the provenance server-side; the browser cannot supply or alter it. It remains a
transparency record rather than a cryptographically tamper-evident audit.

---

## 7. Where this lives in the app

| Surface | Route |
|---|---|
| Account export + delete (re-auth gated) | `/parent/settings` |
| Per-learner settings (the §8 kill-switch, per child) | `/parent/learners/[id]/settings` |
| Per-learner AI provenance trail | `/parent/learners/[id]/activity` |
| Post-deletion confirmation (public, signed-out) | `/goodbye` |
