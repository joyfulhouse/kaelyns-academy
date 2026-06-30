# Polish — Simplification & Maintainability (shared surfaces)

**Date:** 2026-06-30 · **Focus:** simplification, maintainability, "create shared surfaces where possible" (DRY).
**Mode:** `/polish` full autonomous run → parallel worktrees → merge-ready gate → sequential merge → coalesced GitOps deploy + canary.

This is a **refinement pass over existing surfaces only** (Scope Boundary). No new routes, HTTP methods, pages, path segments, or Server Actions. Every item below extracts/consolidates a *shared* helper, hook, or component, or simplifies in place. New shared files (hooks/components/utils) are extractions of existing duplicated logic — not new product surface.

Source: three parallel Explore agents (pages/routes, components/UI, lib/backend) + first-hand reads. No correctness violations were found (no module-top-level `getDb()`/`getAuth()`, no raw provider SDKs, §8 fail-closed gates intact). Findings are all "extract / adopt the shared surface / simplify."

## Worktree partition (disjoint file sets — no two worktrees touch the same file)

### WT-A — Activity Player shared surfaces  ·  branch `refactor/activities-shared-player`
**Files (all under `src/activities/`):** `_shared/` (new files + `ActivityChrome.tsx`), all 8 `*/Player.tsx`.
Extract the per-Player boilerplate the 8 Players copy:
- `useSpeakOnce(speak, text)` — auto-speak-instruction-on-mount ref (×8). Audio sibling for the 2 audio Players.
- `useManagedTimeout()` → `{ set, clear }` with unmount cleanup (×6).
- `useWrongShake()` → `{ wrong, trigger, shakeProps }` + shared `SHAKE_ANIM` const (×3 + variant).
- `<ChoiceGrid>` + `useMultipleChoice()` — the multiple-choice grid implemented twice (lang-listen-match, lang-symbol-intro).
- `shuffle<T>(items, seed)` → `_shared/shuffle.ts` (+ unit test) — verbatim dup (phonics-wordbuild, sightword-game).
- `useActivity(schema, config)` (memoised parse) + a completion gate — `useMemo(schema.parse(config))` and the `if (done) → <RewardOverlay>` early-return (×8).
- `SpeakerButton` accept an `onClick`/minimal speaker so audio-based Players reuse it (ActivityChrome.tsx); `<PlayerControls>` row; `<ProgressHint>` aria-live region.
**Commits:** one per extracted hook/component + a "refactor all Players onto shared surfaces" commit. Unit-test the pure helpers (shuffle, SHAKE_ANIM, useManagedTimeout behavior).

### WT-B — Content store + admin authoring DRY  ·  branch `refactor/content-store-admin-dry`
**Files:** `src/lib/content/store.ts`, `src/content/index.ts`, `src/content/activity-configs.ts`, `src/lib/admin/editor-model.ts`, `src/app/(admin)/admin/actions.ts` (+ new helper file under `src/content/` or `src/lib/content/`).
- `rowsToEditableUnits(units, lessons, activities)` — the identical row→`EditableUnit[]` mapper (`store.ts` `loadVersionForEdit` & `sourceRowsToEditable`).
- `loadVersionTreeRows(versionId)` — the version→units→lessons→activities fetch-with-empty-guards walk (×2 in store.ts).
- `byOrderKey` exported comparator (+ test) — `(a,b)=>a.orderKey.localeCompare(b.orderKey)` inlined 9×.
- `validateActivityConfig(kind, config)` — the `ACTIVITY_CONFIG_SCHEMAS[kind]` lookup + safeParse + first-issue dance (×3: store.ts assemble & save loop, editor-model `validateConfigJson`). Home: `activity-configs.ts` or a new `content/validate.ts`.
- `versionColumns(meta)` — the metadata→column object (×3 in store.ts).
- `forEachActivity(program, cb)` / `flatActivities(program)` in `src/content/index.ts` — collapse the 5 near-identical tree walkers onto it.
- Remove dead exports: `findProgramByActivityId` (sync, `content/index.ts`).
- Admin actions: `withAdminAction(context, fn)` wrapper (gate + final `catch→mapError`) + `idParam(value, message)` validator (7× gate, 5× id-parse); have admin `mapError` delegate the `UnauthenticatedError`/`unavailable` tail to `mapActionError` and keep only its domain branches.
**Preserve:** all exported store/index signatures and admin action result shapes (the UI switches on `reason` literals). Activity-key uniqueness invariant unchanged.

### WT-C — Tutor + parent data-access DRY  ·  branch `refactor/tutor-parent-data-dry`
**Files:** `src/lib/tutor/store.ts`, `src/lib/tutor/mastery.ts`, `src/app/(parent)/data.ts` (+ new helper under `src/lib/tutor/`).
- `withOwnedLearner(accountId, learnerId, fn, fallback)` — the `getLearner` owned-gate repeated ~14× (pass per-call fallback: `[]`/`{}`/`null`/counts). **Fail-closed behavior unchanged.**
- `parseJsonbFailClosed(schema, raw, context)` — `parseEnrollmentConfig`/`parseLearnerSettings` are identical but for schema+log; both **must keep returning `{ aiPractice: false }` on failure** (a §8 gate). Drop the trivial `validate*` wrappers in favor of `schema.parse`.
- `enrollmentKey(learnerId, slug)` → the `and(eq(...),eq(...))` clause (×6).
- `resolveActivityTitle(activityId, kind, program?)` — shared by `toActivityRow` & `provenanceTitle` in data.ts.
- `buildLearnerCards(...)` — the duplicated LearnerCard build in `listLearnerCards` & `getOverview`.
- Remove dead export `isAttempted` (`mastery.ts`).
**Preserve (CRITICAL — WT-G imports these from data.ts):** keep `export function avatarInitial`, the `ActivityRow` interface, and the public signatures of `listLearnerCards`/`getOverview`/`getLearnerDetail` etc. Internal refactor only.

### WT-D — AI/audio + scripts plumbing  ·  branch `refactor/ai-audio-scripts-plumbing`
**Files:** `src/lib/ai/practice.ts`, `src/lib/ai/report.ts`, new `src/lib/ai/prompt-rules.ts`, `src/lib/audio/{narration,kokoro,phonemize,store}.ts`, `src/lib/concurrency.ts`, `src/app/api/tts/route.ts`, `scripts/{migrate,seed-admin-roles,grant-admin}.ts`, new `scripts/lib/cli-db.ts`. (Do **not** edit `src/lib/ai/models.ts`.)
- `src/lib/ai/prompt-rules.ts` — single home for `UNTRUSTED_DATA_RULE` (defined twice with drift) + the shared §8 safety lines; each builder composes from it. **This is child-safety boilerplate — exact wording must be the union of current rules; never weaken a rule.**
- `dedupeInflight(map, key, () => promise)` in `concurrency.ts` — the inflight-collapse Map+try/finally (narration.ts, api/tts/route.ts).
- `timedFetch(url, init, ms)` / `kokoroBase()` — base-URL trim + `AbortSignal.timeout` fetch (kokoro.ts, phonemize.ts, audio/store.ts).
- `scripts/lib/cli-db.ts` (`openCliDb()` + `runCli(fn)`) — the raw-postgres CLI bootstrap (timeouts, `DATABASE_URL` guard, `postgres({max:1,...})`, end/exit envelope) repeated in migrate/seed-admin/grant-admin. **`migrate.ts` must keep its advisory-lock + fail-closed baseline guard byte-for-byte** (it runs in the CI E2E-gate migrator image and the deploy initContainer).

### WT-E — Route boundary shells DRY  ·  branch `refactor/route-boundary-shells`
**Files:** the error/not-found/loading boundaries + new shared components under a new `src/components/boundaries/` dir.
- Adult `RouteErrorPanel({title,body,reset,digest})` + `NotFoundPanel(...)` — `(admin)/admin/{error,not-found}.tsx` ≡ `(parent)/parent/{error,not-found}.tsx` (each keeps its `"use client"` + `useRouteError(context)` + copy).
- Kid error/not-found panels — `(learner)/learn/{error,not-found}.tsx` ≡ root `src/app/{error,not-found}.tsx` (share scaffold; pass `surface`/`size`/copy; preserve each sr-only announcement & button order).
- `KidLoadingShell({ariaLabel,message,mood,children})` — the 4 `(learner)/learn/**/loading.tsx` duplicate ~22 verbatim header lines.
- Loading-skeleton quick win: collapse `(parent)/parent/loading.tsx` ≡ `(parent)/parent/curriculum/loading.tsx` with small `SkeletonBar`/`SkeletonCardGrid` primitives (apply to the other parent/admin loaders only where trivially clean).
Leave `global-error.tsx` alone (renders its own `<html>`). Do **not** touch `AppShellKid.tsx` (defer the shared-header extraction).

### WT-F — Form action plumbing  ·  branch `refactor/form-action-plumbing`
**Files:** new `src/components/ui/StatusMessage.tsx`, new `src/lib/hooks/useAsyncAction.ts`, and the form components: `src/components/parent/{AddChildForm,EnrollmentConfigForm,AssignProgramControl,CurriculumPanel,AccountDataControls,LearnerDataControls}.tsx`, `src/components/admin/{CreateProgramForm,ProgramLifecycleControls}.tsx`, `src/components/admin/editor/ProgramEditor.tsx`, `src/app/(parent)/parent/settings/SettingsForm.tsx`, `src/app/(auth)/AuthForm.tsx`.
- `<StatusMessage tone="success|error">` — the success/error badge (`inline-flex items-center gap-1.5 …` + `CheckCircleIcon`/`WarningCircleIcon`) duplicated ~26×.
- `useAsyncAction()` → `{ run, pending, error, succeeded }` — the `useTransition` + discriminated state + `startTransition(async()=>{try…result.ok…catch})` machine reimplemented ~12×. **Preserve each call site's exact user-facing copy and success/error transitions.** If a component's state shape is too divergent to fit cleanly, leave it and note it (don't force it).
- While in `CurriculumPanel.tsx`: replace its hand-rolled empty state with the existing `<EmptyState>` primitive.
Static Tailwind class maps only. Phosphor icons only.

### WT-G — Site constants + page scaffold  ·  branch `refactor/site-constants-page-scaffold`
**Files:** new `src/lib/site.ts`; `src/app/{robots.ts,sitemap.ts,layout.tsx,page.tsx,manifest.ts,opengraph-image.tsx}`; parent/admin/learner **pages** (not their forms/boundaries): `src/app/(parent)/parent/{page.tsx,learners/[id]/page.tsx,curriculum/[slug]/page.tsx}` + `learners/[id]/{settings,activity}/page.tsx`, `src/app/(admin)/admin/{page.tsx,programs/[id]/page.tsx,programs/[id]/edit/page.tsx}`, `src/app/(learner)/learn/{[programSlug]/page.tsx,[programSlug]/[unitId]/page.tsx,[programSlug]/[unitId]/[activityId]/page.tsx}`; new `src/components/ui/{BackLink,AvatarBadge}.tsx` + a shared activity-row item.
- `src/lib/site.ts` — `SITE_ORIGIN` + `SITE_DESCRIPTION`; replace the `https://kaelyns.academy`/`BASE_URL`/`SITE_URL` dups (robots, sitemap, layout, page ×5 in STRUCTURED_DATA) and the duplicated description.
- `<BackLink href label icon?>` (×6) · `<AvatarBadge>` (×3) — **AvatarBadge must be client-safe: do NOT import `@/app/(parent)/data`; take `name`/`initial` as a prop (RSC pages already compute `avatarInitial`).** · shared activity-row item (`import type { ActivityRow }` is fine — type-only).
- Adopt `<EmptyState>` in `(admin)/admin/page.tsx` & `(parent)/parent/learners/[id]/page.tsx`; adopt `<PageHeader>` eyebrow+title in `curriculum/[slug]/page.tsx`.
- `studioTitle(...)` helper for the 3 learner-page `generateMetadata`.
- Remove the unused `type OverviewData` import in `parent/page.tsx`.

## Deferred (out of scope — new-surface-free but bigger than this pass, or file-overlap with a chosen worktree)
- **Content zod single-source** (drizzle-zod / `z.infer` so editable schemas drive store types) — type-derivation risk; needs its own slice.
- **`editor-model.ts` 4th field-map copy** + **admin editor field DRY** (`SortableCardShell`, `ControlledTextField`, `useSortableList`) — overlaps WT-F (`ProgramEditor.tsx`); do after WT-F lands.
- **Parent data-control cards** (`ExportDataCard`, `ConfirmDangerCard`/`useTwoClickConfirm`) — overlaps WT-F files (Account/Learner DataControls, ProgramLifecycleControls).
- **In-app kid message screens** (`ActivityHost`/`StudioHome`/`UnitView` → reuse WT-E's KidMessageScreen), `BigStar` STAR_PATH share, unify the two `NotAssigned`, `KidLoading` — hot client components; sequence after WT-E.
- **`KID_POP` kid-pop class const / `<KidCard>`** — cross-cutting (Button.tsx + Players + learner shell); coordinate as its own pass.
- **One speech layer** (`speakViaSynth`/support-check dedup across `learner/speak.ts` + `_shared/useSpeech.ts`) — crosses the learner/activities boundary.
- **Reward/sparkle consolidation** (RewardOverlay vs ActivityHost RewardScreen; two sparkle glyphs).
- **Full loading-skeleton primitive kit** (beyond the parent/curriculum quick win); **shared kid header** between AppShellKid and the kid loaders.
- **Seed activity-key shared checker** (D2), **generate-audio fetch dedup** (D3, dev-only), **`retryAfterHeaders`** (api minor).
- **Unified program-tree mapping module** (one canonical intermediate + thin adapters across the ~5 tree shapes) — architectural; dedicated slice.

## Execution
Parallel worktree implement agents (typecheck gate) → per-branch ship-review agents (full merge-ready gate: typecheck+lint+build+test, knip[not wired→clean+note], opus+codex required / gemini advisory, simplifier, impeccable on frontend-touching branches, docs) → PRs → **sequential merge with local build-gate between each** → the Forgejo `*/15` cron coalesces the merges into one E2E-gated build+deploy → ArgoCD sync → **`/api/health` canary (200) + Sentry check**. Post-polish report to `docs/claude/`.
