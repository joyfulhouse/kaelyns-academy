# P1 — Cluster-wide, Redis-backed rate limiting

> **Status:** PLAN ONLY (no `src/` changes). Design + research for the P1 fix called out in
> `docs/superpowers/plans/2026-06-24-polish-broad.md` ("Cluster-wide rate limiting — acknowledged
> per-instance design; infra change") and `…/2026-06-26-polish-broad-pass4.md` ("Redis cluster-wide
> rate limiting (P1)").
>
> **Author date:** 2026-06-26
> **Scope:** the two AI/denial-of-wallet endpoints (`/api/practice`, `/api/tts`). No other behavior changes.

---

## 1. Problem statement

The current limiter (`src/lib/rate-limit.ts`) keeps **per-process, in-memory** counters. The app runs
**`replicas: 2`** behind Traefik (`k3s-infra/k8s/kaelyns-academy/deployment.yaml`), so a key's effective
cluster-wide allowance is `limit × replicas` — and grows linearly if we ever scale out. For the AI routes
this is weak protection against **denial-of-wallet** (LiteLLM token spend) and **resource exhaustion**
(Kokoro synth + MinIO writes): an anonymous caller hitting `/api/tts` can get `20 × 2 = 40` synths/min
cluster-wide, not the configured 20. The module header already documents this as a deliberate
*secondary* defense and names the fix ("a truly cluster-wide limit would need a shared store").

**Goal:** replace the shared counter with a **cluster-wide store (self-hosted Redis)** so the configured
limit is the cluster-wide limit, regardless of replica count — without violating build-safety, the
bun-only rule, or the no-disabled-lint-rules rule, and with a deliberate, documented fail mode.

---

## 2. Current state (precise)

### 2.1 The limiter — `src/lib/rate-limit.ts`
- **Algorithm:** **fixed window**. First request for a key opens a window of `windowMs`; up to `limit`
  hits are allowed inside it; the window resets when `now >= resetAt`. Classic fixed-window burst edge
  applies (up to `2× limit` across a window boundary), on top of the per-replica multiplier.
- **State:** a single module-level `const windows = new Map<string, Window>()` where
  `Window = { count: number; resetAt: number }`. Pruned **lazily** on access (`pruneExpired(now)`),
  never on a timer — so it is build-safe (no top-level connection, no `setInterval`).
- **Clock:** `Date.now()` only — which is why the test suite can drive it with `vi.useFakeTimers()`.
- **Public surface:**
  - `checkRateLimit(key: string, opts: { limit; windowMs }): { ok: boolean; retryAfterSec: number }`
    — **synchronous**. It both *records* the hit and *reports* allow/deny.
  - `retryAfterSec` is `Math.max(1, ceil((resetAt - now)/1000))` on denial, `0` when ok — fed straight
    into the `Retry-After` header.
- **Fail mode:** there is no external dependency, so it cannot "fail" — it always answers. On denial it
  is **fail-closed at the route** (returns 429). (Contrast with §3.3 below: once a *network* store is
  involved, "what happens when the store is down" becomes a real decision.)

### 2.2 Call sites
Both routes are `export const dynamic = "force-dynamic"` and call `checkRateLimit` **before** any model /
synth / storage work, choosing key + policy by auth state.

| Route | File | Account key | Anon key | Account policy | Anon policy |
|---|---|---|---|---|---|
| Practice (LiteLLM) | `src/app/api/practice/route.ts` | `practice:acct:${accountId}` | `practice:ip:${clientIp ?? "noip"}` | `{30, 60_000}` | `{10, 60_000}` |
| TTS (Kokoro+MinIO) | `src/app/api/tts/route.ts` | `tts:acct:${accountId}` | `tts:ip:${clientIp ?? "noip"}` | `{60, 60_000}` | `{20, 60_000}` |

- Auth state comes from `await getAccountOrNull()` (`@/lib/tenancy`). Signed-in → per-account key +
  generous policy; anonymous → per-IP key + tighter policy.
- **Anon IP source:** `clientIp(headers)` (`src/lib/request-ip.ts`) prefers `cf-connecting-ip`
  (Cloudflare-sanitized, unforgeable for external traffic), then `x-real-ip`, then first `x-forwarded-for`
  hop; `null` → bucketed as the literal `"noip"` so missing-IP callers share one window rather than skip
  the limit.
- On denial both routes return **429 with `Retry-After: <retryAfterSec>`** (practice returns a JSON
  `{error:"rate_limited"}` body; tts returns an empty body). **This 429-on-limit behavior must be
  preserved byte-for-byte.**
- Key namespacing is already per-route (`practice:` / `tts:` prefixes) and per-subject (`acct:` / `ip:`),
  so multiple limiters coexist in one keyspace without collision — this maps cleanly onto a Redis
  key prefix.

### 2.3 Build-safety baseline to imitate
`src/lib/db/index.ts` is the canonical lazy-factory: module-level `let _client/_db = null`, a `getDb()`
that constructs `postgres(getEnv("DATABASE_URL"), {…})` **on first call** and memoizes. `getEnv` throws
on a missing var. **No connection at import time.** Our Redis client must follow this shape exactly
(`getRedis()`), and additionally must not even open a TCP socket at construction — see §3.2.

---

## 3. Design

### 3.1 Algorithm — sliding window (preferred), with a pragmatic fallback

The brief prefers a **sliding window** (no fixed-window boundary burst). Two viable shapes:

1. **True sliding window via a sorted set** (`ZADD`/`ZREMRANGEBYSCORE`/`ZCARD` of request timestamps in a
   Lua script). Exact, but stores one member per request and is the heaviest option.
2. **Sliding-window *counter* (two-bucket interpolation)** — the algorithm `@upstash/ratelimit` uses:
   keep a counter for the current and previous fixed sub-window and weight the previous one by how far
   we are into the current window. ~Sliding accuracy at the cost of two `INCR`-class ops, no per-request
   members. This is the sweet spot for our low limits (10–60/min).

**Decision:** implement the **sliding-window counter** in a single Lua script (atomic, one round trip),
exposed through the **same `checkRateLimit`-shaped contract** but **async**. Rationale: it removes the
fixed-window boundary burst the current limiter has, keeps Redis memory O(keys) not O(requests), and is
easy to test deterministically (Lua takes `now` as an argument — see §8).

> **Library note:** `rate-limiter-flexible` (the recommended dependency, §4) ships a **fixed-window**
> `RateLimiterRedis`, *not* a sliding window. So the recommendation has two tiers (pick one in review):
> - **Tier A (recommended): `rate-limiter-flexible` fixed-window**, accepting that it is the *same
>   algorithm we have today* but now **cluster-wide** + with a battle-tested atomic Lua impl, reconnect
>   handling, and a first-class fail-mode knob (`insuranceLimiter`). This already fixes the actual P1
>   defect (the `×replicas` multiplier). Lowest risk, least custom code.
> - **Tier B: a small custom sliding-window-counter Lua script on `ioredis`** if review wants to also
>   close the fixed-window boundary burst. More control, but it's bespoke crypto-adjacent code we own
>   and must test hard.
>
> Recommend **shipping Tier A first** (it resolves the P1 ticket), and treating Tier B (sliding window)
> as a fast-follow only if the boundary burst is judged material at these limits. The §6 phased rollout
> assumes Tier A.

### 3.2 Build-safety (HARD project rule)

> Non-negotiable (CLAUDE.md): **NEVER** connect to any service at module top-level — it breaks
> `next build`. Lazy factories only, invoked per-request.

- New module `src/lib/redis.ts` mirroring `db/index.ts`:
  ```ts
  let _redis: Redis | null = null;
  export function getRedis(): Redis {
    if (_redis) return _redis;
    _redis = new Redis(getEnv("REDIS_URL"), {
      lazyConnect: true,            // ← no TCP until first command (build-safe + import-safe)
      enableOfflineQueue: false,    // fail fast instead of buffering when down (see fail mode)
      maxRetriesPerRequest: 1,      // bound per-command stalls; don't hang the request
      connectTimeout: 1000,
    });
    return _redis;
  }
  ```
  `ioredis`'s `lazyConnect: true` means construction opens **no socket**; the first command connects.
  Combined with "only ever called inside a route handler," nothing connects during `next build` or at
  import. (Confirmed against ioredis docs — see §10 Sources.)
- The limiter module must **not** call `getRedis()` at top level either. The `RateLimiterRedis` instance
  (Tier A) is itself created lazily inside the same factory and memoized:
  ```ts
  let _limiter: RateLimiterRedis | null = null;
  function getLimiter() { /* construct with storeClient: getRedis() on first use */ }
  ```
- **Never** import `ioredis` from a React Server Component, client component, or anything in the import
  graph of `next build`'s static analysis other than the two route handlers (which are `force-dynamic`).
- The rate-limit module stays free of any other top-level side effects (matches today).

### 3.3 Fail mode — the central decision

Today the limiter cannot fail. With Redis, a request can arrive while Redis is **unreachable** (restart,
network blip, OOM-kill). Two philosophies:

- **Fail-open** (allow the request when the store is down): preserves availability; the AI endpoints keep
  working during a Redis outage. Risk: an attacker who can *cause* a Redis outage removes the limiter.
- **Fail-closed** (deny / 429 when the store is down): preserves protection; but a Redis outage now takes
  down `/api/practice` and `/api/tts` entirely, even for legitimate signed-in parents.

**Recommendation: fail-OPEN to a *bounded* in-memory fallback, not fail-open-to-unlimited.** Concretely,
use `rate-limiter-flexible`'s `insuranceLimiter`: a `RateLimiterMemory` with the **same `points`/`duration`**.
When Redis errors, `consume()` transparently falls back to the in-memory limiter for that call. This gives:

- **Availability** during a Redis outage (parents can still use the app), AND
- **the previous per-instance protection as a floor** (we are never *worse* than today — each pod still
  caps at `limit` locally; we just lose the cluster-wide tightening while Redis is down).

This is strictly better than both naïve options: not "unlimited on outage," not "feature-down on outage."
It also matches the app's existing posture for *its own* dependencies (e.g. `/api/tts` 503s to browser-TTS
when Kokoro is down; DB read failures in the §8 gate fail *closed* because that's a **safety** decision,
whereas rate-limiting is an **abuse-mitigation** decision where availability wins). Set
`rejectIfRedisNotReady: false` (the default) so a not-yet-`ready` client uses the insurance limiter rather
than hard-rejecting.

> **Important caveat to record:** the §8 *child-safety* gate (ownership, enrollment, AI kill-switch) in
> `/api/practice` is unchanged and **stays fail-closed**. The rate limiter sits *in front of* that gate
> and is about cost/abuse, so its fail-open-to-insurance choice does not weaken child-safety — a request
> that passes the (degraded) limiter still has to pass the unchanged, DB-backed, fail-closed §8 gate.

- **Per-command latency guard:** `maxRetriesPerRequest: 1` + `connectTimeout: 1000` + a `Promise.race`
  timeout (~150–250 ms) around `consume()` so a slow/half-open Redis never adds latency in front of the
  model call. On timeout → treat as a store error → insurance limiter (i.e. same fail-open path).
- **Observability:** when the insurance path triggers, `captureNonCritical("rate-limit redis degraded", err)`
  (de-duped/throttled so an outage doesn't spam Sentry). This is how we *notice* a silent fail-open.

### 3.4 Redis key schema

- **Logical key (unchanged):** the route already passes a fully-qualified key (`practice:acct:…`,
  `tts:ip:…`). Reuse it verbatim as the limiter key so semantics are identical.
- **Physical key:** prefix everything with an app namespace to keep the homelab Redis multi-tenant-safe
  and easy to flush/inspect:
  - `rate-limiter-flexible` writes `${keyPrefix}:${key}`. Set `keyPrefix: "ka:rl"`.
  - Result: `ka:rl:practice:acct:<accountId>`, `ka:rl:tts:ip:<ip>`, etc.
  - (Tier B custom impl would use the same `ka:rl:<key>` convention, with the two sub-window counters
    under that key.)
- **TTL:** entries auto-expire after `duration` (+ `blockDuration` if used) so the keyspace is
  self-pruning — no manual cleanup, unlike the in-memory `pruneExpired`.
- **Separate Redis logical DB** (`/0` default is fine since the cluster Redis is app-dedicated, but the
  `ka:rl` prefix is the real isolation). The `REDIS_URL` may pin a db index if we later share the
  instance.

### 3.5 Public contract change: sync → async

`checkRateLimit` becomes **async** (`Promise<RateLimitResult>`), because a network round trip is now
involved. Both call sites already `await getAccountOrNull()` immediately before, so adding `await` is a
one-line change each. Keep the **return shape identical** (`{ ok, retryAfterSec }`) so the route code below
the call (the 429 + `Retry-After` block) is untouched. Map `rate-limiter-flexible` results:
- `consume(key, 1)` resolves on **allow** → `{ ok: true, retryAfterSec: 0 }`.
- it **rejects** with a `RateLimiterRes` on **deny** → `{ ok: false, retryAfterSec: Math.max(1, ceil(msBeforeNext/1000)) }`
  (preserving the current "never 0" flooring).
- it rejects with an `Error` (store failure, no insurance) → per §3.3 this won't happen because we always
  set an insurance limiter; defensively, treat an unexpected throw as **fail-open allow** + capture.

---

## 4. Library options (researched — latest stable as of 2026-06-26)

Versions pulled from the npm registry API (authoritative), newest first:

| Package | Latest stable | Last publish | Role |
|---|---|---|---|
| `rate-limiter-flexible` | **11.2.0** | 2026-06-08 | Rate-limit engine (Redis backend) |
| `ioredis` | **5.11.1** | 2026-06-04 | Redis client (works under `storeClient`) |
| `redis` (node-redis) | 6.0.1 | 2026-06-24 | Alt Redis client (needs `useRedisPackage:true`) |
| `@upstash/ratelimit` | 2.0.8 | 2026-01-12 | Rate-limit engine (Upstash-oriented) |
| `@upstash/redis` | 1.38.0 | 2026-06 | HTTP Redis client (Upstash / SRH proxy) |

### Option A — `rate-limiter-flexible` + `ioredis`  ✅ RECOMMENDED
- **What:** mature, zero-prod-dependency limiter; `RateLimiterRedis` uses **atomic Lua** (`EVAL`/`EVALSHA`)
  for the count, accepts an **`ioredis`** instance as `storeClient`, supports `keyPrefix`, `blockDuration`,
  and crucially **`insuranceLimiter`** (in-memory fallback when Redis errors) + `rejectIfRedisNotReady`.
- **Pros:** directly solves P1 (cluster-wide, atomic); first-class fail-mode story (exactly §3.3);
  handles reconnect; tiny surface; both deps are current and heavily used; `ioredis` `lazyConnect`
  satisfies our build-safety rule cleanly; deterministic to test (inject a memory limiter, or a real
  Redis via `currentTime`-controlled tests).
- **Cons:** default algorithm is **fixed window** (same boundary-burst class as today; cluster-wide now,
  but not a true sliding window). No built-in sliding-window mode → Tier B if we want that.
- **Fit:** best match for "self-hosted Redis, homelab, low limits, must not break build, deliberate fail
  mode, minimal code."

### Option B — `ioredis` + a hand-written sliding-window Lua script (no limiter lib)
- **What:** we own a small `EVAL` script (two-bucket sliding counter, §3.1) and the `getRedis()` factory.
- **Pros:** **true sliding window**; zero limiter dependency; total control over key schema + fail mode.
- **Cons:** bespoke concurrency-sensitive code we must test exhaustively (atomicity, TTL, clock); we
  re-implement reconnect/insurance ourselves; more review burden. Only worth it if the boundary burst at
  10–60/min is judged material.
- **Fit:** the **Tier B** upgrade path on top of Option A's infra; not the first cut.

### Option C — `@upstash/ratelimit` (+ self-hosted Redis)
- **What:** ergonomic limiter with a real **sliding-window** algorithm and multi-region support.
- **Pros:** true sliding window out of the box; clean API; well documented.
- **Cons:** **built around Upstash's HTTP Redis (`@upstash/redis`)**. Against a self-hosted `redis:alpine`
  you must run the **Serverless Redis HTTP (SRH) proxy** (an *extra* always-on deployment translating
  HTTP→RESP) or a non-Node adapter. That's a new moving part + failure surface in the homelab for no
  benefit here — we are not serverless and not on Upstash. The project's own spec already says "Redis
  (optional), falls back to in-memory" and the infra runs plain `redis:alpine`. **Rejected** on
  operational-fit grounds, not quality.
- **Fit:** great on Upstash/Vercel; wrong shape for this homelab.

### Option D — `redis` (node-redis v6) instead of `ioredis`
- **What:** the official client; `rate-limiter-flexible` supports it via `useRedisPackage: true`.
- **Pros:** official; modern.
- **Cons:** must `await client.connect()` explicitly (no `lazyConnect` equivalent) — so the lazy factory
  has to manage connect state more carefully to stay build-safe, and node-redis throws on commands before
  connect. `ioredis`'s `lazyConnect` is a cleaner fit for our "construct lazily, connect on first command,
  never at import" rule. **Not chosen**, but acceptable if there's a future reason to standardize on
  node-redis. (No other part of this repo uses Redis yet, so there's no existing client to match.)

### Recommendation
**Option A: `rate-limiter-flexible@^11` with `ioredis@^5` as `storeClient`**, **fixed-window** (Tier A),
**fail-open via an `insuranceLimiter` `RateLimiterMemory`**, behind a lazy `getRedis()`/`getLimiter()`
factory. It fixes the actual P1 defect (per-replica multiplier) with the least bespoke code and the
cleanest build-safety + fail-mode story. Revisit **Tier B (sliding window, Option B)** only if the
fixed-window boundary burst is deemed material at these limits.

---

## 5. Infra (k3s-infra repo — `k8s/kaelyns-academy/`)

The cluster already runs self-hosted Redis (`k8s/camera-transcription/redis.yaml`,
`redis:alpine@sha256:…`, ephemeral, `--maxmemory-policy allkeys-lru`). **Reuse that pattern**; do **not**
share that instance (different namespace/lifecycle) — deploy a dedicated one in `kaelyns-academy`.

### 5.1 New manifest — `k8s/kaelyns-academy/redis.yaml`
Modeled on the camera-transcription one (digest-pinned per the "never `:latest`" rule):
- `Deployment` `redis` (1 replica), `image: redis:alpine@sha256:<pin>`,
  `args: ["--save","", "--appendonly","no", "--maxmemory","64mb", "--maxmemory-policy","allkeys-lru"]`
  — **no persistence** (rate-limit counters are ephemeral; a restart just resets windows, which is
  acceptable and self-heals within one `duration`). 64mb is ample for these keys.
- `requests: {cpu: 25m, memory: 32Mi}`, `limits: {memory: 96Mi}` (smaller than the transcription buffer —
  our keyspace is tiny).
- amd64 not required for Redis (it has arm64 images), but to keep it co-located/simple it can run on any
  node; no special affinity/toleration needed.
- `Service` `redis` (ClusterIP, port 6379) → `redis.kaelyns-academy.svc.cluster.local:6379`.
- Add `redis.yaml` to `k8s/kaelyns-academy/kustomization.yaml` (data tier, before `deployment.yaml`).

### 5.2 Connection secret — sealed-secret
`REDIS_URL` carries no real secret for an in-cluster, network-policy-fenced Redis with no AUTH, **but**
the project rule is sealed-secrets for anything connection-ish and it future-proofs adding `requirepass`.
Two acceptable choices (pick in review):
- **Simplest:** treat `REDIS_URL` as **non-secret runtime config** and put it as a plain `env:` value in
  `deployment.yaml` (like `LITELLM_URL`, `AUDIO_ORIGIN`, `KOKORO_URL` already are) —
  `redis://redis.kaelyns-academy.svc.cluster.local:6379`. No password ⇒ nothing to seal.
- **Hardened (recommended):** enable `requirepass` on Redis (password from a sealed-secret mounted into
  the Redis pod) and store the full `redis://:<pw>@redis…:6379` as a **new sealed-secret**
  `kaelyns-academy-redis` (key `REDIS_URL`), wired via `envFrom: secretRef`. Mirror an existing file in
  `k8s/kaelyns-academy/sealedsecrets/` (e.g. `kaelyns-academy-litellm.yaml`) and add it to the
  kustomization + the deployment's `envFrom` list and the secret-map comment block.

Given the NetworkPolicy fence (below), the **simplest** option is defensible for P1; the **hardened** one
is the right end state. Either way: **never commit a plaintext password** — seal it (`kubeseal`).

### 5.3 Deployment env wiring — `k8s/kaelyns-academy/deployment.yaml`
- Add `REDIS_URL` (plain `env:` value, or `envFrom` the new sealed-secret per 5.2).
- No replica change (`replicas: 2` stays — that's the whole point: shared store makes 2 behave like a
  single cluster-wide limit).
- Optionally extend the `wait-for-db` init pattern with a tiny "wait-for-redis" init (or rely on
  `lazyConnect` + insurance limiter so a not-yet-ready Redis degrades gracefully rather than blocking
  startup — **preferred**, keeps pods starting even if Redis lags).

### 5.4 NetworkPolicy
- The existing `cnpg-db-ingress` policy only restricts **ingress to the CNPG pods** and leaves app egress
  open, so app→Redis works without change. **However**, add an explicit ingress policy for the Redis pod
  (defense-in-depth, matching the DB posture): allow `:6379` only from **intra-namespace** app pods. New
  small `NetworkPolicy` (e.g. in `redis.yaml` or `networkpolicy.yaml`) with `podSelector: {app: redis}`,
  `policyTypes:[Ingress]`, `from: namespaceSelector kaelyns-academy`.

### 5.5 Local dev
- `getEnv("REDIS_URL")` with **no fallback** would force every local run to have Redis. Two options:
  - Provide `REDIS_URL=redis://localhost:6379` in local `.env` and run `redis:alpine` via Docker, **or**
  - (lower-friction) give the factory a **dev-only in-memory mode**: if `REDIS_URL` is unset, the limiter
    uses a `RateLimiterMemory` directly (no Redis). The P0 plan already anticipated this exact ergonomics
    with `getEnv("REDIS_URL", "memory")`. **Recommended:** honor a `"memory"` sentinel / unset → memory
    limiter, so local dev and `next build` never need Redis, while prod always sets a real URL.

---

## 6. Files to change (list only — NOT edited here)

**App repo (`kaelyns-academy`):**
1. `package.json` — add `rate-limiter-flexible@^11` and `ioredis@^5` (via `bun add`; **bun only**).
   `bun.lock` updates accordingly.
2. **NEW** `src/lib/redis.ts` — lazy `getRedis()` factory (`ioredis`, `lazyConnect:true`, timeouts),
   mirroring `src/lib/db/index.ts`. No top-level connect.
3. `src/lib/rate-limit.ts` — replace in-memory impl with the Redis-backed limiter behind a lazy
   `getLimiter()` (Option A) + `insuranceLimiter` memory fallback; `checkRateLimit` becomes **async**,
   same return shape. Keep `RateLimitOptions`/`RateLimitResult` exports stable. Add the `"memory"` /
   unset dev fallback (§5.5).
4. `src/app/api/practice/route.ts` — `const limit = await checkRateLimit(...)` (add `await`). No other
   change; keys/policies/429/`Retry-After` untouched.
5. `src/app/api/tts/route.ts` — same one-line `await`.
6. `src/lib/rate-limit.test.ts` — rewrite for the async + store-backed limiter (see §8). Add a
   `src/lib/redis.test.ts` only if the factory has logic worth testing (mostly env wiring).
7. *(Docs)* note `REDIS_URL` in `CLAUDE.md` env/commands and `DEPLOY.md` (new dependency + secret).
   `src/lib/env.test.ts` already references `REDIS_URL` defaulting — reconcile with §5.5.

**Infra repo (`k3s-infra`):**
8. **NEW** `k8s/kaelyns-academy/redis.yaml` (Deployment + Service [+ NetworkPolicy]).
9. `k8s/kaelyns-academy/kustomization.yaml` — add `redis.yaml` (and the sealed-secret if hardened).
10. `k8s/kaelyns-academy/deployment.yaml` — add `REDIS_URL` env (and `envFrom` if sealed).
11. **NEW (if hardened)** `k8s/kaelyns-academy/sealedsecrets/kaelyns-academy-redis.yaml`.
12. *(maybe)* `k8s/kaelyns-academy/networkpolicy.yaml` — Redis ingress fence.

---

## 7. Risks + mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Build breaks** — Redis connecting at import/`next build`. | `lazyConnect:true`; factory only called inside `force-dynamic` route handlers; no top-level `getRedis()`. Verify with `bun run build` having **no** `REDIS_URL` set (must succeed via §5.5 memory fallback). |
| R2 | **Redis outage takes endpoints down** (if fail-closed). | Fail-**open to `insuranceLimiter`** (§3.3): never worse than today's per-pod cap; parents keep working; `captureNonCritical` surfaces the degrade. |
| R3 | **Silent fail-open** hides a Redis outage indefinitely. | Throttled Sentry capture on every fallback; optionally a `/api/health` signal or a metric. Document that "limiter degraded" ≠ "limiter off." |
| R4 | **Added latency** in front of the model call from a slow/half-open Redis. | `connectTimeout:1000`, `maxRetriesPerRequest:1`, `enableOfflineQueue:false`, and a ~200 ms `Promise.race` around `consume()` → timeout falls through to insurance. |
| R5 | **Behavior regression** (limits/keys/headers change). | Keep keys, policies, 429 body, and `Retry-After` flooring identical. Tier A is the *same algorithm*, just shared — low semantic delta. Shadow mode (§6 below) before enforcing. |
| R6 | **New infra dependency** to operate/upgrade. | Reuse the proven `redis:alpine` pattern already in-cluster; digest-pin; ephemeral (no PVC, no backup); renovate tracks the digest. |
| R7 | **Cross-replica clock skew** affecting windows. | Counting + TTL happen **in Redis** (single clock) via the limiter's Lua, not on the app pods — skew is irrelevant. |
| R8 | **Keyspace growth / memory** under IP churn. | `maxmemory 64mb` + `allkeys-lru` + per-key TTL = bounded; worst case LRU-evicts old windows (acceptable for a limiter). |
| R9 | **node-redis vs ioredis** mismatch with the lib. | Using `ioredis` (lib's default `storeClient`); no `useRedisPackage` flag needed. |
| R10 | **Lint rule pressure** (e.g. tempting `eslint-disable` for an `any` from the lib). | Lib ships its own types; if a type gap appears, model it properly — **never** disable a rule (CLAUDE.md). |

### Phased rollout
1. **Land infra first** (Redis Deployment/Service + secret/env) so `REDIS_URL` resolves in-cluster while
   the app still uses the in-memory limiter. Zero app-behavior change.
2. **Shadow mode** — deploy the Redis limiter computing allow/deny **but not enforcing**: still let the
   request through, just `captureNonCritical`/log when the *Redis* decision would differ from the
   in-memory one (or simply log "would 429"). Watch for a deploy or two: confirms Redis connectivity,
   key shape, latency, and that legit parents aren't tripped — **before** any user sees a new 429.
   (Gate behind an env flag, e.g. `RATE_LIMIT_ENFORCE=shadow|on`.)
3. **Enforce** — flip the flag so the Redis decision returns the 429. Keep the insurance fallback.
4. **(Optional) Tier B** — swap the engine for the custom sliding-window Lua if the boundary burst proves
   material. Same infra, same contract.
5. **Cleanup** — once enforced and stable, remove the shadow flag / dead in-memory path (the memory
   limiter stays *only* as the insurance fallback + dev mode).

---

## 8. Test plan (deterministic, no flakiness)

The current suite drives `Date.now()` with `vi.useFakeTimers()`. A network store changes the approach:

- **Unit — limiter logic against `RateLimiterMemory`:** the recommended lib lets us point the *same*
  `checkRateLimit` code path at an in-memory store for tests (inject the store, or run with `REDIS_URL`
  unset → memory mode per §5.5). Assert: allows up to `limit`; the `limit+1`-th denies; `retryAfterSec`
  is `>=1` and shrinks toward reset; distinct keys are independent; account vs anon policies. These mirror
  the existing four tests but on the new async API (`await checkRateLimit(...)`).
- **Determinism:** `rate-limiter-flexible` accepts a controllable clock for window math in memory mode;
  combined with `vi.useFakeTimers()` for any `Date.now()` use, window boundaries stay exact. For a custom
  Lua impl (Tier B), pass `now` as a **script argument** (never `redis.call('TIME')`) so tests inject
  time — this is the key trick that keeps a Redis limiter deterministic.
- **Fail-mode test:** simulate a store error (a stub `storeClient` whose `eval`/command rejects) and
  assert `consume()` transparently uses the `insuranceLimiter` (request still allowed up to the per-pod
  cap) and that `captureNonCritical` was called. This is the most important new test — it proves R2/R3.
- **Build-safety test (CI):** `REDIS_URL` **unset** → `bun run build` succeeds and `bun run typecheck`
  passes (guards R1). A grep/lint check that `src/lib/redis.ts` has no top-level `new Redis(...).connect()`
  and that `getRedis()` isn't called at module scope anywhere.
- **Route tests:** existing route tests that assert the 429 + `Retry-After` shape must keep passing with
  the async limiter (update mocks to `await`). Add one asserting the **account vs anon key/policy**
  selection is unchanged.
- **Integration (optional, gated):** a single test against a **real ephemeral Redis** (e.g.
  `redis:alpine` via testcontainers/Docker, skipped when unavailable) exercising true cross-"replica"
  sharing: two limiter instances sharing one Redis must enforce a *single* combined window — the literal
  P1 acceptance criterion. Mark it `it.skipIf(!process.env.REDIS_TEST_URL)` so the default `bun run test`
  stays hermetic.
- **Manual cluster verification (post-deploy, in DEPLOY.md):** with `replicas: 2`, hammer
  `/api/tts` past the anon limit and confirm the cluster-wide cap is the configured value (≈20/min), **not**
  ~40 — i.e. the multiplier is gone. Confirm `/api/health` stays 200 and Sentry shows no limiter-degraded
  events when Redis is healthy.

---

## 9. Open questions

1. **Sliding vs fixed (Tier A vs B):** ship `rate-limiter-flexible` fixed-window now (fixes the actual
   P1 multiplier with least code), or invest in the custom sliding-window Lua to also kill the
   boundary-burst? *Recommendation: ship Tier A; reassess Tier B with real traffic.* **← biggest decision.**
2. **Fail mode sign-off:** confirm **fail-open-to-insurance** is acceptable for these endpoints (vs strict
   fail-closed). Stakeholder call, but recommended given the unchanged fail-closed §8 child-safety gate
   sits behind it.
3. **Secret vs plain env for `REDIS_URL`:** enable Redis `requirepass` + sealed-secret now (hardened), or
   rely on the NetworkPolicy fence and keep `REDIS_URL` a plain env (simplest)? Recommend hardened as end
   state; plain is acceptable for the P1 cut.
4. **Local-dev ergonomics:** standardize on the `"memory"`/unset fallback (no local Redis needed) — does
   that satisfy the team, given `src/lib/env.test.ts` already references a `REDIS_URL` default? Reconcile.
5. **Enforcement flag:** is a `RATE_LIMIT_ENFORCE=shadow|on` env flag worth the small added complexity for
   the shadow-mode rollout, or do we go straight to enforce behind the insurance net?
6. **Future reuse:** other endpoints (auth, feedback widget in P6) may want the same limiter — should
   `checkRateLimit` move to a small generic module now so it's reusable, or stay scoped to these two
   routes until needed? (Lean: keep scoped; the contract already generalizes.)

---

## 10. Sources (researched 2026-06-26)

- npm registry API (latest stable + publish dates): `registry.npmjs.org/{ioredis,redis,rate-limiter-flexible,@upstash/ratelimit,@upstash/redis}`.
- `rate-limiter-flexible` wiki — *Redis*, *Options* pages: `storeClient`/`useRedisPackage`, atomic Lua
  (`+EVAL +EVALSHA`), `insuranceLimiter` (in-memory fallback on Redis error), `rejectIfRedisNotReady`,
  `keyPrefix`, `blockDuration`, fixed-window-from-first-request model, `RateLimiterMemory` as insurance.
- `ioredis` README — `lazyConnect` (no socket until first command), `defineCommand`/`EVAL`/`EVALSHA`.
- `@upstash/ratelimit` — sliding-window algorithm; built around `@upstash/redis` HTTP client (self-hosted
  needs the SRH proxy) → rejected on homelab operational-fit grounds.
- In-repo precedent: `k3s-infra/k8s/camera-transcription/redis.yaml` (digest-pinned `redis:alpine`,
  ephemeral, `allkeys-lru`); `src/lib/db/index.ts` (lazy factory pattern); `docs/specs/2026-06-13-platform-v3-design.md`
  (“Cache: Redis (optional), falls back to in-memory”); P0 plan’s `getEnv("REDIS_URL", "memory")`.
