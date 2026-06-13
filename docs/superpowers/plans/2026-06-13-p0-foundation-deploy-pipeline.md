# P0 — Foundation & Deploy Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a blank-slate Next.js 16 "Kaelyn's Academy v3" app and prove the entire homelab GitOps deploy path end-to-end — live at `https://kaelyns.academy/api/health` with CNPG Postgres, Sentry, and the ported dev-workflow skills — before any feature work.

**Architecture:** A single Next.js 16 (App Router, RSC) app, package-managed by bun, styled with Tailwind v4, persisted in a CloudNativePG Postgres cluster via Drizzle ORM, observed by Sentry. Shipping is pure GitOps: a Dockerfile in the `homelab` repo is built by Forgejo Actions into Harbor, the image SHA is pinned into the `k3s-infra` repo, and ArgoCD rolls it onto k3s behind Traefik. The external apex `kaelyns.academy` is exposed through a Cloudflare Tunnel (TLS at Cloudflare's edge), not the internal `*.joyful.house` wildcard.

**Tech Stack:** Next.js 16, React 19, TypeScript (strict), bun, Tailwind v4, Drizzle ORM, Better Auth, `@sentry/nextjs`, Docker, Forgejo Actions, Harbor, ArgoCD, Traefik, CloudNativePG, sealed-secrets, Cloudflare Tunnel.

> **This is Plan 1 of the P0–P7 series** described in `docs/specs/2026-06-13-platform-v3-design.md`. P1 (content model), P2 (design system), P3 (learner UX), P4 (parent/auth), P5 (agentic), P6 (bug reporting/ops), P7 (hardening/launch) get their own plans, written against the code this plan produces.

---

## Context an engineer needs before starting

**Repos involved (three, all already on disk):**
- App code: `/Users/bryanli/Projects/joyfulhouse/websites/kaelyns-academy/` (this repo; the rebuild target).
- Image build + CI + DNS: `/Users/bryanli/Projects/joyfulhouse/homelab/` (Forgejo remote `git.joyful.house/joyfulhouse/homelab`, branch `master`).
- K8s manifests (GitOps source ArgoCD watches): `/Users/bryanli/Projects/joyfulhouse/k3s-infra/` (Forgejo remote `git.joyful.house/joyfulhouse/k3s-infra`, branch `main`).

**The deploy flow (memorize this):** push app Dockerfile to `homelab` → Forgejo Actions builds → pushes `registry.joyful.house/homelab/kaelyns-academy:<sha>` to Harbor → CI clones `k3s-infra`, rewrites the image SHA in `k8s/kaelyns-academy/deployment.yaml`, pushes → ArgoCD detects (~30s) and rolls. **Developers never run `kubectl apply` for app rollouts.**

**Reference app to copy patterns from:** `k3s-infra/k8s/homelab-portal/` (a full-stack app with a CNPG DB, IngressRoute, sealed secrets). Read it before writing manifests. A reference Forgejo workflow: `homelab/.forgejo/workflows/build-comfyui.yml`.

**Hard-won gotchas (from `homelab/docs/important-notes.md` + `homelab/CLAUDE.md`):**
- **CNPG must be pinned to `amd64`** — arm64 CNPG instances can't reach the API ClusterIP on this cluster. Use `nodeAffinity` requiring `kubernetes.io/arch=amd64`.
- **Never use `:latest`** in deployed manifests — always a pinned `:<sha>`. CI rewrites it.
- **External domains use Cloudflare Tunnel**, not cert-manager. `kaelyns.academy` is NOT covered by the `*.joyful.house` wildcard cert. TLS terminates at Cloudflare.
- **Secrets are sealed-secrets** (kubeseal) committed to `k3s-infra`; never commit plaintext.
- Default StorageClass is `nfs-k3s`. CNPG backups go to Backblaze B2 via Barman (`ObjectStore` + `ScheduledBackup`), reusing the `cnpg-b2-backup` credentials pattern.

**Verification convention used in this plan:** scaffolding/infra tasks can't be unit-tested, so their "test" steps are exact shell commands with expected output. Application-logic tasks use real TDD (failing test first).

---

## File structure (created by this plan)

**App repo (`websites/kaelyns-academy/`):**
- `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `biome`/`eslint` config, `.env.example`
- `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- `src/app/api/health/route.ts` — health + schema-drift canary
- `src/lib/db/index.ts` — Drizzle client (lazy, build-safe)
- `src/lib/db/schema.ts` — Drizzle schema (starts with a `health_check` table)
- `src/lib/env.ts` — typed env access
- `src/lib/sentry/*` + `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts`, `instrumentation-client.ts`
- `src/lib/auth.ts` — Better Auth (lazy) + generated auth schema
- `drizzle.config.ts`, `drizzle/` (migrations)
- `scripts/db.sh` — psql wrapper targeting the CNPG `-rw` service
- `scripts/merge-ready.sh` — per-reviewer attestation (ported)
- `.claude/commands/{ship,sprint,sprint-plan,sprint-loop,work-item}.md`, `.claude/skills/{process-sprint,process-sentry,work-item}.md`
- `CLAUDE.md`, `DEPLOY.md`, `docs/architecture/STRUCTURE.md`

**Homelab repo (`homelab/`):**
- `docker/kaelyns-academy/Dockerfile`, `docker/kaelyns-academy/.dockerignore`
- `.forgejo/workflows/build-kaelyns-academy.yml`
- `ansible/inventory/group_vars/all.yml` (add nothing — external domain via tunnel, not BIND)

**K3s-infra repo (`k3s-infra/`):**
- `k8s/kaelyns-academy/{namespace,deployment,service,ingressroute,cnpg-cluster,objectstore,scheduledbackup,kustomization}.yaml`
- `k8s/kaelyns-academy/sealedsecret-{db-creds,litellm,sentry,auth}.yaml`
- `k8s/argocd/applications/kaelyns-academy.yaml`
- `k8s/cloudflared/` (add a tunnel ingress entry for `kaelyns.academy`)

---

## Task 1: Archive v2 and scaffold the Next.js 16 app

**Files:**
- Move: existing `src/` → `_archive/v2-src/`
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`

- [ ] **Step 1: Archive the v2 source**

```bash
cd /Users/bryanli/Projects/joyfulhouse/websites/kaelyns-academy
mkdir -p _archive/v2
# Move source + configs out of the way (keep docs/, .git/)
git mv src _archive/v2/src 2>/dev/null || mv src _archive/v2/src
for f in package.json tsconfig.json next.config.* postcss.config.* tailwind.config.* components.json drizzle.config.*; do
  [ -e "$f" ] && (git mv "$f" "_archive/v2/$f" 2>/dev/null || mv "$f" "_archive/v2/$f")
done
ls _archive/v2
```
Expected: the old `src` and configs now live under `_archive/v2/`. `docs/` (curriculum + specs) is untouched.

- [ ] **Step 2: Initialize a fresh Next.js 16 app in place**

Create `package.json`:

```json
{
  "name": "kaelyns-academy",
  "version": "3.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  }
}
```

- [ ] **Step 3: Install the toolchain with bun**

Run (verify each is latest stable against npm before pinning — per global standards):

```bash
bun add next@latest react@latest react-dom@latest
bun add -d typescript @types/react @types/react-dom @types/node
bun add -d tailwindcss@latest @tailwindcss/postcss postcss
bun add -d vitest @vitejs/plugin-react
```
Expected: `bun.lock` created, `node_modules/` populated, no peer-dep errors.

- [ ] **Step 4: Create the minimal app shell**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "_archive"]
}
```

`next.config.ts`:
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // required for the slim Docker image in Task 8
  outputFileTracingExcludes: { "*": ["./_archive/**"] },
};

export default nextConfig;
```

`src/app/globals.css`:
```css
@import "tailwindcss";
```

`postcss.config.mjs`:
```js
export default { plugins: { "@tailwindcss/postcss": {} } };
```

`src/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kaelyn's Academy",
  description: "A joyful, adaptive learning platform for young children.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

`src/app/page.tsx`:
```tsx
export default function Home() {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui" }}>
      <h1>Kaelyn&apos;s Academy</h1>
      <p>v3 foundation is live. 🎈</p>
    </main>
  );
}
```

- [ ] **Step 5: Verify dev server and production build**

```bash
bun run build
```
Expected: build completes with `Route (app) / ` and `/api/health` (after Task 3) listed; exit 0. `.next/standalone/` is produced.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js 16 app (v3 foundation), archive v2"
```

---

## Task 2: Typed env + Vitest harness

**Files:**
- Create: `src/lib/env.ts`, `vitest.config.ts`, `src/lib/env.test.ts`, `.env.example`

- [ ] **Step 1: Write the failing test**

`src/lib/env.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getEnv } from "./env";

describe("getEnv", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  });

  it("returns a required var", () => {
    expect(getEnv("DATABASE_URL")).toContain("postgres://");
  });

  it("throws a clear error for a missing required var", () => {
    delete process.env.DATABASE_URL;
    expect(() => getEnv("DATABASE_URL")).toThrowError(/DATABASE_URL/);
  });

  it("returns the fallback for an optional var", () => {
    expect(getEnv("REDIS_URL", "memory")).toBe("memory");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node" } });
```
Run: `bun run test src/lib/env.test.ts`
Expected: FAIL — `Cannot find module './env'`.

- [ ] **Step 3: Implement `getEnv`**

`src/lib/env.ts`:
```ts
export function getEnv(key: string, fallback?: string): string {
  const value = process.env[key];
  if (value !== undefined && value !== "") return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable: ${key}`);
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `bun run test src/lib/env.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Create `.env.example`**

```bash
cat > .env.example <<'EOF'
# App
NODE_ENV=development

# Database (CNPG -rw service in prod; local Postgres in dev)
DATABASE_URL=postgres://kaelyns_academy:password@localhost:5432/kaelyns_academy

# AI (homelab LiteLLM gateway, OpenAI-compatible)
LITELLM_URL=http://litellm.litellm.svc.cluster.local:80/v1
LITELLM_API_KEY=
KAELYN_TUTOR_FAST_MODEL=claude-haiku-4-5
KAELYN_TUTOR_RICH_MODEL=claude-sonnet-4-6

# Sentry
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_SENTRY_ENVIRONMENT=development
SENTRY_AUTH_TOKEN=

# Better Auth
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000
EOF
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: typed env accessor + vitest harness"
```

---

## Task 3: Drizzle ORM + DB client + health table

**Files:**
- Create: `drizzle.config.ts`, `src/lib/db/schema.ts`, `src/lib/db/index.ts`, `src/lib/db/index.test.ts`, `drizzle/` (generated)
- Install: `drizzle-orm`, `postgres`, `drizzle-kit`

- [ ] **Step 1: Install Drizzle + driver**

```bash
bun add drizzle-orm postgres
bun add -d drizzle-kit
```

- [ ] **Step 2: Define the initial schema (a health-check table)**

`src/lib/db/schema.ts`:
```ts
import { pgTable, serial, timestamp, text } from "drizzle-orm/pg-core";

// Minimal table so migrations + the schema-drift canary have something real to check.
export const healthCheck = pgTable("health_check", {
  id: serial("id").primaryKey(),
  note: text("note").notNull().default("ok"),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 3: Build-safe lazy DB client**

`src/lib/db/index.ts`:
```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

let _client: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

// NEVER connect at module top-level (breaks `next build`). Connect on first call.
export function getDb() {
  if (_db) return _db;
  _client = postgres(getEnv("DATABASE_URL"), { max: 5, prepare: false });
  _db = drizzle(_client, { schema });
  return _db;
}

export { schema };
```

- [ ] **Step 4: drizzle-kit config**

`drizzle.config.ts`:
```ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
```

- [ ] **Step 5: Generate the first migration**

```bash
bun run db:generate
ls drizzle/*.sql
```
Expected: a migration file (e.g. `drizzle/0000_*.sql`) containing `CREATE TABLE "health_check"`.

- [ ] **Step 6: Write a build-safety test (no top-level connection)**

`src/lib/db/index.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";

describe("db client", () => {
  it("does not connect at import time", async () => {
    // Importing the module must not throw even with no DATABASE_URL set.
    delete process.env.DATABASE_URL;
    const mod = await import("./index");
    expect(typeof mod.getDb).toBe("function");
  });
});
```
Run: `bun run test src/lib/db/index.test.ts`
Expected: PASS (import succeeds without a DB).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: drizzle ORM, lazy build-safe db client, health_check table"
```

---

## Task 4: `/api/health` endpoint with schema-drift canary

**Files:**
- Create: `src/app/api/health/route.ts`, `src/lib/db/health.ts`, `src/lib/db/health.test.ts`

The ship canary curls this route; it must return 200 only if the DB is reachable AND a critical-column allowlist is present (catches a deploy whose bundle expects columns the live DB lacks).

- [ ] **Step 1: Write the failing test for the column-check helper**

`src/lib/db/health.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { missingColumns } from "./health";

describe("missingColumns", () => {
  const required = { health_check: ["id", "note", "checked_at"] };

  it("returns [] when all present", () => {
    const live = { health_check: ["id", "note", "checked_at", "extra"] };
    expect(missingColumns(required, live)).toEqual([]);
  });

  it("reports missing as table.column", () => {
    const live = { health_check: ["id"] };
    expect(missingColumns(required, live)).toEqual([
      "health_check.note",
      "health_check.checked_at",
    ]);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

Run: `bun run test src/lib/db/health.test.ts`
Expected: FAIL — `Cannot find module './health'`.

- [ ] **Step 3: Implement the helper + live introspection**

`src/lib/db/health.ts`:
```ts
import { sql } from "drizzle-orm";
import { getDb } from "./index";

export type ColumnMap = Record<string, string[]>;

// The critical-column allowlist. Grow this as the schema grows so a drifted
// deploy fails the canary instead of 500ing in front of a child.
export const REQUIRED_COLUMNS: ColumnMap = {
  health_check: ["id", "note", "checked_at"],
};

export function missingColumns(required: ColumnMap, live: ColumnMap): string[] {
  const missing: string[] = [];
  for (const [table, cols] of Object.entries(required)) {
    const liveCols = new Set(live[table] ?? []);
    for (const col of cols) if (!liveCols.has(col)) missing.push(`${table}.${col}`);
  }
  return missing;
}

export async function liveColumns(): Promise<ColumnMap> {
  const rows = await getDb().execute<{ table_name: string; column_name: string }>(
    sql`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
  );
  const map: ColumnMap = {};
  for (const r of rows) (map[r.table_name] ??= []).push(r.column_name);
  return map;
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `bun run test src/lib/db/health.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Implement the route**

`src/app/api/health/route.ts`:
```ts
import { NextResponse } from "next/server";
import { REQUIRED_COLUMNS, liveColumns, missingColumns } from "@/lib/db/health";

export const dynamic = "force-dynamic"; // never cache a health probe

export async function GET() {
  try {
    const missing = missingColumns(REQUIRED_COLUMNS, await liveColumns());
    if (missing.length > 0) {
      return NextResponse.json(
        { status: "degraded", reason: "schema-drift", missing },
        { status: 503 },
      );
    }
    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { status: "down", reason: err instanceof Error ? err.message : "unknown" },
      { status: 503 },
    );
  }
}
```

- [ ] **Step 6: Verify locally (needs a local Postgres + applied migration)**

```bash
# Assumes a local postgres; create the DB then migrate.
createdb kaelyns_academy 2>/dev/null || true
DATABASE_URL=postgres://$(whoami)@localhost:5432/kaelyns_academy bun run db:migrate
DATABASE_URL=postgres://$(whoami)@localhost:5432/kaelyns_academy bun run dev &
sleep 4
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/health
kill %1
```
Expected: `200`. (If no local Postgres is available, this is verified in Task 12 against the deployed CNPG DB instead — note that in the commit.)

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: /api/health with schema-drift canary"
```

---

## Task 5: Sentry instrumentation

**Files:**
- Create: `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts`, `instrumentation-client.ts`, `src/lib/capture.ts`, `src/lib/capture.test.ts`
- Modify: `next.config.ts`

- [ ] **Step 1: Install**

```bash
bun add @sentry/nextjs
```

- [ ] **Step 2: Config files (env-gated so dev without a DSN is a no-op)**

`sentry.server.config.ts` / `sentry.edge.config.ts` (identical body):
```ts
import * as Sentry from "@sentry/nextjs";
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
    tracesSampleRate: 0.1,
  });
}
```

`instrumentation-client.ts`:
```ts
import * as Sentry from "@sentry/nextjs";
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
  });
}
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
```

`instrumentation.ts`:
```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("./sentry.edge.config");
}
export { captureRequestError as onRequestError } from "@sentry/nextjs";
```

- [ ] **Step 3: Wrap `next.config.ts`**

Modify `next.config.ts` — wrap the export:
```ts
import { withSentryConfig } from "@sentry/nextjs";
// ...existing nextConfig...
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  // org/project/authToken come from env (SENTRY_AUTH_TOKEN) at build time.
});
```

- [ ] **Step 4: Write the failing test for `captureNonCritical`**

`src/lib/capture.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  withScope: (cb: (s: { setLevel: () => void }) => void) => cb({ setLevel: vi.fn() }),
}));
import { captureNonCritical } from "./capture";
import * as Sentry from "@sentry/nextjs";

describe("captureNonCritical", () => {
  it("captures with a warning level and never throws", () => {
    expect(() => captureNonCritical("thing failed", new Error("x"))).not.toThrow();
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Run, confirm fail; implement; confirm pass**

`src/lib/capture.ts`:
```ts
import * as Sentry from "@sentry/nextjs";

/** Non-fatal: visible in Sentry as a warning, never alerts, never throws. */
export function captureNonCritical(message: string, error: unknown): void {
  try {
    Sentry.withScope((scope) => {
      scope.setLevel("warning");
      Sentry.captureException(error instanceof Error ? error : new Error(`${message}: ${String(error)}`));
    });
  } catch {
    /* monitoring must never break the app */
  }
}
```
Run: `bun run test src/lib/capture.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify build still passes with Sentry wired**

Run: `bun run build`
Expected: exit 0 (no DSN in dev → Sentry no-ops; build does not fail).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: Sentry instrumentation + captureNonCritical"
```

---

## Task 6: Better Auth scaffold (minimal, lazy)

**Files:**
- Create: `src/lib/auth.ts`, `src/app/api/auth/[...all]/route.ts`
- Modify: `src/lib/db/schema.ts` (append auth tables), regenerate migration

> P0 only wires Better Auth so the deploy includes it and the schema/tables exist. Login UI and parent/child modeling land in P4.

- [ ] **Step 1: Install**

```bash
bun add better-auth
```

- [ ] **Step 2: Lazy auth instance**

`src/lib/auth.ts`:
```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb, schema } from "@/lib/db";
import { getEnv } from "@/lib/env";

let _auth: ReturnType<typeof betterAuth> | null = null;

export function getAuth() {
  if (_auth) return _auth;
  _auth = betterAuth({
    database: drizzleAdapter(getDb(), { provider: "pg", schema }),
    secret: getEnv("BETTER_AUTH_SECRET"),
    baseURL: getEnv("BETTER_AUTH_URL", "http://localhost:3000"),
    emailAndPassword: { enabled: true },
  });
  return _auth;
}
```

- [ ] **Step 3: Generate Better Auth's Drizzle tables**

```bash
bunx @better-auth/cli generate --output src/lib/db/auth-schema.ts
```
Then re-export from `schema.ts` (append): `export * from "./auth-schema";`
Expected: `user`, `session`, `account`, `verification` tables defined.

- [ ] **Step 4: Route handler**

`src/app/api/auth/[...all]/route.ts`:
```ts
import { getAuth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

const handler = toNextJsHandler(getAuth());
export const { GET, POST } = handler;
```

- [ ] **Step 5: Regenerate migration + verify build**

```bash
bun run db:generate
bun run build
```
Expected: a new migration adds the auth tables; build exits 0.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: Better Auth scaffold (lazy, email+password) + auth schema"
```

---

## Task 7: `scripts/db.sh` (CNPG psql wrapper)

**Files:**
- Create: `scripts/db.sh`

This replaces askcv.ai's Neon wrapper so the ported sprint/work-item SQL works unchanged. It targets the CNPG `-rw` Service inside the cluster; locally it falls back to `DATABASE_URL`.

- [ ] **Step 1: Write the script**

`scripts/db.sh`:
```bash
#!/usr/bin/env bash
# Run SQL against the kaelyns-academy Postgres. Prints an env banner on stderr.
# Usage: scripts/db.sh -c "SELECT 1;"   |   scripts/db.sh < file.sql
set -euo pipefail

ENV_NAME="${KAELYN_DB_ENV:-production}"
# In-cluster (CI/agents w/ kubeconfig) → exec psql in the CNPG primary pod.
# Locally → use DATABASE_URL.
if command -v kubectl >/dev/null 2>&1 && kubectl -n kaelyns-academy get cluster kaelyns-academy-db >/dev/null 2>&1; then
  echo "[db.sh] env=${ENV_NAME} via=cnpg-pod ns=kaelyns-academy" >&2
  PRIMARY="$(kubectl -n kaelyns-academy get pods -l cnpg.io/instanceRole=primary -o name | head -1)"
  exec kubectl -n kaelyns-academy exec -i "${PRIMARY#pod/}" -- psql -U kaelyns_academy -d kaelyns_academy "$@"
else
  : "${DATABASE_URL:?DATABASE_URL not set and no in-cluster CNPG found}"
  echo "[db.sh] env=local via=DATABASE_URL host=$(echo "$DATABASE_URL" | sed -E 's#.*@([^/:]+).*#\1#')" >&2
  exec psql "$DATABASE_URL" "$@"
fi
```

- [ ] **Step 2: Make executable + smoke test (local)**

```bash
chmod +x scripts/db.sh
DATABASE_URL=postgres://$(whoami)@localhost:5432/kaelyns_academy scripts/db.sh -c "SELECT 1 AS ok;"
```
Expected: prints the `[db.sh] env=local ...` banner and a `ok` row = 1 (if local PG present; otherwise verified in-cluster in Task 12).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore: scripts/db.sh CNPG psql wrapper"
```

---

## Task 8: Dockerfile (in the homelab repo)

**Files:**
- Create: `homelab/docker/kaelyns-academy/Dockerfile`, `homelab/docker/kaelyns-academy/.dockerignore`

> The image build context is the **app repo**, but the Dockerfile lives in `homelab` per the established convention. The Forgejo workflow (Task 9) checks out the app repo and points `-f` at this Dockerfile. Confirm the convention against `homelab/docker/comfyui/` while implementing.

- [ ] **Step 1: Write the multi-stage Dockerfile (Next standalone on bun)**

`homelab/docker/kaelyns-academy/Dockerfile`:
```dockerfile
# syntax=docker/dockerfile:1
FROM oven/bun:alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

FROM node:alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
RUN addgroup -g 1001 nodejs && adduser -u 1001 -G nodejs -S nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

`homelab/docker/kaelyns-academy/.dockerignore`:
```
node_modules
.next
_archive
.git
docs
**/*.test.ts
```

- [ ] **Step 2: Build locally to validate the Dockerfile**

```bash
cd /Users/bryanli/Projects/joyfulhouse/websites/kaelyns-academy
docker build -f /Users/bryanli/Projects/joyfulhouse/homelab/docker/kaelyns-academy/Dockerfile -t kaelyns-academy:test .
docker run --rm -e DATABASE_URL=postgres://x -p 3001:3000 kaelyns-academy:test &
sleep 5
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001/   # 200 (home page, no DB needed)
docker stop $(docker ps -q --filter ancestor=kaelyns-academy:test)
```
Expected: image builds; `/` returns 200.

- [ ] **Step 3: Commit (homelab repo)**

```bash
cd /Users/bryanli/Projects/joyfulhouse/homelab
git add docker/kaelyns-academy && git commit -m "feat: kaelyns-academy Dockerfile (Next standalone)"
```

---

## Task 9: Forgejo Actions build+deploy workflow (homelab repo)

**Files:**
- Create: `homelab/.forgejo/workflows/build-kaelyns-academy.yml`

> **Copy `homelab/.forgejo/workflows/build-comfyui.yml` first** and adapt — it has the exact action SHAs, Harbor login, and the k3s-infra SHA-pin step this cluster uses. The version below is the shape; reconcile pinned action SHAs and secret names against that reference.

- [ ] **Step 1: Write the workflow**

`homelab/.forgejo/workflows/build-kaelyns-academy.yml`:
```yaml
name: Build kaelyns-academy
on:
  push:
    branches: [master]
    paths:
      - "docker/kaelyns-academy/**"
      - ".forgejo/workflows/build-kaelyns-academy.yml"
  workflow_dispatch: {}

jobs:
  build-and-push:
    runs-on: [ubuntu-latest, amd64]
    steps:
      - name: Checkout homelab (Dockerfile)
        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd

      - name: Checkout app repo
        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd
        with:
          repository: joyfulhouse/kaelyns-academy
          path: app
          token: ${{ secrets.FORGEJO_TOKEN }}

      - name: Set image tag
        id: meta
        run: echo "tag=$(git -C app rev-parse --short HEAD)" >> "$GITHUB_OUTPUT"

      - name: Log in to Harbor
        uses: docker/login-action@650006c6eb7dba73a995cc03b0b2d7f5ca915bee
        with:
          registry: registry.joyful.house
          username: robot$ci-push
          password: ${{ secrets.HARBOR_ROBOT_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@f9f3042f7e2789586610d6e8b85c8f03e5195baf
        with:
          context: app
          file: docker/kaelyns-academy/Dockerfile
          push: true
          tags: |
            registry.joyful.house/homelab/kaelyns-academy:${{ steps.meta.outputs.tag }}
          cache-from: type=registry,ref=registry.joyful.house/homelab/kaelyns-academy:buildcache
          cache-to: type=registry,ref=registry.joyful.house/homelab/kaelyns-academy:buildcache,mode=max

      - name: Deploy — pin SHA in k3s-infra (ArgoCD auto-rolls)
        run: |
          set -euo pipefail
          SHA="${{ steps.meta.outputs.tag }}"
          WORK="$(mktemp -d)"
          git clone --depth 1 \
            "https://${{ secrets.K3S_INFRA_TOKEN }}@git.joyful.house/joyfulhouse/k3s-infra.git" "$WORK/k3s-infra"
          cd "$WORK/k3s-infra"
          sed -i -E "s#(registry\.joyful\.house/homelab/kaelyns-academy):[0-9a-f]{7,40}#\1:${SHA}#g" \
            k8s/kaelyns-academy/deployment.yaml
          if git diff --quiet; then echo "already pinned ${SHA}"; exit 0; fi
          git config user.email "homelab-ci@joyful.house"
          git config user.name "homelab image CI"
          git commit -am "kaelyns-academy: auto-deploy app@${SHA} (CI)"
          git push origin HEAD:main || { git pull --rebase origin main && git push origin HEAD:main; }
```

- [ ] **Step 2: Verify the secrets it references exist**

```bash
# Confirm these org/repo secrets exist in Forgejo (HARBOR_ROBOT_TOKEN, K3S_INFRA_TOKEN, FORGEJO_TOKEN).
# Compare against build-comfyui.yml which uses the same secrets.
grep -hoE 'secrets\.[A-Z_]+' /Users/bryanli/Projects/joyfulhouse/homelab/.forgejo/workflows/build-comfyui.yml | sort -u
```
Expected: the comfyui workflow references `HARBOR_ROBOT_TOKEN` and `K3S_INFRA_TOKEN`. If `FORGEJO_TOKEN` (for the cross-repo app checkout) doesn't exist yet, create it (a read token for the `kaelyns-academy` repo) — note this as a manual step for the operator.

- [ ] **Step 3: Commit (do not push yet — push happens in Task 12)**

```bash
cd /Users/bryanli/Projects/joyfulhouse/homelab
git add .forgejo/workflows/build-kaelyns-academy.yml && git commit -m "ci: build+deploy workflow for kaelyns-academy"
```

---

## Task 10: k3s-infra manifests + CNPG cluster

**Files (in `k3s-infra/k8s/kaelyns-academy/`):** `namespace.yaml`, `cnpg-cluster.yaml`, `objectstore.yaml`, `scheduledbackup.yaml`, `deployment.yaml`, `service.yaml`, `ingressroute.yaml`, `kustomization.yaml`

> **Read `k3s-infra/k8s/homelab-portal/` first** and mirror its structure (it's the closest reference: app + CNPG + IngressRoute + sealed secrets). Copy its `cnpg-cluster.yaml` and `objectstore.yaml` and rename. The manifests below are the correct shape; reconcile exact fields (CNPG image tag, B2 bucket path, sealed-secret controller cert) against that reference.

- [ ] **Step 1: Namespace + kustomization**

`namespace.yaml`:
```yaml
apiVersion: v1
kind: Namespace
metadata: { name: kaelyns-academy }
```
`kustomization.yaml`:
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: kaelyns-academy
resources:
  - namespace.yaml
  - cnpg-cluster.yaml
  - objectstore.yaml
  - scheduledbackup.yaml
  - sealedsecret-db-creds.yaml   # created in Task 11
  - sealedsecret-litellm.yaml
  - sealedsecret-sentry.yaml
  - sealedsecret-auth.yaml
  - deployment.yaml
  - service.yaml
  - ingressroute.yaml
```

- [ ] **Step 2: CNPG cluster (amd64-pinned — critical)**

`cnpg-cluster.yaml`:
```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: kaelyns-academy-db
  namespace: kaelyns-academy
spec:
  instances: 2
  affinity:
    podAntiAffinity: required
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
          - matchExpressions:
              - { key: kubernetes.io/arch, operator: In, values: [amd64] }  # arm64 CNPG is broken here
  bootstrap:
    initdb:
      database: kaelyns_academy
      owner: kaelyns_academy
      secret: { name: kaelyns-academy-db-creds }
  postgresql:
    parameters: { shared_buffers: "256MB", work_mem: "16MB" }
  storage: { size: 10Gi, storageClass: nfs-k3s }
  plugins:
    - name: barman-cloud.cloudnative-pg.io
      isWALArchiver: true
```

`objectstore.yaml` + `scheduledbackup.yaml`: copy from `k3s-infra/k8s/homelab-portal/`, change `serverName`/`destinationPath` to `.../cnpg/kaelyns-academy/` and the cluster ref to `kaelyns-academy-db`. (Reuses the existing `cnpg-b2-backup` secret — confirm its presence in the namespace or replicate the sealed secret.)

- [ ] **Step 3: Deployment (amd64 not required for the app, but pin imagePullSecret)**

`deployment.yaml`:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: kaelyns-academy, namespace: kaelyns-academy }
spec:
  replicas: 2
  selector: { matchLabels: { app: kaelyns-academy } }
  template:
    metadata: { labels: { app: kaelyns-academy } }
    spec:
      imagePullSecrets: [{ name: harbor-registry }]
      containers:
        - name: app
          image: registry.joyful.house/homelab/kaelyns-academy:REPLACE_ME  # CI pins the SHA
          ports: [{ containerPort: 3000 }]
          env:
            - { name: NODE_ENV, value: "production" }
            - { name: BETTER_AUTH_URL, value: "https://kaelyns.academy" }
            - { name: NEXT_PUBLIC_SENTRY_ENVIRONMENT, value: "production" }
            - name: DATABASE_URL
              value: "postgresql://kaelyns_academy:$(DB_PASSWORD)@kaelyns-academy-db-rw.kaelyns-academy.svc.cluster.local:5432/kaelyns_academy"
            - { name: DB_PASSWORD, valueFrom: { secretKeyRef: { name: kaelyns-academy-db-creds, key: password } } }
            - { name: LITELLM_URL, valueFrom: { secretKeyRef: { name: kaelyns-academy-litellm, key: url } } }
            - { name: LITELLM_API_KEY, valueFrom: { secretKeyRef: { name: kaelyns-academy-litellm, key: apiKey } } }
            - { name: NEXT_PUBLIC_SENTRY_DSN, valueFrom: { secretKeyRef: { name: kaelyns-academy-sentry, key: dsn } } }
            - { name: BETTER_AUTH_SECRET, valueFrom: { secretKeyRef: { name: kaelyns-academy-auth, key: secret } } }
          readinessProbe: { httpGet: { path: /api/health, port: 3000 }, initialDelaySeconds: 10, periodSeconds: 5 }
          livenessProbe: { httpGet: { path: /api/health, port: 3000 }, initialDelaySeconds: 30, periodSeconds: 10 }
          resources: { requests: { memory: "256Mi", cpu: "100m" }, limits: { memory: "1Gi", cpu: "1" } }
```
> Note: `REPLACE_ME` is the initial seed the CI `sed` first overwrites — pin it to a real built SHA before the first ArgoCD sync, or set `replicas: 0` until the first image exists. (Document which in the commit.)

`service.yaml`:
```yaml
apiVersion: v1
kind: Service
metadata: { name: kaelyns-academy, namespace: kaelyns-academy }
spec:
  selector: { app: kaelyns-academy }
  ports: [{ port: 80, targetPort: 3000 }]
```

`ingressroute.yaml` (internal host; public TLS is via the Cloudflare tunnel in Task 12 — entrypoint `web`, no TLS block here since Cloudflare terminates):
```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata: { name: kaelyns-academy, namespace: kaelyns-academy }
spec:
  entryPoints: [web]
  routes:
    - match: Host(`kaelyns.academy`) || Host(`kaelyns-academy.k3s.joyful.house`)
      kind: Rule
      services: [{ name: kaelyns-academy, port: 80 }]
```
> Confirm the entrypoint name (`web` vs `websecure`) and whether the cloudflared service hits Traefik on `:80` by reading `k3s-infra/k8s/homelab-portal/ingressroute.yaml` and the `cloudflared` configmap.

- [ ] **Step 4: Validate manifests**

```bash
cd /Users/bryanli/Projects/joyfulhouse/k3s-infra
kubectl kustomize k8s/kaelyns-academy >/dev/null && echo "kustomize OK"
```
Expected: `kustomize OK` (no schema errors). Sealed-secret files referenced here are created in Task 11.

- [ ] **Step 5: Commit (k3s-infra; push in Task 12)**

```bash
git add k8s/kaelyns-academy && git commit -m "feat: kaelyns-academy k8s manifests + CNPG cluster (amd64-pinned)"
```

---

## Task 11: Sealed secrets

**Files:** `k3s-infra/k8s/kaelyns-academy/sealedsecret-{db-creds,litellm,sentry,auth}.yaml`

> Requires the `kubeseal` client + cluster access. Mirror `k3s-infra/k8s/homelab-portal/sealedsecrets/`.

- [ ] **Step 1: DB credentials**

```bash
cd /Users/bryanli/Projects/joyfulhouse/k3s-infra
PW="$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)"
kubectl -n kaelyns-academy create secret generic kaelyns-academy-db-creds \
  --from-literal=username=kaelyns_academy --from-literal=password="$PW" \
  --dry-run=client -o yaml | kubeseal -o yaml > k8s/kaelyns-academy/sealedsecret-db-creds.yaml
```

- [ ] **Step 2: LiteLLM (the master key — from `k3s-infra/.secrets-do-not-commit/litellm-master-key`)**

```bash
LITELLM_KEY="$(cat .secrets-do-not-commit/litellm-master-key)"
kubectl -n kaelyns-academy create secret generic kaelyns-academy-litellm \
  --from-literal=url="http://litellm.litellm.svc.cluster.local:80/v1" \
  --from-literal=apiKey="$LITELLM_KEY" \
  --dry-run=client -o yaml | kubeseal -o yaml > k8s/kaelyns-academy/sealedsecret-litellm.yaml
```
> The Claude tutor route (`claude-haiku-4-5` / `claude-sonnet-4-6`) must be **added to the LiteLLM config** with an Anthropic key — that's a separate task in the P5 plan; P0 just wires the gateway credential.

- [ ] **Step 3: Sentry DSN + Better Auth secret**

```bash
kubectl -n kaelyns-academy create secret generic kaelyns-academy-sentry \
  --from-literal=dsn="<paste kaelyns-academy Sentry DSN>" \
  --dry-run=client -o yaml | kubeseal -o yaml > k8s/kaelyns-academy/sealedsecret-sentry.yaml

kubectl -n kaelyns-academy create secret generic kaelyns-academy-auth \
  --from-literal=secret="$(openssl rand -base64 32)" \
  --dry-run=client -o yaml | kubeseal -o yaml > k8s/kaelyns-academy/sealedsecret-auth.yaml
```
> Create the Sentry project `kaelyns-academy` first (Sentry UI or `sentry` CLI) to get the DSN. If deferring Sentry, set `replicas` to tolerate a missing DSN (the config is env-gated, so an empty DSN is a safe no-op) and omit the env wiring until the DSN exists.

- [ ] **Step 4: Commit**

```bash
git add k8s/kaelyns-academy/sealedsecret-*.yaml && git commit -m "feat: sealed secrets for kaelyns-academy (db, litellm, sentry, auth)"
```

---

## Task 12: ArgoCD app, Cloudflare tunnel, and end-to-end deploy

**Files:** `k3s-infra/k8s/argocd/applications/kaelyns-academy.yaml`; modify `k3s-infra/k8s/cloudflared/` configmap

- [ ] **Step 1: ArgoCD Application**

`k3s-infra/k8s/argocd/applications/kaelyns-academy.yaml`:
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: kaelyns-academy
  namespace: argocd
  finalizers: [resources-finalizer.argocd.argoproj.io]
spec:
  project: default
  source:
    repoURL: https://git.joyful.house/joyfulhouse/k3s-infra.git
    targetRevision: main
    path: k8s/kaelyns-academy
  destination: { server: https://kubernetes.default.svc, namespace: kaelyns-academy }
  syncPolicy:
    automated: { prune: true, selfHeal: true }
    syncOptions: [CreateNamespace=true]
```

- [ ] **Step 2: Cloudflare Tunnel entry for the apex**

Read `k3s-infra/k8s/cloudflared/configmap.yaml`, then add ingress entries routing `kaelyns.academy` (and `www.kaelyns.academy`) → `http://traefik.kube-system.svc.cluster.local:80` (mirror how `kaelyn.ai` is mapped). Add the matching CNAME/DNS in the Cloudflare dashboard for the `kaelyns.academy` zone pointing at the tunnel (`<tunnel-id>.cfargotunnel.com`).
Expected: `kubectl kustomize k8s/cloudflared >/dev/null` still succeeds.

- [ ] **Step 3: Build the first image (so the deployment has a real SHA to pull)**

```bash
# Push the homelab Dockerfile branch to trigger the Forgejo build, OR build+push manually:
cd /Users/bryanli/Projects/joyfulhouse/homelab && git push origin master
# Watch the Forgejo Actions run; confirm it pushed registry.joyful.house/homelab/kaelyns-academy:<sha>
# and committed the SHA pin into k3s-infra/k8s/kaelyns-academy/deployment.yaml.
```
Expected: Harbor has the image; `k3s-infra` `main` now pins a real SHA (CI commit "auto-deploy app@<sha>").

- [ ] **Step 4: Push k3s-infra so ArgoCD picks up the app**

```bash
cd /Users/bryanli/Projects/joyfulhouse/k3s-infra && git pull --rebase && git push origin main
kubectl apply -f k8s/argocd/applications/kaelyns-academy.yaml   # one-time registration
kubectl -n argocd get app kaelyns-academy -w
```
Expected: app becomes `Synced` / `Healthy`. CNPG cluster reports healthy:
```bash
kubectl -n kaelyns-academy get cluster kaelyns-academy-db
kubectl -n kaelyns-academy get pods
```

- [ ] **Step 5: Run the initial DB migration in-cluster**

```bash
# From the app repo with cluster access, run migrations against the live CNPG DB.
cd /Users/bryanli/Projects/joyfulhouse/websites/kaelyns-academy
# Option A: a one-shot Job (preferred, add to plan P1); Option B for P0 bootstrap:
kubectl -n kaelyns-academy exec -i deploy/kaelyns-academy -- sh -lc 'node -e "console.log(1)"' # sanity
scripts/db.sh < drizzle/0000_*.sql   # applies the health_check (+ auth) tables via the wrapper
```
Expected: tables created. (P1 replaces this with a proper pre-sync migration Job.)

- [ ] **Step 6: End-to-end canary**

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://kaelyns.academy/api/health
curl -s https://kaelyns.academy/ | grep -o "Kaelyn&apos;s Academy\|Kaelyn's Academy" | head -1
```
Expected: `/api/health` → `200`; home page HTML contains the title. **The pipeline is proven end-to-end.**

- [ ] **Step 7: Commit any tunnel/app config changes**

```bash
cd /Users/bryanli/Projects/joyfulhouse/k3s-infra
git add k8s/argocd/applications/kaelyns-academy.yaml k8s/cloudflared
git commit -m "feat: register kaelyns-academy ArgoCD app + cloudflare tunnel route" && git push origin main
```

---

## Task 13: Port the dev-workflow skills (ship/sprint/work-item/process-sentry)

**Files:** `.claude/commands/{ship,sprint,sprint-plan,sprint-loop,work-item}.md`, `.claude/skills/{process-sprint,process-sentry,work-item}.md`, `scripts/merge-ready.sh`

- [ ] **Step 1: Copy the skill/command set from askcv.ai**

```bash
cd /Users/bryanli/Projects/joyfulhouse/websites/kaelyns-academy
mkdir -p .claude/commands .claude/skills scripts
for f in sprint sprint-plan sprint-loop work-item ship; do
  cp /Users/bryanli/Projects/askcv.ai/.claude/commands/$f.md .claude/commands/ 2>/dev/null || true
done
for f in process-sprint process-sentry work-item sprint-plan sprint-loop; do
  cp /Users/bryanli/Projects/askcv.ai/.claude/skills/$f.md .claude/skills/ 2>/dev/null || true
done
cp /Users/bryanli/Projects/askcv.ai/scripts/merge-ready.sh scripts/ 2>/dev/null || true
```

- [ ] **Step 2: Apply the required adaptations** (these are the ONLY project-specific edits):

1. **DB access:** every `bash scripts/db.sh` call already matches our wrapper (Task 7) — but our wrapper has no `--dev`/`--staging` flags (single-tier homelab). Remove `--staging`/`--dev` branches and the three-tier migration steps from `process-sprint.md` (Step 7.5) and `ship.md`.
2. **`ship.md` deploy half (Steps 11–12):** delete the entire Vercel section (`vercel build`, deploy lock, `vercel deploy --prebuilt`, `vercel rollback`) and replace with the **homelab GitOps deploy** from `docs/specs/2026-06-13-platform-v3-design.md` §10:
   - merge to `main` (app repo) → the Forgejo build (Task 9) auto-builds + pins the SHA in `k3s-infra` → ArgoCD rolls.
   - migration runs as a pre-sync step against CNPG before pods take traffic.
   - canary: `curl https://kaelyns.academy/api/health` (200) + Sentry check; rollback = revert the SHA pin in `k3s-infra` (ArgoCD rolls back) or `kubectl -n kaelyns-academy rollout undo deploy/kaelyns-academy`.
3. **`process-sentry.md`:** change the org/project from `askcvai/askcv-ai` to the `kaelyns-academy` Sentry project; drop the three-tier environment table down to `production` only (or production + a future `staging`).
4. **Review companions:** keep the Codex/Gemini/Opus review gates as-is (those scripts — `scripts/codex-companion.sh`, `scripts/gemini-companion.sh` — are global; confirm they resolve in this repo or reference the global `/codex` `/gemini` skills instead).
5. **`work-item.md` / `process-sprint.md` schema:** the `work_items` + `sprints` tables don't exist yet — they're created in the **P6 plan**. Add a one-line note at the top of each: "Requires the bug-reporting schema from P6; until then these skills are inert."

- [ ] **Step 3: Verify the ship skill has no Vercel references left**

```bash
grep -niE 'vercel|neon|\.vercel' .claude/commands/ship.md && echo "STILL HAS VERCEL — fix" || echo "clean"
```
Expected: `clean`.

- [ ] **Step 4: Commit**

```bash
git add .claude scripts/merge-ready.sh
git commit -m "chore: port askcv.ai ship/sprint/work-item/process-sentry skills (homelab-adapted)"
```

---

## Task 14: Project CLAUDE.md + docs skeleton

**Files:** `CLAUDE.md`, `DEPLOY.md`, `docs/architecture/STRUCTURE.md`

- [ ] **Step 1: Write `CLAUDE.md`** (stack table, conventions, task routing) — model on askcv.ai's but for this stack:

```markdown
# Kaelyn's Academy

A pluggable, multi-user, AI-agentic learning platform for young children.
First program: Summer Bridge K→1 (see docs/curriculum/summer-k-to-grade1/).

## Tech Stack (Locked)
| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, RSC) |
| Package manager | bun (NEVER npm/yarn/pnpm) |
| Styling | Tailwind v4 + bespoke "Wonder Studio" system; static class maps only |
| Icons | Phosphor (never Lucide) |
| DB | CloudNativePG Postgres + Drizzle ORM |
| Auth | Better Auth (parent accounts → child profiles) |
| AI | LiteLLM gateway only (never direct provider SDKs) — via @/lib/ai/models |
| Errors | Sentry (@sentry/nextjs) |
| Hosting | homelab k3s via ArgoCD GitOps; Cloudflare Tunnel for kaelyns.academy |

## Non-negotiables
- Never call getDb()/getAuth() at module top-level (breaks `next build`).
- All AI via the LiteLLM gateway. No raw provider SDKs.
- Child surfaces: no PII beyond display name + birth month; no open-ended child↔LLM chat.
- Never `:latest` in deployed manifests. Never commit plaintext secrets (sealed-secrets only).
- Run `bun run typecheck && bun run lint && bun run build` before merge.

## Deploy
GitOps only — see DEPLOY.md. Push app → Forgejo CI → Harbor → k3s-infra SHA pin → ArgoCD.
Use /ship for the full gated pipeline.

## Docs
- docs/specs/2026-06-13-platform-v3-design.md — platform design
- docs/curriculum/summer-k-to-grade1/ — Program 01 curriculum
- docs/superpowers/plans/ — implementation plans (P0–P7)
- docs/architecture/STRUCTURE.md — directory map
```

- [ ] **Step 2: Write `DEPLOY.md`** documenting the GitOps flow + canary + rollback (summarize spec §10 + §12 with the exact commands from Task 12).

- [ ] **Step 3: Write `docs/architecture/STRUCTURE.md`** — the file-structure map from this plan's top section, kept current as phases land.

- [ ] **Step 4: Verify gates pass**

```bash
bun run typecheck && bun run lint && bun run build
```
Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md DEPLOY.md docs/architecture
git commit -m "docs: project CLAUDE.md, DEPLOY.md, STRUCTURE.md"
```

---

## Self-Review (completed against the spec)

**Spec coverage (P0 portion):** ✅ Next 16 scaffold (T1), Tailwind v4 (T1), Drizzle+CNPG (T3/T10), Better Auth scaffold (T6), Sentry (T5), `/api/health` canary (T4), `scripts/db.sh` (T7), Dockerfile (T8), Forgejo CI (T9), k3s-infra manifests + amd64-pinned CNPG + backups (T10), sealed secrets incl. LiteLLM (T11), ArgoCD app + Cloudflare tunnel + e2e deploy (T12), ported ship/sprint/sentry skills (T13), CLAUDE.md/docs (T14). Items intentionally deferred to later plans are labeled (content model → P1, design system → P2, learner UX → P3, full auth/parent → P4, agentic/LiteLLM Claude route → P5, work_items/sprints schema + feedback widget → P6).

**Placeholder scan:** No "TBD/TODO/implement later." `REPLACE_ME` in `deployment.yaml` is the documented CI-pinned image seed, not a plan gap (Task 12 Step 3 pins it). Infra steps that say "copy from `<reference path>` and reconcile pins" name the exact reference file — concrete, not vague.

**Type consistency:** `getEnv` (T2) used by `getDb` (T3), `getAuth` (T6); `getDb` used by `health.ts` (T4) and `auth.ts` (T6); `REQUIRED_COLUMNS`/`missingColumns`/`liveColumns` consistent T4 ↔ route; secret keys (`kaelyns-academy-db-creds.password`, `kaelyns-academy-litellm.{url,apiKey}`, `-sentry.dsn`, `-auth.secret`) match between T10 deployment env and T11 sealed-secret creation.

**Cross-repo ordering:** app commits (T1–T7, T13–T14) → homelab Dockerfile+CI (T8–T9) → k3s-infra manifests/secrets (T10–T11) → first image build then ArgoCD register + e2e (T12). Build-before-pin ordering preserved.
