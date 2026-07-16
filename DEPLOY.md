# Deploying Kaelyn's Academy

Deployment is **GitOps on the homelab k3s cluster** — there is no Vercel, no `kubectl apply` for app rollouts. The full gated pipeline runs via `/ship`; this doc is the reference for what `/ship`'s deploy half does and how to operate it manually.

## Topology

- **Namespace:** `kaelyns-academy` (k3s). Keep separate from the `kaelyn` namespace (that's kaelyn.ai).
- **Image registry:** Harbor — `registry.joyful.house/homelab/kaelyns-academy:<sha>`.
- **DB:** CloudNativePG cluster `kaelyns-academy-db` (**amd64-pinned** — arm64 CNPG is broken on this cluster). Backups: Barman → Backblaze B2.
- **Ingress:** Traefik IngressRoute on `kaelyns-academy.k3s.joyful.house` (internal).
- **Public domain:** `kaelyns.academy` via **Cloudflare Tunnel** (TLS terminates at Cloudflare's edge — the `*.joyful.house` wildcard cert does NOT cover this domain).
- **GitOps controller:** ArgoCD, watching `git.joyful.house/joyfulhouse/k3s-infra` (`main`), app dir `k8s/kaelyns-academy/`.
- **CI:** Forgejo Actions in the `homelab` repo (`.forgejo/workflows/build-kaelyns-academy.yml`).
- **Secrets:** sealed-secrets in `k3s-infra` (`kaelyns-academy-{db-creds,litellm,sentry,auth}`).

## The flow (automatic, after merge to `main`)

```
git push app → Forgejo Actions builds image → Harbor :<sha>
  → CI pins <sha> in k3s-infra/k8s/kaelyns-academy/deployment.yaml → push
    → ArgoCD detects (~30s) → migrations (pre-sync) → rolling update
      → Traefik / Cloudflare Tunnel serve kaelyns.academy
```

1. **Build:** `homelab/docker/kaelyns-academy/Dockerfile` (Next standalone) is built by Forgejo Actions and pushed to Harbor as `:<short-sha>`. **CI MUST pass `SOURCE_COMMIT` (the pinned image SHA) as a build env** so `next.config.ts` derives a deterministic service-worker precache revision. Without it, the SW still works but precache revisions fall back to a per-build timestamp (non-deterministic across replicas).
2. **Pin:** CI rewrites the image SHA in `k3s-infra/k8s/kaelyns-academy/deployment.yaml` and pushes to `k3s-infra` `main`.
3. **Migrate before traffic:** pending Drizzle migrations apply to `kaelyns-academy-db` as a pre-sync step **before** new pods take traffic. Migrations MUST be **expand-only / backward-compatible** so the currently-live pods keep working until the roll completes.
4. **Roll:** ArgoCD syncs the new SHA; Kubernetes does a rolling update.

Watch it: `kubectl -n argocd get app kaelyns-academy -w` → wait for `Synced` + `Healthy`.

## Canary (after every deploy)

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' https://kaelyns.academy/api/health   # MUST be 200
```
`/api/health` returns **503** on schema drift (a required column is missing — see `src/lib/db/health.ts`) or DB-down, and **200** only when healthy. Also:
- spot-check key routes return 200;
- check Sentry for new errors in the 5 minutes post-roll (`process-sentry` skill).

### Service worker + Cloudflare edge cache

The PWA service worker is served at `/serwist/sw.js`. Its `Cache-Control` is forced to
`public, max-age=0, must-revalidate` (via `next.config.ts` → `src/lib/pwa/precache.ts`)
so a bad SW can't stay pinned at the edge for a year. **That header only governs *future*
edge fetches.** An entry already cached under the old 1-year `s-maxage` will keep being
served until evicted, so:

- **On any deploy that changes the SW**, purge the Cloudflare cache for `/serwist/sw.js`
  and `/serwist/sw.js.map` (Cloudflare → Caching → Purge → *Custom URLs*, or the API).
  Also ensure no Cloudflare "Cache Everything" / Edge-TTL-Override rule for `/serwist/*`
  ignores origin headers.
- **Verify at the edge** (not just origin):
  ```bash
  curl -sI https://kaelyns.academy/serwist/sw.js | grep -iE 'cache-control|cf-cache-status'
  # expect: cache-control: public, max-age=0, must-revalidate   (NO long s-maxage)
  #         cf-cache-status: MISS/EXPIRED/DYNAMIC (not a long-lived HIT)
  ```
- **Precache is lean** (`public/**` + `/~offline` only — no content-hashed `/_next`
  chunks; see `src/lib/pwa/precache.ts`), so a missing chunk can never fail the SW
  `install`. Trade-off: the `/~offline` page renders from precached HTML but its CSS/
  fonts come from the **runtime** cache (`CacheFirst` in `sw.ts`), so it is styled
  offline only if those assets were fetched on a prior online visit. Acceptable for a
  fallback; a fully self-contained (inline-CSS) offline page is a possible follow-up.

## Rollback

- **Preferred:** revert the SHA-pin commit in `k3s-infra` → ArgoCD rolls back to the previous image.
- **Fast:** `kubectl -n kaelyns-academy rollout undo deploy/kaelyns-academy`.
- **NEVER run migrations after the traffic flip.** If a migration was destructive, rollback can't undo schema — that's why migrations are expand-only and run pre-traffic.

## Migrations

- Author with `bun run db:generate` (Drizzle). Commit the generated SQL in `drizzle/`.
- Apply via the pre-sync step (production) or `scripts/db.sh < drizzle/<file>.sql` for a manual bootstrap.
- Keep every migration expand-only across one deploy (add columns/tables; remove only in a later deploy after the code no longer references them).
- Grow `REQUIRED_COLUMNS` in `src/lib/db/health.ts` whenever a newly-required column must gate the canary.

### Journal-derived mastery cleanup (migration 0016 — IRREVERSIBLE)

Migration **0016** is the first pass that removes mastery/review state wrongly
derived from journal participation before journal scoring became participation-
only: it `DELETE`s the journal-exclusive `review_schedule` and `skill_state`
rows and scrubs journal-prompt `attempt` response artifacts. Migration 0017
re-runs the same cleanup and installs the enforcing trigger. Every delete/scrub
is gated by the fail-closed `journal_skill_state_is_exclusive` predicate — it
only touches state that is provably an exact multiset of well-formed journal
ledger emissions, and fails closed on any malformed/ambiguous shape — so it
never removes non-journal mastery.

These deletes are **irreversible** and run pre-traffic in the migrate step. The
recovery story is PITR: **before promoting a deploy that first applies 0016,
confirm the Barman → B2 base backup + WAL archive is current** (a restore point
exists ahead of the migration). No app-level snapshot of the purged rows is
kept; if you need one, snapshot `review_schedule`/`skill_state` to an audit
table before applying. There is no forward "undo" migration.

### Journal privacy guard compatibility (migration 0017)

Migration 0017 installs a `BEFORE INSERT OR UPDATE` trigger ahead of the database
CHECK. Safe bounded journal summaries with empty skill evidence proceed. An old
or rolled-back pod that submits raw text/drawing/evidence gets a row-level no-op
plus a fixed deferred abort signal. Its parameterized INSERT succeeds without a
query error, any legacy mastery/review folds may run inside the transaction, and
the parameter-free COMMIT then fails and rolls the entire transaction back. Raw
child artifacts therefore persist in neither PostgreSQL storage nor database-
error telemetry. Other lesson writes remain available.

This compatibility guarantee relies on the known writers' explicit transactions
and default deferred-constraint mode; neither writer issues `SET CONSTRAINTS`.
The signal's `23505` is terminal when its constraint is
`attempt_write_abort_signal_uq` and must never enter a generic unique-key retry.
Drizzle's schema metadata cannot express `DEFERRABLE INITIALLY DEFERRED`, so the
raw migration is authoritative (and tested through `pg_constraint`); do not use
`drizzle-kit push` or schema recreation in place of the migration pipeline.

The same migration re-cleans rows committed by transactions that were already
in flight before the trigger lock, then validates the CHECK as an independent
backstop. No two-phase application rollout is required. A rollback keeps both
guards in place; raw legacy journal saves fail closed without persistence. Do
not remove or weaken the trigger or constraint as part of rollback.

## Granting admin access (P4 role gate)

Admin access is authorized by the user row's `role` column (`role = 'admin'`), **not**
the `ADMIN_EMAILS` allowlist — the allowlist is only a seed. A freshly registered
parent (even one whose email is allowlisted) is `role = 'user'` and is denied
`/admin` until granted.

**Bootstrap the operator (while email verification is OFF) — grant by confirmed user id.**
An email string is **not proof of ownership** when verification is off, so do not
grant admin by email-matching here (a pre-registered allowlisted address could be an
attacker's). After the operator registers, confirm the row is theirs, then grant by id
with the idempotent helper:

```bash
# 1. List users; confirm the id is the operator's own freshly-registered row:
kubectl -n kaelyns-academy exec kaelyns-academy-db-1 -c postgres -- \
  psql -U postgres -d kaelyns_academy -c "SELECT id, email, email_verified, role FROM \"user\";"
# 2. Grant (DATABASE_URL from the app secret/env); --revoke demotes back to 'user':
DATABASE_URL=… bun run db:grant:admin <operator-user-id>
```

Note: a fresh deploy onto an **empty** user table (or any table with no allowlisted
verified user) intentionally has **zero admins** — that is the correct state until the
operator registers and is granted by id above; it is not a lockout (there is no
existing operator account to lock out).

**Reconcile from the allowlist (once email verification is ON — P4 Stage 2).**
`bun run db:seed:admin` grants admin to allowlisted users **only when their email is
verified**, and refuses (warns) on unverified rows — so it can never re-open the
self-register vector. Idempotent; safe to re-run:

```bash
DATABASE_URL=… ADMIN_EMAILS=… bun run db:seed:admin   # verified allowlisted users → admin
```

The `role` column is in the health canary's `REQUIRED_COLUMNS`, so a deploy that
skipped the `0007` migration 503s rather than 500-ing on a missing column.

## Interim manual deploy (until P0 tasks T8–T12 land)

The Dockerfile, Forgejo workflow, k3s-infra manifests, sealed secrets, ArgoCD app, and Cloudflare tunnel entry are created in P0 tasks T8–T12. Until those exist, deploy manually:

```bash
# 1. Build + push the image to Harbor
docker build -f ../../homelab/docker/kaelyns-academy/Dockerfile -t registry.joyful.house/homelab/kaelyns-academy:$(git rev-parse --short HEAD) .
docker push registry.joyful.house/homelab/kaelyns-academy:$(git rev-parse --short HEAD)
# 2. Pin the SHA in k3s-infra/k8s/kaelyns-academy/deployment.yaml, commit + push
# 3. Apply migrations: scripts/db.sh < drizzle/<latest>.sql
# 4. Let ArgoCD sync (or kubectl -n kaelyns-academy rollout restart deploy/kaelyns-academy)
# 5. Canary: curl https://kaelyns.academy/api/health
```
