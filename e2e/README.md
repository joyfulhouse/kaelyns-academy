# E2E tests (Playwright)

End-to-end tests that drive a real browser against the running app.

> **Target: live production by default** (`https://kaelyns.academy`). Set
> `E2E_BASE_URL` to point elsewhere (e.g. a local `bun run dev` at
> `http://localhost:3000`). Because the default target is the **pilot prod DB**,
> every spec creates per-run, uniquely-tagged data and tears it down; learner
> tests use **authored** content only (never the paid `/api/practice` AI path);
> the admin lifecycle never publishes to the live catalog unless you opt in.
>
> **Hitting prod is a deliberate act.** When the resolved target is
> `kaelyns.academy`, the config refuses to run unless `E2E_ALLOW_PROD=1` is set
> (kept in gitignored `.env.local`). Point `E2E_BASE_URL` at a local/staging
> server to run without that flag.

## Running

```bash
bun run test:e2e                  # whole suite
bun run test:e2e --project=public # smoke + auth + learner (signed-out)
bun run test:e2e --project=parent # parent dashboard (seeded parent session)
bun run test:e2e --project=admin  # admin lifecycle (seeded admin session)
bun run test:e2e:ui               # interactive UI mode
bun run test:e2e:report           # open the last HTML report
```

First time on a machine: `bunx playwright install chromium`.

## Projects (playwright.config.ts)

- **setup** — signs in the two seeded accounts once, saves session state to
  `e2e/.auth/{parent,admin}.json` (gitignored). `parent`/`admin` projects depend on it.
- **public** — signed-out specs (`smoke`, `auth`, `learner`, `life-skills-math`).
- **parent** / **admin** — reuse the saved sessions. `motivation.spec.ts` lives in
  the `parent` project (its admin-only assertion locally overrides to the admin
  storageState via `test.use`) rather than getting its own project, since it needs
  both auth contexts in one file.

Runs serially (`workers: 1`) — the target is shared mutable state.

## Credentials (seeded test accounts)

Two long-lived test accounts live in the target DB. Their creds are read from
env (loaded from gitignored `.env.local`):

```
E2E_PARENT_EMAIL=e2e-parent@kaelyns.test
E2E_PARENT_PASSWORD=…
E2E_ADMIN_EMAIL=e2e-admin@kaelyns.test
E2E_ADMIN_PASSWORD=…
```

**Re-seed** (if the accounts are missing) by signing up via the app, then
granting the admin role:

```bash
# create both accounts (email verification is off → immediately usable)
curl -fsS -X POST "$BASE/api/auth/sign-up/email" -H 'Content-Type: application/json' \
  -d '{"name":"E2E Parent","email":"e2e-parent@kaelyns.test","password":"<pw>"}'
curl -fsS -X POST "$BASE/api/auth/sign-up/email" -H 'Content-Type: application/json' \
  -d '{"name":"E2E Admin","email":"e2e-admin@kaelyns.test","password":"<pw>"}'
# grant admin (psql -U postgres in the CNPG primary; db.sh peer-auth fails)
kubectl -n kaelyns-academy exec -i <cnpg-primary> -c postgres -- \
  psql -U postgres -d kaelyns_academy \
  -c "UPDATE \"user\" SET role='admin' WHERE email='e2e-admin@kaelyns.test';"
```

Put the generated passwords in `.env.local`.

## Safety knobs

- `E2E_ADMIN_PUBLISH=1` — also exercise admin **publish → archive** (briefly puts
  a test program in the LIVE marketplace). Off by default: the admin spec only
  creates/edits/archives an unpublished draft.

## CI gate (Forgejo)

A **pre-deploy E2E gate** runs in Forgejo CI, inside the build workflow
`homelab/.forgejo/workflows/build-kaelyns-academy.yml`. It does **not** target
prod — it stands up an ephemeral, prod-shaped environment from the freshly-built
images and runs this whole suite against it before deploying:

1. `postgres:16-alpine` on a throwaway docker network.
2. Migrations via the `:<sha>-migrator` image (`db:migrate:deploy`) + the real
   curriculum (`scripts/seed-content.ts`), so content-backed specs match prod.
3. The just-built `:<sha>` runner image as the app under test; the two test
   accounts are seeded (sign-up + role grant); `bun run test:e2e` runs against the
   app container (`E2E_BASE_URL=http://<app-container>:3000`).

> **Known gap (Task 13):** `motivation.spec.ts` additionally requires
> `scripts/seed-motivation.ts` (interests / sticker packs / quest templates) to
> have run against the target DB — see that spec's doc comment. Step 2 above
> only runs `seed-content.ts`. Until the Forgejo workflow adds an equivalent
> `bun scripts/seed-motivation.ts` step for the ephemeral DB, the motivation
> spec's quest-board / sticker-catalog / admin-quest-list assertions will fail
> in this CI gate even though they're expected to pass against prod (seeded once
> at Task 14 ship time).

The `<sha>` is pinned into `k3s-infra` (= deployed) **only if the suite passes** —
a failing image is pushed to Harbor but never rolled. Because the CI target is the
app container (not `kaelyns.academy`), the prod guard and the CI-fail-closed check
(`isProd && process.env.CI` → refuse) never trigger, and no prod data is touched.
The ephemeral env is torn down `always()`.

> **Status:** live on `master`. Validated by a `workflow_dispatch` run on the
> branch, then confirmed on the auto-deploy path by the first gated `*/15` push
> build. The gate now runs on every build and only deploys on green.

## Cleanup

Specs self-clean, but a failed run can leave a tagged row behind. The sweep is
**dry-run by default** (prints the counts it would delete, deletes nothing):

```bash
KUBECONFIG=~/.kube/config-k3s bash scripts/e2e-cleanup.sh            # dry run
KUBECONFIG=~/.kube/config-k3s bash scripts/e2e-cleanup.sh --confirm  # delete
```

It deletes only E2E-tagged artifacts: learners named `E2E Kid%`, accounts
`e2e-throwaway+%@kaelyns.test`, and draft programs slugged `e2e-draft-%`. It does
**not** touch the two seeded accounts.

`motivation.spec.ts` uses a different, intentionally-persistent learner —
`"E2E Learner"` (see `ensurePersistentLearner` in `helpers.ts`) — that this
sweep never matches (it doesn't start with `E2E Kid`). That learner is meant to
accumulate real star/quest/sticker/interest state across runs and is never
deleted by this script; its four state tables (`star_ledger`, `learner_sticker`,
`learner_interest`, `learner_quest`) all cascade off `learner.id` regardless, so
no separate sweep entry is needed for them.
