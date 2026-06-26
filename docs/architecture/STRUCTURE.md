# Directory Structure

Current as of P0 (foundation). Update this as each phase lands.

```
kaelyns-academy/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # root layout (metadata)
│   │   ├── page.tsx                  # placeholder home (replaced in P3)
│   │   ├── globals.css               # @import "tailwindcss"
│   │   ├── opengraph-image.tsx       # branded 1200×630 social card (next/og, build-time)
│   │   │                             #   …alongside the other metadata file-conventions
│   │   │                             #   (sitemap/robots/manifest/icon) co-located in app/
│   │   └── api/
│   │       ├── health/route.ts       # schema-drift canary — 200 ok / 503 drift|down
│   │       └── auth/[...all]/route.ts# Better Auth handler (lazy, per-request — build-safe)
│   └── lib/
│       ├── env.ts                    # getEnv(key, fallback?) — typed env access
│       ├── capture.ts                # captureNonCritical(message, error) — Sentry warning, never throws
│       ├── auth.ts                   # lazy getAuth() singleton (build-safe)
│       └── db/
│           ├── index.ts              # lazy getDb() + schema re-export (NO top-level connection)
│           ├── schema.ts             # healthCheck table + `export * from ./auth-schema`
│           ├── auth-schema.ts        # better-auth tables: user/session/account/verification
│           └── health.ts             # REQUIRED_COLUMNS, missingColumns(), liveColumns()
│
├── drizzle/                          # generated migrations (0000 health_check, 0001 auth tables)
├── scripts/
│   └── db.sh                         # psql wrapper → CNPG -rw in-cluster, else $DATABASE_URL
│
├── instrumentation.ts                # Sentry register() + onRequestError
├── instrumentation-client.ts         # Sentry client init + onRouterTransitionStart
├── sentry.{server,edge}.config.ts    # env-gated Sentry.init (no-op without DSN)
├── next.config.ts                    # standalone output, _archive excluded, withSentryConfig
├── eslint.config.mjs                 # ESLint 9 flat config (eslint-config-next), ignores _archive
├── vitest.config.ts                  # node env, @/ alias, _archive excluded
├── tsconfig.json                     # strict, @/* → ./src/*
│
├── CLAUDE.md                         # project guide (stack, non-negotiables, task routing)
├── DEPLOY.md                         # GitOps deploy + canary + rollback
├── .claude/                          # ported dev-workflow skills (ship, sprint*, work-item, process-sentry)
│
├── docs/
│   ├── specs/                        # 2026-06-13-platform-v3-design.md (source of truth)
│   ├── curriculum/summer-k-to-grade1/# Program 01 content (10-week plan + sight words + assessments)
│   ├── superpowers/plans/            # implementation plans (P0 …)
│   └── architecture/                 # this file; CONTENT.md (P1), AGENT.md (P5) to come
│
└── _archive/v2/                      # old v2 app — excluded from build/lint/tests; do not import
```

## Conventions

- **Lazy factories** for anything touching a service (`getDb`, `getAuth`) — never instantiate at module scope (breaks `next build`).
- **Path alias** `@/*` → `./src/*` (configured in both `tsconfig.json` and `vitest.config.ts`).
- **Tests** colocate as `*.test.ts` next to source; run via Vitest (`bun run test`); `_archive` is excluded.
- **Migrations** are append-only in `drizzle/`; expand-only per deploy (see `DEPLOY.md`).

## What lands in later phases

- **P1:** content model (`program`/`unit`/`lesson`/`activity`/`skill`/`learner`/`attempt`/`skill_state`) under `src/lib/db/schema.ts`, an activity-type plugin registry under `src/lib/programs/`, and the Program 01 seed.
- **P2:** Wonder Studio design system — `PRODUCT.md`, `DESIGN.md`, `src/components/` shell vocabulary, Tailwind tokens.
- **P3:** learner UX (`src/app/(learn)/…`, activity players).
- **P4:** parent area + accounts/child profiles (`src/app/(parent)/…`, `withAccount()`).
- **P5:** agentic tutor (`src/lib/ai/models.ts` → LiteLLM, `src/lib/ai/agent/`).
- **P6:** bug-reporting (`work_items`/`sprints` schema, feedback widget) — activates the sprint/work-item skills.
```
