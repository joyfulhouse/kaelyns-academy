# P6 — COPPA-grade account export + delete, AI provenance, per-learner settings

**Date:** 2026-06-26
**Status:** Plan for review (design only — **no `src/` changes proposed here**)
**Phase:** P6 (child-data / COPPA)
**Spec source of truth:** `docs/specs/2026-06-13-platform-v3-design.md` §8
**Author:** Claude (Opus 4.8, 1M)

> **Scope discipline.** This is a planning document. It changes no code. It also defines
> a **new product surface boundary** (new pages + new server actions) that the team must
> consciously approve before any implementation begins — see [§4 New surface inventory](#4-new-surface-inventory).

---

## 0. The promise we are keeping

The marketing home and spec §8 promise parents:

- §8: *"Parent can export/delete a child profile and all its data."*
- §8: *"COPPA-minded … verifiable parental consent gate, clear data inventory, **retention policy**."*
- §8: *"Content provenance: generated practice items are logged with the prompt/model for audit; a **parent-visible 'what the AI made' trail**."*
- Settings page copy: *"Your child's data is yours."*

Today we partially honor the **per-learner** export/delete. We do **not** honor the
**account-level** guarantee, the **provenance trail**, or the **per-learner settings UI**.
This plan closes those three gaps.

---

## 1. Current state (precise)

### 1.1 What exists today — learner-level export & delete

**Server actions** — `src/app/(parent)/actions.ts`:

| Action | Returns | What it does |
|---|---|---|
| `exportLearnerAction(learnerId)` | `{ ok: true; data: LearnerExport }` \| `{ ok:false; reason: "unauthenticated"\|"not-found"\|"unavailable" }` | Calls `buildLearnerExport(accountId, learnerId, exportedAt)` inside `withAccount`. Returns the JSON to the client; the client makes the download Blob (no server temp files). |
| `deleteLearnerAction(learnerId)` | `{ ok:true }` \| `{ ok:false; reason: … }` | Calls `deleteLearner(accountId, learnerId)`; revalidates `/parent` + `/parent/learners`. |
| `saveLearnerSettingsAction(learnerId, settings)` | `EnrollmentActionResult` | Zod-parses `learnerSettingsSchema`, persists via `saveLearnerSettings`. Owned-by-account enforced. |
| `updateEnrollmentConfigAction(learnerId, slug, config)` | `EnrollmentActionResult` | Per-enrollment `aiPractice`/`band`/`activeUnitKeys`/`dailyGoal`. |

**Store layer** — `src/lib/tutor/store.ts`:

- `buildLearnerExport()` (L645) gathers the owned learner + `enrollment` + `skill_state` + `attempt` rows (all reads, parallel) and shapes them via `shapeLearnerExport`.
- `deleteLearner()` (L708) does a single `DELETE FROM learner WHERE id = ? AND account_id = ?` and **relies on Postgres FK `ON DELETE CASCADE`** to remove `enrollment`, `attempt`, `skill_state` (all three FK `learner.id` with `onDelete: "cascade"` — confirmed in `src/lib/db/schema.ts`). Returns `true`/`false` from the affected-row count. Hard delete; no soft-delete, no tombstone, no audit row.

**Export shape** — `src/lib/tutor/export.ts` (`LearnerExport`): `exportedAt`, `learner{id,displayName,birthMonth}`, `settings`, `enrollments[]{programSlug,status,config}`, `skillState[]{skill,outcome,evidence}`, `attempts[]{activityId,kind,score{stars,correct,total},day,createdAt}`. Deliberately minimized — drops `accountId`, the attempt `response` payload, and `score.skillEvidence`.

**Existing UI:**

- `src/components/parent/LearnerDataControls.tsx` — rendered at the **bottom of the learner-detail page** (`src/app/(parent)/parent/learners/[id]/page.tsx` L127). Two cards: "Export data" (JSON download) and "Delete profile" (inline two-click confirm, no `window.confirm`, redirects to `/parent/learners` on success).
- `src/app/(parent)/parent/settings/SettingsForm.tsx` — a "Your data" section that is **copy only** with the literal TODO comment `{/* P6: data export + account deletion land with account settings */}`.

### 1.2 What exists — per-learner settings (partial)

- `LearnerSettings` (`src/lib/content/config.ts`) = `{ dailyGoal?, aiPractice?, readAloud? }`.
- It **is** persisted per-learner (`learner.settings` jsonb) and **is** server-enforced (the §8 AI kill-switch: `getLearnerSettings` fail-closes to `{aiPractice:false}` on malformed data; `/api/practice` honors it — see MEMORY "AI practice gate: two controls").
- **But the only UI is `/parent/settings`, which hard-codes the _primary_ (first) learner.** `getPrimaryLearnerSettings()` (`src/app/(parent)/data.ts` L187) resolves `learners[0]` only. A parent with 2+ children **cannot** see or change the 2nd child's settings anywhere. Both the page (L10-12) and the form (L22-23) carry explicit "per-learner settings UI lands in a later phase" comments. **This phase is that phase.**

### 1.3 What exists — AI-generated content & its provenance

- `attempt.generated` (boolean, `src/lib/db/schema.ts` L153) marks an attempt as AI-generated practice vs authored content. `attempt.response` (jsonb) may hold the child's response. **That is the entire provenance footprint.**
- The generator (`src/lib/ai/practice.ts`) **knows** the model/route per item — `MODEL_FOR_BAND` / `MODEL_FOR_LANGUAGE` → `TUTOR_FAST`/`TUTOR_RICH` → LiteLLM route (`src/lib/ai/models.ts`) — **but discards it.** `recordAttempt()` (`store.ts` L176) persists `{learnerId, activityId, kind, generated, score, response, day}` and nothing about which model/route/prompt produced the generated activity. **There is no model, no route, no prompt, no provenance table, no generated-at timestamp distinct from `createdAt`.**
- **Narration audio** (`src/lib/audio/`) is **content-addressed, not learner-scoped.** `ttsKey()` = `sha256(normalizedText|voice|speed)`; clips live in a **shared MinIO bucket** keyed by that hash (`store.ts`/`config.ts`), served by the same-origin `/audio/[...path]` proxy. **No audio row references a learner or an account.** Audio is deduplicated content derived from authored/approved text — so it carries **no child PII** and is **out of scope for both export and delete** (deleting a learner must NOT touch shared clips; they belong to no one). The plan states this explicitly so the team does not over-scope deletion.

### 1.4 Tenancy & auth context

- `src/lib/tenancy.ts` — `withAccount(fn)` resolves the Better Auth session per-request and yields `{ accountId, userId }` (today `accountId === userId`; a real `account` table is a future TODO). Every store call is account-scoped through this seam. **This is the single boundary every new action must reuse.**
- `src/lib/auth.ts` — Better Auth, email+password, `minPasswordLength: 8`, `requireEmailVerification: false` (no email transport yet, P4). **There is no current re-authentication / "confirm your password" / fresh-session check anywhere.** This matters for destructive account-level delete (§5.2).
- `src/lib/db/auth-schema.ts` — `user`, `session`, `account` (Better Auth OAuth/credential rows — **note: this `account` is Better Auth's, NOT the tenancy "account"**), `verification`. `session` and `account` both cascade off `user.id`.

### 1.5 The gap, stated plainly

| COPPA-grade requirement | Today | Gap |
|---|---|---|
| Export **one child**'s data | Yes (`exportLearnerAction`) | Minor: omits provenance & a data-inventory manifest |
| Export **the whole account** (all children + parent record + a documented inventory) in one machine-readable bundle | **No** | **Primary gap** |
| Delete **one child** | Yes (hard, cascade) | Minor: no audit/tombstone, no re-auth |
| Delete **the whole account** (parent + all children + sessions + credentials) | **No** | **Primary gap** |
| Provenance: parent-visible "what the AI made" with model/route/when | **No** (only a `generated` flag) | **Primary gap** |
| Per-learner settings UI (2+ children) | **No** (primary learner only) | **Primary gap** |
| Auth re-confirmation on destructive ops | **No** | Risk gap (§7) |
| Retention policy / data inventory doc | **No** | Doc gap (§5.5) |

---

## 2. Goals & non-goals (this phase)

**Goals**

1. Account-level **export**: one JSON bundle = parent record (minimized) + every learner + all per-learner data (enrollments, skill_state, attempts) + provenance + a self-describing **data inventory manifest**.
2. Account-level **delete**: hard delete of the parent `user` and everything that cascades (learners → enrollment/attempt/skill_state; sessions; Better-Auth `account` credential rows), gated by **auth re-confirmation** and an explicit typed confirmation, with a **`deletion_audit`** record written *before* the cascade.
3. **Provenance view**: persist model/route/generated-at on AI-generated attempts and surface a calm, paginated "What the AI made for {child}" trail per learner, plus include provenance in exports.
4. **Per-learner settings UI**: a settings surface scoped to *each* learner (not just the primary), surfacing `settings.aiPractice` (the §8 kill-switch), `dailyGoal`, `readAloud`.
5. A short **retention-policy / data-inventory doc** (`docs/architecture/PRIVACY.md`) the export manifest can point at.

**Non-goals**

- No multi-guardian `account` table (still `accountId === userId`; this plan must not regress that seam).
- No prompt-text capture in v1 provenance (store **model + route + generated-at + kind**; defer raw prompt — see open question Q3). Raw prompts can contain the child's display name → storing them widens the PII surface; we log the *bound* metadata, not the conversation.
- No GDPR DSAR portal, no async/emailed export job (export stays synchronous + client-download while datasets are small — see Q5 for the scale cutover).
- No soft-delete/30-day-undo for accounts in v1 (hard delete + audit row; revisit in Q4).
- Audio clips are **explicitly out of scope** for export and delete (content-addressed, shared, no PII — §1.3).

---

## 3. Design

### 3.1 Account-level export

**Shape** — a new `AccountExport` (pure shaper, mirrors the `export.ts` pattern: caller injects `exportedAt`, no `new Date()` in the pure module):

```ts
interface AccountExport {
  manifest: {
    schemaVersion: 1;            // bump on shape changes
    exportedAt: string;          // ISO, injected by the action
    contents: string[];          // human-readable inventory: ["account","learners","enrollments","skillState","attempts","aiProvenance"]
    notExported: string[];       // honesty: ["narration audio (shared, content-addressed, no PII)","raw AI prompts","passwords"]
    appVersion?: string;         // optional build SHA for support
  };
  account: { id: string; email: string; createdAt: string };  // parent record, minimized — NO password/tokens
  learners: LearnerExport[];     // reuse the existing per-learner shaper, one per child
}
```

**Why reuse `LearnerExport`:** the per-learner shaper is already tested (`export.test.ts`) and minimized. The account export is *"the parent record + an array of the thing we already export."* This keeps one source of truth for "what a child's data looks like" and means the provenance addition (§3.3) lands in `LearnerExport` once and shows up in both exports.

**Store fn** — `buildAccountExport(accountId, exportedAt)`:
1. Load the `user` row (id, email, createdAt) — **never** password/tokens.
2. `listLearners(accountId)`; for each, call the existing `buildLearnerExport` gather (or factor a shared `gatherLearnerData` helper so we do one ownership check per learner, not two).
3. Assemble `{manifest, account, learners}` via the pure `shapeAccountExport`.

**Action** — `exportAccountAction()` (no args; scope is the session): `withAccount` → `buildAccountExport(accountId, new Date().toISOString())` → discriminated result. Client downloads `kaelyns-academy-export.json`.

**Honesty requirement (COPPA "clear data inventory"):** the `manifest.contents` / `notExported` arrays are not decoration — they are the data inventory. A reviewer must be able to diff `manifest.contents` against the actual DB tables that reference a learner/account and see nothing child-bearing is silently omitted. A test asserts this (see §9).

### 3.2 Account-level delete

**Hard vs soft:** v1 = **hard delete** (consistent with the existing learner delete and "delete … always" promise; soft-delete/undo deferred — Q4). One concern: an audit trail must survive the delete, so we write the audit row **first, in/around the same transaction**, keyed by `userId` (not FK-referencing it, so it isn't cascaded away).

**Cascade map (must be verified before writing the delete):**

```
user (parent)                         ← DELETE target
 ├─ learner            (cascade)  → enrollment, attempt, skill_state (cascade)
 ├─ session            (cascade)  ← auth-schema, ON DELETE cascade ✓
 └─ account (BetterAuth cred/oauth)(cascade) ← auth-schema, ON DELETE cascade ✓
publisher.ownerUserId  → onDelete:"set null" (NOT cascade — correct: a published program must not vanish because its author closed their account; ownership nulls out)
deletion_audit         → NEW, keyed by userId, NO FK → survives
```

So a single `DELETE FROM "user" WHERE id = ?` cascades the entire child-data graph + auth rows in one statement. **The plan's job is to confirm this with a written test** (a learner with attempts/skill_state, a session row, an account row → all gone; a `publisher` the user owned → still present with `ownerUserId = NULL`).

**Store fn** — `deleteAccount(accountId)`:
1. Open a transaction.
2. Snapshot counts for the audit (learners, attempts) — cheap `count(*)`.
3. Insert `deletion_audit { userId, deletedAt, learnerCount, attemptCount, requestedBy:"parent" }`.
4. `DELETE FROM "user" WHERE id = accountId` (cascade does the rest).
5. Commit. Return `{ deletedLearners, deletedAttempts }` for the confirmation screen.

**Action** — `deleteAccountAction(input)`:
- **Re-auth gate (§7):** require a fresh credential check. Two viable mechanisms (Q1): (a) re-verify the password via Better Auth before deleting, or (b) require a recently-issued session (re-prompt sign-in). The action takes the proof (e.g. `{ password }`) and verifies through `getAuth()` *before* any delete. Wrong/missing → `{ ok:false, reason:"reauth-failed" }`, nothing deleted.
- **Typed confirmation:** client must send a literal token (e.g. the parent's email, or the word `DELETE`) that the action checks — defense against fat-finger and CSRF-style replays (the action is already same-origin via Better Auth CSRF).
- On success: invalidate the session, return `{ ok:true, summary }`, client redirects to a neutral signed-out confirmation route (e.g. `/goodbye`).

### 3.3 Provenance ("what the AI made")

**Decision: extend `attempt` rather than add a new table** (v1). The provenance is 1:1 with a generated attempt, every generated activity already produces exactly one attempt row, and the existing `(learnerId, generated)` index already supports the read. A separate `ai_generation` table is the v2 move if/when we capture per-item prompts or generations that don't become attempts (Q3).

**Schema additions to `attempt`** (expand-only, all nullable — backward compatible per the deploy rule):

| Column | Type | Notes |
|---|---|---|
| `gen_model` | `text` null | e.g. `tutor-fast` / `tutor-rich` (the logical route name from `models.ts`, **not** a raw provider model id — keeps it stable + non-leaky). |
| `gen_route` | `text` null | LiteLLM route / band-or-language tag, for audit. |
| `gen_at` | `timestamptz` null | When generation happened (may differ from attempt `createdAt`). |

`generated=true` rows get these populated; authored rows leave them null. No backfill needed (old generated rows simply show "model not recorded" in the UI — honest).

**Write path:** `generatePracticeItems` (`practice.ts`) already computes the model; thread `{model, route, generatedAt}` through to the `/api/practice` route → `recordAttempt` input → the insert. (This is the one spot where the boundary widens from "design doc" to "needs a small change to the practice→attempt path"; called out so the implementer scopes it.)

**Read + view:** a new store read `listGeneratedAttempts(accountId, learnerId, {limit, cursor})` (account-scoped, reuses the `attempt_learner_generated_idx`) → a calm, paginated panel on a new **per-learner provenance page** (§4): each row = activity title (resolved via the existing `findActivity`), kind label, model/route, "made on {date}", and the child's star result. Parent-readable, audit-honest, no raw model text shown.

**Export:** add `aiProvenance[]` to `LearnerExport` (and therefore the account export): `{activityId, kind, model, route, generatedAt}` for generated attempts. One shaper change, covered by both export tests.

### 3.4 Per-learner settings UI

- New **per-learner settings page** under the learner route (`/parent/learners/[id]/settings`) — or a settings section on the existing learner-detail page (Q2: dedicated page preferred for focus + a stable deep-link the provenance/data controls can live beside).
- Reuses the **existing** `saveLearnerSettingsAction(learnerId, settings)` and `learnerSettingsSchema` — **no new action needed for the write.** The gap is purely a *read scoped to the requested learner* + a form bound to that learner.
- New read helper `getLearnerSettingsForParent(learnerId)` (account-scoped) — the per-learner analog of `getPrimaryLearnerSettings`.
- The `/parent/settings` page stays as the **account-wide** page; it gains the account export/delete controls (§3.1/§3.2) and either (a) links out to each learner's settings, or (b) keeps the primary-learner shortcut but clearly labeled. The "per-learner settings UI lands in a later phase" comments in `settings/page.tsx` and `SettingsForm.tsx` get removed.
- `SettingsForm.tsx` is refactored to accept any `{learnerId, initialSettings}` (it already does — it takes `primaryLearnerId`; generalize the prop name) so it serves both the account page's primary shortcut and the per-learner page.

### 3.5 Where it all lives in the IA

- **`/parent/settings`** (existing, account-scoped): grows a "Privacy & your data" section → **Export all data** (account) + **Delete account** (re-auth gated). Replaces the dead TODO block.
- **`/parent/learners/[id]/settings`** (new): per-learner `aiPractice`/`dailyGoal`/`readAloud` + the existing per-learner Export/Delete controls move here from the bottom of the detail page (or stay; Q2).
- **`/parent/learners/[id]/activity`** (new) *(naming Q6)*: the provenance "what the AI made" trail for that child.
- Nav (`DashboardShellParent.tsx`): no new top-level item required; account data controls live inside the existing **Settings** tab. (Optional: rename "Settings" → "Settings & privacy" — Q7.)

---

## 4. New surface inventory

> **This is the new-surface boundary the team must consciously approve.** Everything below is *net-new product surface* (pages a parent can navigate to, or new server actions callable from the client). Approve this list before implementation.

### 4.1 New pages / routes (`page.tsx`)

| Route | File | Purpose | Auth |
|---|---|---|---|
| `/parent/learners/[id]/settings` | `src/app/(parent)/parent/learners/[id]/settings/page.tsx` | Per-learner settings (aiPractice/dailyGoal/readAloud) | parent layout gate |
| `/parent/learners/[id]/activity` *(name TBD, Q6)* | `src/app/(parent)/parent/learners/[id]/activity/page.tsx` | "What the AI made" provenance trail for one child | parent layout gate |
| `/goodbye` (or `/account-deleted`) | `src/app/goodbye/page.tsx` | Neutral signed-out post-account-deletion confirmation | **public** (session is gone) |

Each new page also needs the calm-state siblings already standard in this repo: `loading.tsx` (and the learner subtree's `not-found`/`error` are inherited from the parent group).

### 4.2 New server actions (`src/app/(parent)/actions.ts`)

| Action | Signature | Destructive? | Re-auth? |
|---|---|---|---|
| `exportAccountAction` | `() => Promise<ExportAccountResult>` | no | no |
| `deleteAccountAction` | `({ password?/confirmToken }) => Promise<DeleteAccountResult>` | **YES (irreversible)** | **YES** |

**No new action for per-learner settings** (reuses `saveLearnerSettingsAction`) or for provenance (read-only via a server-component data helper). Keeping the new *action* count to **two** — and only one destructive — is deliberate: fewer destructive entry points = smaller attack/mistake surface.

### 4.3 New components (client)

| Component | File | Purpose |
|---|---|---|
| `AccountDataControls` | `src/components/parent/AccountDataControls.tsx` | Export-all + delete-account cards; delete card includes the re-auth/typed-confirm flow (extends the `LearnerDataControls` two-click pattern). |
| `AiProvenanceList` | `src/components/parent/AiProvenanceList.tsx` | Paginated provenance rows. |
| (refactor) `SettingsForm` | existing | Generalize `primaryLearnerId` → `learnerId` so it serves the per-learner page. |

---

## 5. Files to change / create (list — not edited here)

### 5.1 Create

- `src/app/(parent)/parent/learners/[id]/settings/page.tsx` + `loading.tsx`
- `src/app/(parent)/parent/learners/[id]/activity/page.tsx` + `loading.tsx`  *(provenance)*
- `src/app/goodbye/page.tsx`
- `src/components/parent/AccountDataControls.tsx`
- `src/components/parent/AiProvenanceList.tsx`
- `src/lib/tutor/account-export.ts` — pure `shapeAccountExport` + `AccountExport` type (mirror of `export.ts`)
- `src/lib/tutor/account-export.test.ts`, plus tests for the new store fns
- `docs/architecture/PRIVACY.md` — retention policy + data inventory (the manifest references it)
- New migration in `drizzle/` (see §6)

### 5.2 Change

- `src/app/(parent)/actions.ts` — add `exportAccountAction`, `deleteAccountAction` (+ result types).
- `src/lib/tutor/store.ts` — add `buildAccountExport`, `deleteAccount`, `listGeneratedAttempts`, `getLearnerSettingsForParent`; thread provenance fields into `recordAttempt`'s insert + `RecordAttemptInput`.
- `src/lib/tutor/export.ts` — add `aiProvenance[]` to `LearnerExport` + `shapeLearnerExport`; extend `ShapeInput`.
- `src/lib/db/schema.ts` — add `gen_model`/`gen_route`/`gen_at` to `attempt`; add `deletion_audit` table.
- `src/lib/ai/practice.ts` + `src/app/api/practice/route.ts` — surface `{model, route, generatedAt}` from the generator to the attempt write.
- `src/app/(parent)/data.ts` — add `getLearnerSettingsForParent`, a provenance read helper, account-export read if any page needs it.
- `src/app/(parent)/parent/settings/page.tsx` + `SettingsForm.tsx` — drop the "later phase" comments; mount `AccountDataControls`; generalize the form prop.
- `src/app/(parent)/parent/learners/[id]/page.tsx` — link to the new per-learner settings + activity pages (and possibly relocate `LearnerDataControls`).
- `src/components/parent/DashboardShellParent.tsx` — optional label tweak (Q7).
- `src/lib/auth.ts` — *iff* re-auth uses a Better Auth capability that needs configuration (e.g. session freshness) — confirm during impl (Q1).

### 5.3 Auth re-confirmation note

Better Auth has no re-auth wired today. The implementer must confirm the exact mechanism (verify-password endpoint vs. fresh-session requirement) against the installed Better Auth version **before** building `deleteAccountAction`; the `better-auth` skill is available for this. Do **not** hand-roll password comparison — go through Better Auth.

---

## 6. Migration needs

One expand-only, backward-compatible migration (`bun run db:generate` → review SQL → `drizzle/00xx_*.sql`):

1. `ALTER TABLE attempt ADD COLUMN gen_model text, ADD COLUMN gen_route text, ADD COLUMN gen_at timestamptz;` — all nullable, no default, no backfill. Old rows + authored rows stay null. Safe under the migrate-before-traffic rule.
2. `CREATE TABLE deletion_audit (id text pk, user_id text not null, deleted_at timestamptz not null default now(), learner_count int not null default 0, attempt_count int not null default 0, requested_by text not null default 'parent');` — **no FK** to `user` (must survive the delete it records). Optionally index `user_id`.

**Reminder (MEMORY: deploy pipeline):** migrations do **not** auto-run in this homelab pipeline — they are applied manually (`kubectl exec … psql -U postgres`), and `db.sh` peer-auth fails locally. The plan/PR must include the apply step and the migrate-before-traffic ordering, or the new columns/table won't exist when the new code ships.

No index drops, no column renames, no type changes → no destructive DDL.

---

## 7. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Irreversible account delete** wipes a real family's data | High | Re-auth gate + typed confirmation + `deletion_audit` row written before cascade + neutral confirmation screen. v1 is hard-delete by design; if undo is wanted, see Q4. |
| **Destructive op without auth re-confirmation** (current actions have none) | High | `deleteAccountAction` verifies a fresh credential through Better Auth *before* any write; refuse on failure. Consider the same re-auth for the existing `deleteLearnerAction` (currently only two-click) — Q8. |
| **Partial-export gap** — a child-bearing table is added later but not added to the export | High (COPPA) | The `manifest.contents`/`notExported` inventory + a test that asserts every table FK-referencing `learner`/`user` is either in `contents` or explicitly in `notExported` (fails CI when a new table is added without a decision). This is the single most important safeguard. |
| **Cascade surprise** — a table doesn't cascade (orphans) or cascades something it shouldn't (e.g. published programs vanish) | High | Written cascade test (§9): learner-graph + session + account gone; `publisher.ownerUserId` nulled, program survives. `publisher` FK is `set null` by design — verify it stays that way. |
| **Provenance widens child PII** if raw prompts are stored | Med | v1 stores only bound metadata (model/route/at), never raw prompt text (which can embed the display name). Q3 governs any future prompt capture. |
| **Audio over-scoped into delete** (deleting shared, content-addressed clips that belong to no learner) | Med | Explicitly out of scope (§1.3); delete touches only `learner`-cascaded rows + auth rows. State this in the PR so a reviewer doesn't "helpfully" add audio cleanup. |
| **Synchronous export OOM / timeout** at scale (all attempts in memory) | Low now, Med later | Fine for a single household (Q5 sets the cutover to a streamed/async job when an account exceeds N attempts). |
| **Export JSON leaks via download/history** | Low | Client Blob download (no server temp file, current pattern); filename has no child name for the account bundle. Don't put child names in any new `document.title` (MEMORY: child-PII-not-in-document-title) — provenance/settings pages keep static titles like the detail page. |
| **`accountId === userId` assumption** baked into new code | Med | New code routes through `withAccount` and uses `accountId` exactly as the existing store does; the account export's parent record reads the `user` row by `accountId` — when a real `account` table lands, that one read changes, same as the existing seam TODO. |

---

## 8. Phased rollout

Land behind the natural seams; each step is independently shippable and reviewable.

- **P6.1 — Provenance capture (no UI).** Migration (attempt columns) + thread model/route/at through practice→`recordAttempt`. Pure plumbing; old rows null. Ship, apply migration, verify new generated attempts populate the columns.
- **P6.2 — Per-learner settings UI.** New `/parent/learners/[id]/settings` page reusing the existing action. Removes the "later phase" debt. Lowest risk, immediate user value (2+-child families).
- **P6.3 — Account export.** `account-export.ts` + `buildAccountExport` + `exportAccountAction` + `AccountDataControls` (export card only) on `/parent/settings`. Add `aiProvenance` to `LearnerExport`. Read-only, non-destructive.
- **P6.4 — Provenance view.** `/parent/learners/[id]/activity` + `AiProvenanceList` + `listGeneratedAttempts`. Read-only.
- **P6.5 — Account delete.** `deletion_audit` migration + `deleteAccount` + `deleteAccountAction` with re-auth + `/goodbye`. **Gated last** (most dangerous), after the cascade test and re-auth mechanism are proven. Possibly its own dedicated review pass.
- **P6.6 — Docs.** `docs/architecture/PRIVACY.md` (retention + inventory); wire `manifest` to reference it; remove stale TODO comments.

Each phase runs the standard gate: `bun run lint && bun run typecheck && bun run test && bun run build`, then merge-ready review, then GitOps deploy + canary. Migrations applied manually before the dependent code takes traffic.

## 9. Test plan

**Pure shapers (no DB, the repo's existing style):**
- `account-export.test.ts`: shaping assembles `{manifest, account, learners}`; `account` carries **no** password/token; `manifest.contents`/`notExported` are populated; `schemaVersion` present.
- Extend `export.test.ts`: `aiProvenance[]` populated from generated attempts, empty when none; authored attempts contribute no provenance.

**Store (DB-backed, mirror `store.test.ts`):**
- `buildAccountExport`: returns all learners for the account, **excludes** another account's learners (tenancy); parent record minimized.
- `deleteAccount` **cascade test** (the load-bearing one): seed account + 2 learners (with enrollments, attempts, skill_state) + a session row + a Better-Auth `account` row + a `publisher` owned by the user. After delete: learners/enrollments/attempts/skill_state/session/auth-account all **gone**; `publisher` **present** with `ownerUserId = NULL`; `deletion_audit` row exists with correct counts.
- `deleteAccount` writes the audit row **even though** the user is deleted (no FK → survives).
- `listGeneratedAttempts`: returns only `generated=true`, account-scoped, paginates, newest-first.
- `recordAttempt` persists `gen_model/gen_route/gen_at` when provided; leaves null otherwise.
- `getLearnerSettingsForParent`: returns the *requested* learner's settings (not the primary), null/unowned → null.

**Inventory guard (COPPA safeguard):**
- A test enumerating tables that FK-reference `learner` or `user` and asserting each appears in the export `manifest.contents` **or** `manifest.notExported`. Adding a new child-bearing table without updating the manifest **fails CI**.

**Action layer:**
- `exportAccountAction`: unauthenticated → `{reason:"unauthenticated"}`; happy path returns the bundle.
- `deleteAccountAction`: wrong/missing re-auth proof → `{reason:"reauth-failed"}`, **nothing deleted** (assert rows still present); wrong typed token → refused; happy path deletes + returns summary + session invalidated.

**Component (where the repo tests components, e.g. `SettingsForm.test.tsx`):**
- `AccountDataControls`: delete requires the confirm token before the action is callable; error states render calm (role="alert"), never a stack.
- Generalized `SettingsForm`: a stored `aiPractice:false` for a *non-primary* learner renders OFF and stays OFF (the §8 stickiness invariant, now per-learner).

**Manual / canary:** export a 2-child account, eyeball the bundle + manifest; delete a throwaway account, confirm `/goodbye` + that re-login fails; confirm `/audio` clips are untouched after a delete.

## 10. Open questions

1. **Re-auth mechanism** for `deleteAccountAction`: re-verify password via Better Auth, vs. require a fresh session (re-prompt sign-in)? (Needs a check against the installed Better Auth version; `better-auth` skill available.) **Recommendation: password re-verify**, since email verification is off and sessions are long-lived.
2. **Per-learner settings: dedicated page vs. section** on the existing detail page? **Recommendation: dedicated `/parent/learners/[id]/settings`** (focus + stable deep-link; lets the data controls + provenance link cluster there).
3. **Provenance depth:** metadata-only (model/route/at) in v1, or also capture the **raw prompt/generation** for true audit? Raw prompts can embed the child's display name (PII surface ↑) and need their own retention rule. **Recommendation: metadata-only v1**, add an `ai_generation` table later if real audit is required.
4. **Account delete: hard vs. soft (undo window)?** Spec says "delete … always"; hard is simplest and honest. A 30-day soft-delete is friendlier but means child data persists after a parent asked to delete it — arguably *worse* for COPPA. **Recommendation: hard delete + audit row.**
5. **Export scale cutover:** at what attempt-count does synchronous in-memory export become a streamed/async job? **Recommendation: fine now; revisit past ~10k attempts/account.**
6. **Provenance route name:** `/parent/learners/[id]/activity` vs `/ai-activity` vs a tab on the detail page? (Avoid implying it's the child's *activity feed* generically.)
7. **Nav label:** rename "Settings" → "Settings & privacy" to advertise the export/delete controls?
8. **Should the existing `deleteLearnerAction` also get re-auth?** Today it's two-click only. Deleting one child is also irreversible. **Recommendation: yes, align it with the account-delete bar** (or at least a typed confirm), but scope as a fast-follow so it doesn't block P6.
9. **`/api/practice` → attempt provenance:** confirm the route is the single write path for generated attempts (it is, per `recordAttempt` callers) so threading model/route there is sufficient and there's no second generation entry point to miss.

---

## Appendix — key code references (read before implementing)

- Existing learner export/delete actions: `src/app/(parent)/actions.ts` L454-522
- Export shaper + type: `src/lib/tutor/export.ts`
- Store export/delete/settings: `src/lib/tutor/store.ts` L599-717 (settings/export/delete), L176-230 (`recordAttempt`)
- Schema (cascades): `src/lib/db/schema.ts` L105-201 (learner/enrollment/attempt/skill_state); auth cascades `src/lib/db/auth-schema.ts` L25-66
- Tenancy seam: `src/lib/tenancy.ts`
- Auth config (re-auth surface): `src/lib/auth.ts`
- Primary-only settings read (the gap): `src/app/(parent)/data.ts` L182-195
- Settings UI + dead TODO: `src/app/(parent)/parent/settings/SettingsForm.tsx` L216-224
- Existing data controls (pattern to extend): `src/components/parent/LearnerDataControls.tsx`
- Provenance source (model known, discarded): `src/lib/ai/practice.ts` L385-443; routes `src/lib/ai/models.ts`
- Audio is content-addressed/shared (out of scope): `src/lib/audio/ttsKey.ts`, `src/lib/audio/store.ts`, `src/app/audio/[...path]/route.ts`
- Spec §8: `docs/specs/2026-06-13-platform-v3-design.md` L153-161
