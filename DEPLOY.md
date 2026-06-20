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

## Rollback

- **Preferred:** revert the SHA-pin commit in `k3s-infra` → ArgoCD rolls back to the previous image.
- **Fast:** `kubectl -n kaelyns-academy rollout undo deploy/kaelyns-academy`.
- **NEVER run migrations after the traffic flip.** If a migration was destructive, rollback can't undo schema — that's why migrations are expand-only and run pre-traffic.

## Migrations

- Author with `bun run db:generate` (Drizzle). Commit the generated SQL in `drizzle/`.
- Apply via the pre-sync step (production) or `scripts/db.sh < drizzle/<file>.sql` for a manual bootstrap.
- Keep every migration expand-only across one deploy (add columns/tables; remove only in a later deploy after the code no longer references them).
- Grow `REQUIRED_COLUMNS` in `src/lib/db/health.ts` whenever a newly-required column must gate the canary.

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
