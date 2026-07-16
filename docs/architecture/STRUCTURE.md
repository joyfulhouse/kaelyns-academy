# Directory Structure

Current as of P6 (content marketplace + PWA landed). A navigable map of the tree and what
each area is responsible for — not an exhaustive file list (use `find src` for that). Update
the relevant section when a subsystem's shape changes.

```
kaelyns-academy/
├── src/
│   ├── app/                              # Next.js 16 App Router (RSC + Server Actions)
│   │   ├── layout.tsx                    # root layout: fonts (Fraunces/Lexend), metadata, SerwistProvider
│   │   ├── page.tsx                      # marketing home (JSON-LD, OG, skip-link) — statically prerendered
│   │   ├── globals.css                   # Tailwind v4 + Wonder Studio tokens (OKLCH), :focus-visible ring
│   │   ├── error.tsx / global-error.tsx / not-found.tsx   # root boundaries (captureNonCritical + reset)
│   │   │                                 # ── metadata file-conventions (co-located) ──
│   │   ├── opengraph-image.tsx           # branded 1200×630 social card (next/og, build-time)
│   │   ├── icon.svg / apple-icon.png     # app icons
│   │   ├── manifest.ts                   # PWA web manifest
│   │   ├── robots.ts / sitemap.ts        # crawl directives + sitemap (Disallow /admin, /parent, /api, /learn/)
│   │   ├── sw.ts                         # Serwist service-worker source (precache + runtime cacheRules)
│   │   ├── (auth)/                       # sign-in / sign-up (AuthForm — client, Field-validated)
│   │   ├── (learner)/learn/…             # kid surface: program → unit → activity (version-pinned SSR)
│   │   │                                 #   + loading/error/not-found shells in the kid voice
│   │   ├── (parent)/parent/…             # parent dashboard: learners, curriculum, settings, actions.ts
│   │   │                                 #   (force-dynamic; withAccount-scoped; +error/not-found/loading)
│   │   │                                 #   learners/[id]/{settings,activity}: per-learner §8 settings + AI provenance trail (P6)
│   │   ├── (admin)/admin/…               # authoring studio: programs/[id]/edit (requireAdmin allowlist)
│   │   ├── goodbye/                      # public post-account-deletion confirmation (no session; P6)
│   │   ├── ~offline/                     # PWA offline fallback page
│   │   ├── audio/[...path]/route.ts      # audio proxy to object storage (SSRF-guarded, IPv4-parsed)
│   │   ├── serwist/[path]/route.ts       # serves the built service-worker assets
│   │   └── api/
│   │       ├── health/route.ts           # schema-drift canary — 200 ok / 503 drift|down (Sentry-throttled)
│   │       ├── practice/route.ts         # §8 AI-practice gate (fail-CLOSED; dual flow anon/account)
│   │       ├── tts/route.ts              # bounded TTS synth + object-store write-through + in-flight dedup
│   │       └── auth/[...all]/route.ts    # Better Auth handler (lazy, per-request — build-safe)
│   │
│   ├── lib/                              # framework-agnostic logic (lazy service factories only)
│   │   ├── env.ts / capture.ts / cn.ts / concurrency.ts / request-ip.ts / site.ts   # primitives
│   │   │                                 #   (concurrency: mapWithConcurrency + dedupeInflight;
│   │   │                                 #    site: SITE_ORIGIN/SITE_DESCRIPTION/studioTitle — single metadata source)
│   │   ├── auth.ts / auth-client.ts      # lazy getAuth() (Better Auth) + browser client
│   │   ├── tenancy.ts                    # withAccount/requireAccount/getAccountOrNull — account scoping seam
│   │   ├── admin.ts / admin/             # admin.ts: requireAdmin() allowlist gate (+ stale-session defense);
│   │   │                                 #   admin/: editor-model.ts, action-helpers.ts (withAdminAction + idParam)
│   │   ├── rate-limit.ts                 # per-instance fixed-window limiter (denial-of-wallet defense)
│   │   ├── parent-views.ts / status-display.ts   # view-model helpers
│   │   ├── actions/results.ts            # shared server-action result helpers: parseInput (zod→{reason:invalid})
│   │   │                                 #   + mapActionError (UnauthenticatedError→unauthenticated, else capture+unavailable)
│   │   ├── api/                          # shared route-handler helpers: respond.ts (jsonError envelope),
│   │   │                                 #   http.ts (readJsonBody: content-length guard + parse), rate.ts (resolveRateLimit key/policy)
│   │   ├── hooks/                        # useRouteError (error-boundary effect, captureNonCritical once),
│   │   │                                 #   useAsyncAction (server-action run/pending/error/succeeded machine)
│   │   ├── ai/                           # ALL model access — models.ts = LiteLLM gateway (timeout/abort/
│   │   │                                 #   validate); practice.ts (bounded gen), report.ts, world-language-config;
│   │   │                                 #   prompt-rules.ts (single source for the §8 prompt safety rules)
│   │   ├── audio/                        # Kokoro TTS: kokoro/phonemes/phonemize/narration/spokenFields/
│   │   │                                 #   store/ttsKey/config (kokoro.ts: kokoroBase + timedFetch shared client)
│   │   ├── content/                      # repository.ts (assemble/resolve programs), store.ts (CRUD +
│   │   │                                 #   draft/publish/archive lifecycle; byOrderKey/loadVersionTreeRows/
│   │   │                                 #   rowsToEditableUnits/versionColumns helpers), config.ts, validate.ts
│   │   │                                 #   (validateActivityConfig) — version-pin resolution
│   │   ├── tutor/                        # store.ts (enrollment/attempt/skill_state DB + §8 gate reads +
│   │   │                                 #   buildAccountExport/deleteAccount/listGeneratedAttempts), enrollment,
│   │   │                                 #   mastery, recommend, export + account-export (COPPA export/delete shapers);
│   │   │                                 #   scope.ts (withOwnedLearner gate), jsonb.ts (parseJsonbFailClosed, §8 fail-closed)
│   │   ├── pwa/                          # cacheRules, precache, iosHint (service-worker config + predicates)
│   │   └── db/
│   │       ├── index.ts                  # lazy getDb() + schema re-export (NO top-level connection)
│   │       ├── schema.ts                 # content + tenancy + tutor tables; re-exports auth-schema
│   │       ├── auth-schema.ts            # better-auth tables: user/session/account/verification
│   │       └── health.ts                 # REQUIRED_COLUMNS, missingColumns(), liveColumns()
│   │
│   ├── content/                          # authored curriculum (typed, in-repo)
│   │   ├── types.ts / registry.ts / index.ts / skills.ts / phonics.ts / activity-configs.ts
│   │   ├── programs/                     # kaelyn-adaptive (pilot default), summer-k-to-grade1, world-languages/*
│   │   └── languages/                    # japanese, korean, spanish, zhuyin (+ audio, types)
│   │
│   ├── activities/                       # activity-type plugin registry (one dir per kind)
│   │   ├── index.ts                      # getActivityType(kind) registry → graceful "coming soon" fallback
│   │   ├── _shared/                      # ActivityChrome (SpeakerButton/Prompt/PlayerControls/ProgressHint),
│   │   │                                 #   RewardOverlay, ChoiceGrid, scoring, speechRouting, shuffle,
│   │   │                                 #   useAudio/useSpeech/useReducedMotion/useSpeakOnce/useManagedTimeout/
│   │   │                                 #   useWrongShake/useActivity/useMultipleChoice, voiceUtils (Player DRY kit)
│   │   └── <kind>/{index,logic,Player}.tsx   # math-array, math-tenframe, phonics-wordbuild,
│   │                                     #   sightword-game, reading-comprehension, journal-prompt,
│   │                                     #   lang-listen-match, lang-symbol-intro
│   │
│   └── components/                       # Wonder Studio component vocabulary
│       ├── ui/                           # Button, Field, TextInput, Select, Switch, Pill, ProgressRing,
│       │                                 #   Stars, Surface, EmptyState, PageHeader, StatusMessage (success/error
│       │                                 #   badge), BackLink, AvatarBadge (token-pure primitives; Field wires ARIA;
│       │                                 #   EmptyState/PageHeader hoist repeated page markup)
│       ├── boundaries/                   # shared route-boundary scaffolds: RouteErrorPanel, NotFoundPanel
│       │                                 #   (adult voice), KidMessagePanel, KidLoadingShell, Skeleton
│       │                                 #   (SkeletonBar/SkeletonCardGrid) — consumed by error/not-found/loading shells
│       ├── a11y/SkipLink.tsx             # skip-to-content (sr-only → focus reveal)
│       ├── art/                          # Mascot (SVG, role=img + aria-label), Decorations (SVG, aria-hidden)
│       ├── shell/                        # SiteHeader, SiteFooter (marketing)
│       ├── learner/                      # ActivityHost, AppShellKid, StudioHome, UnitView, ProgramPicker
│       │                                 #   + state/narration helpers (useLearnerState/useProgress/
│       │                                 #   useSkillState, localStore, narrate, speak)
│       ├── parent/                       # DashboardShellParent, AddChildForm, EnrollmentConfigForm,
│       │                                 #   MarketplaceGrid, ProgramCard, CurriculumPanel, ActivityRowItem,
│       │                                 #   AssignProgramControl, LearnerDataControls, ProgressReportCard
│       ├── admin/                        # AdminShell, CreateProgramForm, ProgramLifecycleControls,
│       │                                 #   editor/ (ProgramEditor + Unit/Lesson/Activity/Config fields)
│       └── pwa/IosInstallHint.tsx        # iOS add-to-home hint (role=status, dismissible)
│
├── drizzle/                              # generated migrations 0000…0006 (append-only, expand-only)
├── scripts/
│   ├── lib/cli-db.ts                     # openCliDb()/runCli() — shared raw-postgres CLI bootstrap (migrate/seed/grant)
│   ├── db.sh                             # psql wrapper → CNPG -rw in-cluster, else $DATABASE_URL
│   ├── migrate.ts                        # `bun scripts/migrate.ts` — programmatic drizzle-orm migrate()
│   │                                     #   run by the Deployment `migrate` initContainer (db:migrate:deploy);
│   │                                     #   fail-closed baseline guard + pg_advisory_lock (NOT a Job — Flannel
│   │                                     #   blocks short-lived Job pods from the DB; see deploy memory)
│   ├── seed-admin-roles.ts               # `bun run db:seed:admin` — grant role='admin' to VERIFIED ADMIN_EMAILS
│   │                                     #   users (P4 reconcile; requireAdmin trusts the role column, not the allowlist)
│   └── grant-admin.ts                    # `bun run db:grant:admin <user-id> [--revoke]` — out-of-band admin
│                                         #   bootstrap by confirmed user id (used while email verification is off)
│
├── e2e/                                  # Playwright E2E suite (smoke/auth/parent/learner/admin) — drives a
│                                         #   real browser; targets live prod by default behind the E2E_ALLOW_PROD
│                                         #   gate. `bun run test:e2e`; see e2e/README.md + scripts/e2e-cleanup.sh.
├── playwright.config.ts                  # E2E projects (setup→public/parent/admin), prod-target guards
├── instrumentation.ts                    # Sentry register() + onRequestError
├── instrumentation-client.ts             # Sentry client init + onRouterTransitionStart
├── sentry.{server,edge}.config.ts        # env-gated Sentry.init (no-op without DSN)
├── next.config.ts                        # standalone output, _archive excluded, Serwist + withSentryConfig, CSP
├── drizzle.config.ts                     # drizzle-kit config (schema + out dir)
├── eslint.config.mjs                     # ESLint 9 flat config; ignores _archive
├── postcss.config.mjs                    # Tailwind v4 PostCSS
├── vitest.config.ts                      # node env, @/ alias, _archive excluded
├── tsconfig.json                         # strict, @/* → ./src/*
│
├── CLAUDE.md                             # project guide (stack, non-negotiables, task routing)
├── DEPLOY.md                             # GitOps deploy + canary + rollback
├── .merge-ready/                         # per-reviewer attestations (HEAD-pinned; see scripts/merge-ready.sh)
├── .claude/                              # ported dev-workflow skills (ship, polish, sprint*, process-sentry)
│
├── docs/
│   ├── specs/                            # 2026-06-13-platform-v3-design.md (source of truth; §8 child-data)
│   ├── architecture/                     # this file
│   ├── curriculum/summer-k-to-grade1/    # Program 01 content (10-week plan + sight words + assessments)
│   ├── superpowers/plans/                # implementation + polish plans
│   └── claude/                           # session reports (polish passes, deferred-items, known-risks)
│
└── _archive/v2/                          # old v2 app — excluded from build/lint/tests; do not import
```

## Conventions

- **Lazy factories** for anything touching a service (`getDb`, `getAuth`) — never instantiate at module scope (breaks `next build`). Invoke per-request.
- **All AI via the LiteLLM gateway** (`src/lib/ai/models.ts`) — never a raw provider SDK.
- **§8 child-data posture** (`docs/specs` §8): no child PII beyond display name + birth month; no open-ended child↔LLM chat; every child-facing AI output is bounded + schema-validated server-side; gates **fail closed**; never a child's name in `<title>`.
- **Path alias** `@/*` → `./src/*` (in both `tsconfig.json` and `vitest.config.ts`).
- **Tests** colocate as `*.test.ts(x)` next to source; run via Vitest (`bun run test`); `_archive` is excluded.
- **Migrations** are append-only in `drizzle/`; **expand-only / backward-compatible** per deploy. They auto-apply via the Deployment `migrate` initContainer before the app container takes traffic (see `DEPLOY.md`).
- **Icons** are Phosphor only; **Tailwind** v4 with static class maps only (JIT-safe); **never** an `eslint-disable`/`@ts-ignore`.

## How a learner request flows (orientation)

1. `(learner)/learn/[programSlug]/[unitId]/[activityId]/page.tsx` resolves the learner's
   **version-pinned** program tree (`src/lib/content/repository.ts`) and renders the activity.
2. `components/learner/ActivityHost.tsx` mounts the matching player from the
   `src/activities/` registry; progress writes go through `src/lib/tutor/store.ts`
   (tenancy- and enrollment-gated, fail-closed).
3. After an authored lesson completes, the optional parent-gated shelf action
   (`ensureLessonPractice`) derives generation inputs from the learner's pinned
   authored tree, calls LiteLLM through `src/lib/ai/practice.ts`, validates the
   output, and stores bounded learner-owned practice rows for later play.
4. Read-aloud audio resolves through `src/lib/audio/*` (Kokoro) and the
   `/api/tts` + `/audio/[...path]` routes, cached in object storage.

## Phase history (what has landed)

P0 foundation, P1 content model + activity plugins, P2 Wonder Studio design system, P3 learner
UX, P4 parent area + accounts, P5 agentic tutor (LiteLLM), and P6 content marketplace + PWA are
all in the tree above. Remaining roadmap items are tracked as plans under
`docs/superpowers/plans/` (admin email verification, COPPA account export/delete + provenance
UI, Redis cluster-wide rate limiting) and accepted gaps in `docs/claude/KNOWN-RISKS-P0-PILOT.md`.
```
