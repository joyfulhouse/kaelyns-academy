# Deferred-Items Work — 2026-06-26

Source: user request "address deferred items" after polish broad pass 4. This pass worked through the
backlog those polish passes had recorded but not built (it spans the app repo, the `homelab` CI repo, the
`k3s-infra` GitOps repo, and the prod DB).

## Shipped

| # | Item | Where | Result |
|---|------|-------|--------|
| 16 | Branded Open Graph image (`opengraph-image.tsx`, next/og) | app PR #26 → `bd5ef0a` | ✅ live; `og:image` is a 1200×630 card, Twitter `summary_large_image` |
| 17 | `SOURCE_COMMIT` build-arg (deterministic SW precache revision across replicas) | homelab Dockerfile + workflow | ✅ deployed + verified (the built bundle carries the image SHA, fixing the replica-divergence class) |
| 17 | `NEXT_PUBLIC_SENTRY_DSN` build-arg plumbing (browser Sentry) | homelab Dockerfile + workflow | ⚠️ **plumbed but inert** — needs a one-time **Forgejo Actions secret** (see "Action required") |
| 19 | FK covering indexes (`publisher.owner_user_id`, `program.publisher_id`) | app PR #27 (`0006`) + applied to prod | ✅ indexes live; `drizzle.__drizzle_migrations` reconciled to 7 rows |
| 18 | Auto-run migrations on deploy | k3s-infra `86ed4b3` (+ homelab CI) | ✅ live as a deployment **`migrate` initContainer** (no-op verified, app healthy) |

## How #18 (auto-migrate) actually landed — and why it isn't a Job

The original idea was an ArgoCD **PreSync Job**. Testing it as a no-op (per the operator's "test before wiring"
instruction) surfaced a chain of real blockers — exactly what the test is for:

1. **The runtime image can't migrate.** The `runner` image is a minimal `node:alpine` standalone server with no
   bun, no `drizzle-kit`, no `drizzle/` SQL. So a new Dockerfile **`migrator` target** (bun + full source +
   drizzle-kit) is built and pushed as `:<sha>-migrator`, pinned by digest by CI.
2. **Incident (caught + fixed):** appending the `migrator` stage made it the *last* Dockerfile stage, and the app
   build step had no `--target`, so `docker build` shipped the **migrator image as the app** → it ran
   `drizzle-kit migrate` and CrashLoopBackOff'd. **No outage** (RollingUpdate kept the old pods serving). Fixed by
   pinning `target: runner` on the app build step.
3. **`drizzle-kit migrate` CLI is flaky in a non-TTY pod** — its progress spinner can crash the process with
   exit 1 *after* the migration has already committed (observed ~33% of runs). A deploy-gating step can't be
   flaky, so migrations run through a **programmatic runner** `scripts/migrate.ts` (drizzle-orm `migrate()`,
   deterministic exit, explicit connection close, `pg_advisory_lock` serialization for the 2 replicas, and a
   fail-CLOSED baseline guard).
4. **Job pods can't reach the DB on this Flannel cluster.** A Job pod gets `ECONNREFUSED` to the DB — even to the
   DB pod's own node — while Deployment pods connect fine (short-lived pods miss the VXLAN FDB the
   `flannel-fdb-reconciler` heals). So migrations run as an **initContainer in the app Deployment** (after
   `wait-for-db`), not as a Job. Verified end-to-end: the initContainer connects, runs the runner as a clean
   no-op (`schema is up to date`), the app starts, ArgoCD Synced/Healthy.

Prod `drizzle.__drizzle_migrations` was **reconciled** (seeded 0000–0006 using drizzle-orm's own hashes) so the
runner skips the `drizzle-kit push`-bootstrapped schema and only applies new migrations going forward.

## Action required (operator)

- **Activate browser Sentry:** add a **`NEXT_PUBLIC_SENTRY_DSN`** secret to the `homelab` repo's **Forgejo
  Actions secrets** (the value is the same DSN already in the `kaelyns-academy-sentry` sealed-secret used at
  runtime). The Dockerfile/workflow already pass it as a build-arg; until the secret is set it resolves empty and
  the browser SDK stays inert (no regression, CSP stays tight). Server-side Sentry already works (runtime env).

## Plan docs (design only — NOT built)

Three roadmap items were genuinely out of polish/deferred scope (new product surface / infra), so they were
written up as design docs for separate, deliberate work:

- `docs/superpowers/plans/2026-06-26-plan-p4-admin-email-verification.md` — close the self-register-as-admin
  vector. Recommends a two-PR path: a `role` column gate first (closes the vector with no email infra), then
  Better Auth email verification. **Blocked on choosing an email transport** (no SMTP/transactional sender
  exists yet; LiteLLM can't send mail).
- `docs/superpowers/plans/2026-06-26-plan-p6-coppa-export-delete.md` — account-level COPPA export + delete +
  AI-provenance UI + per-learner settings UI. Learner-level export/delete already exist; the gap is
  account-level + provenance. New surface inventory: 3 pages, 2 server actions, 1 expand-only migration.
- `docs/superpowers/plans/2026-06-26-plan-p1-redis-rate-limiting.md` — cluster-wide Redis-backed rate limiting
  (`rate-limiter-flexible` + `ioredis`, fixed-window, fail-open to an in-memory insurance limiter). Needs a
  self-hosted Redis in k3s.

## Deferred / follow-ups

- The unused PreSync-Job manifest was abandoned in favor of the initContainer (Job pods can't reach the DB here).
- A full `STRUCTURE.md` refresh remains outstanding (frozen at P0); new ops files since: `scripts/migrate.ts`,
  `src/app/opengraph-image.tsx`, `src/components/a11y/SkipLink.tsx`.
- The three plan docs above are the highest-leverage next builds.
