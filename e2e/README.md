# E2E tests (Playwright)

End-to-end tests that drive a real browser against the running app.

> **Target: live production by default** (`https://kaelyns.academy`). Set
> `E2E_BASE_URL` to point elsewhere (e.g. a local `bun run dev` at
> `http://localhost:3000`). Because the default target is the **pilot prod DB**,
> every spec creates per-run, uniquely-tagged data and tears it down; learner
> tests use **authored** content only (never the paid `/api/practice` AI path);
> the admin lifecycle never publishes to the live catalog unless you opt in.

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
- **public** — signed-out specs (`smoke`, `auth`, `learner`).
- **parent** / **admin** — reuse the saved sessions.

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

## Cleanup

Specs self-clean, but a failed run can leave a tagged row behind. Sweep them:

```bash
KUBECONFIG=~/.kube/config-k3s bash scripts/e2e-cleanup.sh
```

It deletes only E2E-tagged artifacts: learners named `E2E Kid%`, accounts
`e2e-throwaway+%@kaelyns.test`, and draft programs slugged `e2e-draft-%`. It does
**not** touch the two seeded accounts.
