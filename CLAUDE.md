# Kaelyn's Academy (v3)

A pluggable, multi-user, AI-agentic learning platform for young children. Ground-up rebuild (v3) — see `docs/specs/2026-06-13-platform-v3-design.md`. The first content program is the **Summer Bridge: Kindergarten → 1st Grade** curriculum in `docs/curriculum/summer-k-to-grade1/`. Pilot learner: a just-finished-kindergarten, on-track child.

> **Status:** P0 (foundation + deploy pipeline) in progress on branch work. v2 source is archived under `_archive/v2/` (do not build or import from it).

## Tech Stack (Locked)

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router, RSC + Server Actions) | All request APIs async. |
| Language | TypeScript (strict) | No `@ts-ignore`. |
| Package manager | **bun** | ALWAYS. Never npm/yarn/pnpm. |
| Styling | Tailwind CSS v4 + bespoke "Wonder Studio" system | Static class maps only (JIT-safe). Tokens land in P2. |
| Icons | Phosphor | Never Lucide. |
| DB | PostgreSQL via **CloudNativePG** (`kaelyns-academy-db`, amd64-pinned) | Drizzle ORM. Barman→B2 backups. |
| ORM | Drizzle ORM | Migrations in `drizzle/`. |
| Auth | Better Auth (Drizzle adapter) | Parent accounts → child profiles (modeling lands in P4). |
| AI | **LiteLLM gateway** (OpenAI-compatible) | `LITELLM_URL` + `LITELLM_API_KEY`. Tutor = Claude route via LiteLLM. NEVER call provider SDKs directly — go through `@/lib/ai/models` (lands in P5). |
| Errors | Sentry (`@sentry/nextjs`) | `captureNonCritical` from `@/lib/capture`. |
| Hosting | homelab k3s via **ArgoCD GitOps** | Harbor registry, Traefik, Cloudflare Tunnel for `kaelyns.academy`. |
| Lint | ESLint 9 (flat config) | `eslint .` — NOT `next lint` (removed in Next 16). ESLint pinned to 9 (eslint-plugin-react incompatible with ESLint 10). |

## Non-negotiables

- **Build-safety:** NEVER call `getDb()` / `getAuth()` (or connect to any service) at module top-level — it breaks `next build`. Lazy factories only; invoke per-request.
- **All AI via the LiteLLM gateway.** No raw provider SDKs.
- **Child-data posture:** no child PII beyond display name + birth month; **no open-ended child↔LLM chat** (all child-facing AI is bounded + schema-validated server-side). See spec §8.
- **Never `:latest`** in deployed manifests (CI pins the SHA). **Never commit plaintext secrets** — sealed-secrets only.
- **Never disable a linter rule** (`eslint-disable`, `@ts-ignore`, `// noqa`) or ignore a warning — fix the root cause.
- Run `bun run lint && bun run typecheck && bun run test && bun run build` before merge.

## Commands

```bash
bun install
bun run dev          # dev server (localhost:3000)
bun run build        # production build (standalone)
bun run lint         # eslint .
bun run typecheck    # tsc --noEmit
bun run test         # vitest run
bun run db:generate  # drizzle-kit generate
bun run db:migrate   # drizzle-kit migrate
scripts/db.sh -c "…" # psql against CNPG (-rw) in-cluster, or $DATABASE_URL locally
```

## Deploy

GitOps only — see `DEPLOY.md`. Push app → Forgejo CI builds → Harbor → SHA pinned in `k3s-infra` → ArgoCD rolls → Traefik + Cloudflare Tunnel. Use `/ship` for the full gated pipeline (review gates + canary). Until the pipeline lands (P0 tasks T8–T12), deploy is manual per DEPLOY.md.

## Dev workflow

Ported from askcv.ai (homelab-adapted): `/ship`, `/sprint`, `/sprint-plan`, `/sprint-loop`, `work-item`, `process-sentry`. Bug reporting = in-app feedback widget → `work_items` table + Sentry, feeding the sprint→ship pipeline. The `work_items`/`sprints` schema + feedback widget land in P6 — until then the sprint/work-item skills are inert (Sentry + process-sentry work today).

## Task Routing (domain docs arrive as phases land)

| Working on… | Read first |
|---|---|
| Architecture / directory map | `docs/architecture/STRUCTURE.md` |
| Deploy / CI / canary | `DEPLOY.md` |
| Platform design (source of truth) | `docs/specs/2026-06-13-platform-v3-design.md` |
| Curriculum content (Program 01) | `docs/curriculum/summer-k-to-grade1/` |
| Implementation plans | `docs/superpowers/plans/` |
| Frontend / design system (Wonder Studio) | `PRODUCT.md` + `DESIGN.md` *(created in P2)* |
| Content model / activity plugins | *(P1 — `docs/architecture/CONTENT.md`)* |
| Agentic tutor | *(P5 — `docs/architecture/AGENT.md`)* |

## Directory Structure (current)

```
src/
├── app/
│   ├── layout.tsx, page.tsx, globals.css
│   └── api/
│       ├── health/route.ts        # schema-drift canary (200/503)
│       └── auth/[...all]/route.ts # Better Auth handler (lazy, per-request)
├── lib/
│   ├── env.ts            # getEnv(key, fallback?)
│   ├── capture.ts        # captureNonCritical
│   ├── db/
│   │   ├── index.ts      # lazy getDb() + schema export
│   │   ├── schema.ts     # health_check + re-exports auth-schema
│   │   ├── auth-schema.ts# better-auth tables (user/session/account/verification)
│   │   └── health.ts     # REQUIRED_COLUMNS, missingColumns, liveColumns
│   └── auth.ts           # lazy getAuth()
drizzle/                  # generated migrations
scripts/db.sh             # CNPG psql wrapper
_archive/v2/              # old v2 app (do not build/import)
```
