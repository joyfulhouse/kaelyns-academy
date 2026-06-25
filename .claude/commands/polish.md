---
name: polish
description: Autonomous codebase polish workflow for Kaelyn's Academy that MERGES TO PRODUCTION — explores the app, identifies 10+ refinements, plans them into non-overlapping parallel worktrees, dispatches agent teams to implement, runs the project's merge-ready review gate on each branch, merges clean PRs to main, and lets homelab GitOps deploy with a canary. Invoke it when the user clearly wants the work done — "polish", "tighten up", "harden", "prepare for launch", "production readiness", "clean up for release" — optionally with a focus area (security, child-safety, admin, observability, performance, ux, accessibility, seo, content, tutor, brand, error-handling, hardening). A pure assessment request ("audit X", "what needs fixing?") gets the explore+identify report and STOPS before implementing or merging, unless the user clearly wants the full autonomous pass.
---

# Polish (Kaelyn's Academy)

Autonomous polish workflow. Explore the application, identify rough edges, plan fixes, implement in parallel worktrees, review each branch through the project's merge-ready gate, merge to main, and let GitOps deploy to production. This is a non-interactive workflow — never use AskUserQuestion. Research the best approach and use best judgement throughout.

> Homelab note: merging to `main` **auto-deploys to production** (`kaelyns.academy`) via Forgejo CI → Harbor → ArgoCD. There is no preview tier. Treat every merge as a production deploy; the canary in Step 6 is mandatory. See `DEPLOY.md`.

## Invocation & intent

Because this workflow **autonomously merges to production**, match the user's intent at invocation before running the whole thing:

- **Clear polish / harden / launch-prep intent** (or an explicit `/polish`): run the full workflow end-to-end (Steps 1–6).
- **Assessment-only request** ("audit the admin pages", "what's wrong with the parent dashboard?", "what needs fixing?"): run **Steps 1–2 only** — explore and present the prioritized findings table — then **stop**. Do not implement, merge, or deploy off a request that only asked for an evaluation. If the user then says "go fix it" / "polish it," continue from Step 3.

This intent check happens **once, at invocation**. Within a full run the workflow is non-interactive — never use AskUserQuestion.

## Scope Boundary (NON-NEGOTIABLE)

Polish is a **refinement pass over surfaces that already exist** — it hardens, completes, and tightens what's there. It does **not** introduce new product surface.

**Never create** in a polish run:
- A new **API endpoint or callable operation** — a new `src/app/**/route.ts`, a **new HTTP method export** (`GET`/`POST`/`PUT`/`PATCH`/`DELETE`/`HEAD`/`OPTIONS`) added to an existing `route.ts`, or a new **Server Action** (a `'use server'` function — whether a new exported action or one added inline to an existing file). Hardening an *existing* route/method/action with validation/auth/rate-limits is fine; adding a new one is not.
- A new **navigable page or feature route** (`src/app/**/page.tsx` for a destination that doesn't exist today), including new route-group segments under `(admin)`, `(auth)`, `(learner)`, `(parent)`.
- A new **path segment**, public URL, or product feature.

These expand attack surface and product scope — exactly what a polish pass must avoid. (A sibling project's landing-polish run once left an orphaned, unauthenticated `/api/public/ingestion-stats` endpoint behind — new surface born inside a "polish" pass. Don't repeat it.)

**Carve-outs — allowed, because they _complete an existing surface_ rather than create a new one:**
- Missing `loading.tsx`, `error.tsx`, or `not-found.tsx` route shells for a route that **already** has a `page.tsx`.
- Page `metadata` / OG tags, `sitemap.(ts|xml)`, `robots.(ts|txt)`, canonical URLs, structured data, web `manifest`/icons.
- A new Drizzle migration in `drizzle/` **only** when it is **expand-only / backward-compatible** and supports hardening an existing surface (e.g. adding a NOT-NULL-with-default column a current feature needs). Never a destructive migration. Grow `REQUIRED_COLUMNS` in `src/lib/db/health.ts` when a newly-required column must gate the canary.

If an improvement requires a genuinely new destination or API surface, **do not build it** — record it as a deferred item in the plan doc and move on. When in doubt, the test is: *does this file add new **product/feature** surface a user or client could navigate or call?* If yes, it's out of scope. (The carve-outs above are allowed even when they add a fetchable URL such as `/sitemap.xml` — they expose only metadata about surfaces that already exist.)

## Project rules every agent must respect (from CLAUDE.md)

These are the kaelyns-academy non-negotiables. Worktree and ship agents have **zero parent context**, so the relevant ones must be copied **verbatim** into every dispatched prompt:

- **bun** only — never npm/yarn/pnpm.
- **Phosphor** icons — never Lucide.
- **Tailwind v4** with **static class maps only** (JIT-safe — no dynamically-constructed class strings).
- **TypeScript strict**; **never** `@ts-ignore`/`@ts-expect-error`, **never** an `eslint-disable`, never silence a warning — fix the root cause.
- **Build-safety:** never call `getDb()` / `getAuth()` (or connect to any service) at **module top-level** — lazy factories, invoked per-request. This breaks `next build` otherwise.
- **All AI via the LiteLLM gateway** (`@/lib/ai/models`) — never a raw provider SDK.
- **Child-data posture (spec §8):** no child PII beyond display name + birth month; **no open-ended child↔LLM chat** — every child-facing AI output is bounded and **schema-validated server-side**.
- **Never `:latest`** in deployed manifests; **never commit plaintext secrets** (sealed-secrets only).
- Lint is `eslint .` (flat config) — **not** `next lint` (removed in Next 16).
- Gate before merge: `bun run lint && bun run typecheck && bun run test && bun run build`.

## Focus Areas

The user may provide a focus area as an argument or in their message. Scope exploration accordingly. Multiple areas can be combined. Without a focus area, scan broadly and prioritize the worst gaps.

| Focus | What to Investigate |
|---|---|
| `security` | Auth guards (Better Auth), input validation (zod), CSRF/XSS/SQLi, rate limiting, secret handling, CORS, headers, the `/admin` allowlist gate |
| `child-safety` | Spec §8: child-PII minimization, the AI-practice gate (per-enrollment **and** per-learner, server-enforced), bounded + schema-validated child-facing AI, no open-ended chat, COPPA export/delete |
| `admin` | `(admin)` studio completeness, role enforcement, curriculum lifecycle (draft/publish/archive), config validation |
| `observability` | Sentry coverage (`captureNonCritical`), `/api/health` schema-drift canary, logging, alerting gaps |
| `performance` | Bundle size, RSC vs client boundaries, N+1 Drizzle queries, missing indexes, caching, image/audio optimization |
| `ux` | Loading/empty/error states, form validation, mobile responsiveness, kid-surface flows — *refine existing flows; no new pages (see Scope Boundary)* |
| `accessibility` | ARIA, focus management, keyboard nav, color contrast, screen-reader support, `readAloud`/SR-live regions (critical for young children) |
| `seo` | `metadata`, OG images, structured data, sitemap, canonical URLs, heading hierarchy |
| `content` | Curriculum versioning/version-pin correctness, `assembleProgram`, activity-key uniqueness, learner enrollment rendering |
| `tutor` | LiteLLM gateway usage, generated-practice validation, gate fail-closed behavior, enrollment version pinning |
| `brand` | Wonder Studio consistency — fonts, color tokens, Phosphor icon usage, motion patterns |
| `error-handling` | Try/catch coverage, error boundaries, graceful degradation, fail-closed gates, user-facing messages |
| `hardening` | Input sanitization, rate limits, circuit breakers, timeout configs, data validation |
| *(no focus)* | Shallow scan of all areas, prioritize the worst gaps |

## Step 1: Explore

Launch 3 Explore agents in parallel (`subagent_type: "Explore"`), each targeting a different layer. Tailor the specific investigation to the focus area, but the structural split stays the same:

- **Agent 1 — Pages & Routes**: the `(admin)` / `(auth)` / `(learner)` / `(parent)` route groups and `src/app/api/*`, page completeness, placeholder content, missing `metadata`, TODO comments, missing `loading.tsx`/`error.tsx`/`not-found.tsx` shells.
- **Agent 2 — Components & UI**: Wonder Studio brand consistency (fonts, color tokens, Phosphor icons, motion), accessibility (incl. `readAloud`/SR-live), responsive behavior, empty/loading/error state coverage.
- **Agent 3 — Backend & Infrastructure**: `src/lib/*` modules, API routes, Drizzle schema + migrations, Better Auth flow, the LiteLLM tutor path, the §8 AI gate, error handling, rate limiting, `/api/health`, security posture.

Each agent returns the **15 most important files to read** plus a quality assessment with specific issues.

After agents return, **read the key files yourself** — you need first-hand understanding to prioritize well. Read at minimum:
- `src/app/layout.tsx` and the route-group layouts,
- `CLAUDE.md` and `docs/specs/2026-06-13-platform-v3-design.md` (source of truth; note §8),
- `docs/architecture/STRUCTURE.md` (it may lag the live tree — cross-check with `find src/app -type d`),
- any files the agents flagged as problematic.

## Step 2: Identify Items

Compile a table of **at least 10 concrete improvements**:

```
| # | Item | Severity | Files Affected | Worktree |
|---|------|----------|----------------|----------|
| 1 | Description | Critical/High/Medium | path/to/file.tsx | A |
```

**Severity**:
- **Critical** — Broken functionality, child-safety/§8 holes, security holes, data-loss risk, fail-open gates.
- **High** — Missing states/content/guards on *existing* features, placeholder content visible to users, poor UX on key flows.
- **Medium** — Inconsistencies, missing polish, improvement opportunities.

Every item must refine a surface that **already exists** (see Scope Boundary). A genuinely missing feature, route, or API is **out of scope** — record it as a deferred item in the plan doc; it does **not** count toward the 10-item minimum.

Group items by file affinity into worktree labels (A, B, C...). The rule: **no two worktrees modify the same file.** This prevents merge conflicts entirely.

## Step 3: Plan

Write a plan to `docs/superpowers/plans/YYYY-MM-DD-polish-<focus>.md`. For each worktree:

- Branch name (`fix/` or `feat/` prefix).
- Which polish items it contains.
- Every file to modify (and any carve-out file to create — see Scope Boundary) with specific instructions.
- Expected commits.
- A "Deferred (out of scope)" section listing the new-surface items you found but are NOT building.

Use TaskCreate to track each worktree as a task, plus a final "ship and merge" task blocked by all worktree tasks.

The plan is the thinking. Do not start implementation until the plan is complete.

## Step 4: Implement

Dispatch all worktrees simultaneously:

```
Agent tool with:
  isolation: "worktree"
  mode: "bypassPermissions"
  run_in_background: true
```

Each agent prompt must be **completely self-contained** because worktree agents have zero context from the parent conversation. Include in every prompt:

1. **Project rules verbatim** — the relevant non-negotiables from the "Project rules" section above (at minimum: bun, Phosphor, Tailwind static class maps, no `@ts-ignore`/`eslint-disable`, no module-top-level `getDb()`/`getAuth()`, AI via LiteLLM only, §8 child-data posture).
2. **Branch name** — the exact branch to create.
3. **Complete task list** — every file to modify (plus any carve-out file to create) with specific, actionable instructions and code snippets where intent could be ambiguous.
4. **Quality gates** — run `bun run typecheck` after changes; use conventional commit messages.
5. **Constraints + Scope Boundary verbatim** — copy the full Scope Boundary (not a summary). The agent must never add new callable surface: a new `route.ts`, a new HTTP method export in an existing `route.ts`, a new `page.tsx`, a new path segment, or a new Server Action. Any such need is recorded as a deferred item and is NOT implemented; hardening existing surfaces is allowed.
6. **Context files to read first** — which existing files to read so the agent matches current patterns.

## Step 5: Ship (review each branch — do NOT merge)

After all implementation agents complete, dispatch one ship-review agent per worktree, in parallel. Each runs the **same pre-merge gate that `/ship` enforces**, then stops before the merge. **Every ship prompt must include the Scope Boundary verbatim** — these agents edit the branch, so without it a "review fix" can reintroduce exactly the new surface this workflow forbids. Each agent:

1. Reviews the full diff (`git diff main...HEAD`) for correctness, security, §8 child-safety, brand consistency, and accessibility.
2. Runs the full merge-ready review gate (everything `merge-ready.sh` requires):
   - `bun run typecheck && bun run lint && bun run build`, and `bun run test`.
   - **Dead-code audit** (`knip`): `bun run audit:dead-code` — if that script isn't wired into `package.json` yet, treat it as clean and note it (same interim rule `/ship` uses).
   - **Docs check**: review the diff against `docs/architecture/STRUCTURE.md`; update it if structure changed (this backs the `docs` attestation).
   - Adversarial reviewers — **opus** (`pr-review-toolkit:code-reviewer`, max effort) and **codex** (`bash scripts/codex-companion.sh adversarial-review --wait --scope branch`) are required; **gemini** (`bash scripts/gemini-companion.sh review --wait --scope branch`) is advisory (never blocks). Then the **code-simplifier** on changed files.
3. **Fixes all findings** (every severity) — **but never by adding new surface**. A fix that would introduce a non-carve-out `route.ts`, a new HTTP method export, a new `page.tsx`, a new path segment, or a new Server Action is recorded as a deferred item, not implemented.
4. **Fails the branch** if its own review diff (`git diff main...HEAD`) adds any such new surface — reverts the offending change and reports it as deferred.
5. Stamps the merge-ready attestations for the branch HEAD, each with its required status:
   - `bash scripts/merge-ready.sh attest simplifier --status <no-op|applied>`
   - `... attest opus --status <clean|findings-fixed>` · `... attest codex --status <clean|findings-fixed>`
   - `... attest build` · `... attest docs --status <updated|no-op|deferred>` · `... attest knip --status <clean|findings-fixed>`
   - `... attest impeccable --status <clean|findings-fixed|skipped-no-frontend>` — required iff the branch diff touches frontend paths (`*.tsx`/`*.css`/`*.scss` or anything under `src/components/` or `src/app/`).

   Then validate with `bash scripts/merge-ready.sh check --pr <num>` once the PR exists. **There is no pre-merge enforcement hook in this repo** — `merge-ready.sh check` only runs when you invoke it, so treat its green result as a hard gate you must run yourself; never merge on a non-green check.
6. Pushes the branch and creates a PR via `gh pr create` with a summary, key decisions, and test plan.
7. Does **NOT** merge — reports completion with the PR URL.

## Step 6: Merge + deploy (production)

After all ship agents report completion, merge PRs to main **sequentially** (not in parallel — each merge changes main, and each merge triggers a production deploy):

1. Start with the smallest or least-conflict-prone PR.
2. Confirm the merge-ready gate passes (`bash scripts/merge-ready.sh check --pr <number>`), then merge: `gh pr merge <number> --merge --delete-branch`.
3. **Post-merge build gate**: after each merge, `git checkout main && git pull && bun run build`. If it fails, fix the break before merging the next PR (cascading breakage compounds otherwise). **Any build-fix commit is subject to the Scope Boundary** — re-check its diff and revert/defer any new surface; it also needs its own merge-ready attestations.
4. If a PR shows conflicts (because main moved):
   ```bash
   cd <worktree-path>
   git fetch origin main && git rebase origin/main
   # resolve conflicts
   git push --force-with-lease origin <branch>
   ```
   **Re-run the full review gate on the rebased HEAD** (build + opus + codex + simplifier + test, plus impeccable if frontend), re-check the Scope Boundary on the rebased diff, then re-stamp the attestations. Attestations are HEAD-pinned, so a rebase invalidates them — a re-stamp without re-running the gate certifies nothing. Then retry the merge.
5. **Deploy is automatic** once main moves: Forgejo CI builds the digest-pinned image → ArgoCD rolls. Watch it: `kubectl -n argocd get app kaelyns-academy -w` until `Synced` + `Healthy` (export `KUBECONFIG=~/.kube/config-k3s`). Migrations (expand-only) run pre-traffic.
6. **Canary (mandatory):** `curl -fsS -o /dev/null -w '%{http_code}\n' https://kaelyns.academy/api/health` MUST be `200` (it returns 503 on schema drift / DB-down). Spot-check key routes return 200; check Sentry for new errors in the 5 minutes post-roll (`process-sentry`). On failure, roll back per `DEPLOY.md` (revert the SHA-pin commit in `k3s-infra`, or `kubectl -n kaelyns-academy rollout undo deploy/kaelyns-academy`) — never run migrations after the traffic flip.
7. Clean up worktrees (`git worktree remove <path> --force`) and delete merged local branches (`git fetch --prune`).
8. Write a dated **post-polish report** to `docs/claude/` (e.g. `docs/claude/polish-<focus>-YYYY-MM-DD.md`) documenting what shipped, what was deferred (and why), and the canary result. If structure changed, update `docs/architecture/STRUCTURE.md`. Commit the docs on a branch, attest, PR, and merge it.

## Red Flags — You're Rationalizing

| Thought | Reality |
|---|---|
| "This codebase is too big to explore properly" | That's why you have 3 parallel explore agents. Use them. |
| "10 items is too many, let me just do 5" | 10 is the minimum. Polish means thoroughness. |
| "I'll skip the plan and just start fixing" | The plan prevents file conflicts between worktrees. Skip it and you'll waste time on merge conflicts. |
| "This worktree agent doesn't need all the project rules" | Worktree agents have ZERO parent context. Include everything or they'll violate conventions (npm, Lucide, module-scope `getDb`, dynamic Tailwind classes…). |
| "I'll merge all PRs at once to save time" | Parallel merges cause conflicts AND stack production deploys. Sequential is correct. |
| "The review step is overkill for small changes" | Small changes have small bugs. And nothing auto-enforces the gate here — run `merge-ready.sh check` yourself and don't merge on red. |
| "merge-ready.sh check is green, a hook must have my back" | There is NO pre-merge hook in this repo. The check only runs when you run it. It's your gate, not an automatic one. |
| "Let me fix this extra thing I noticed" | Stay in scope. Polish items are planned in Step 2. New items go in the next polish run. |
| "This route/endpoint is missing, let me add it" | Polish does NOT create new endpoints, pages, or paths — that's new surface. Refine what exists; defer new surface. See Scope Boundary. |
| "A small new `/api/...` helper makes this cleaner" | A new endpoint is new attack surface, even a small one. The orphaned `/api/public/ingestion-stats` started exactly this way. Don't. |
| "Typecheck passed, so it's fine" | Typecheck doesn't catch logic errors, missing error states, §8 gaps, or accessibility holes. The review and the build catch those. |
| "It merged, I'm done" | Merging deploys to the live pilot site. Run the `/api/health` canary and check Sentry — every time. |

## Principles

- **Refinement, not expansion** — Polish improves surfaces that already exist. It never adds new API endpoints, pages, or path segments; it only *completes* existing ones (loading/error shells, metadata, sitemap, expand-only migrations). Genuinely new surface is a feature run — record it as deferred. See the Scope Boundary.
- **Autonomy** — Never ask questions. Research the best approach. The user invoked this skill because they want results, not a conversation.
- **Depth over breadth** — 10 well-implemented fixes beat 30 shallow ones. Every fix should be complete with types passing and the build green.
- **Plan before code** — The plan is where the real decisions happen. Implementation is mechanical. A thorough plan prevents rework.
- **Parallel execution** — Worktrees running simultaneously is dramatically faster than sequential branches. The isolation model (no shared files) makes it safe.
- **Self-contained agents** — Worktree agents have zero parent context. Every prompt must stand alone with all rules, files, and instructions included. Skimping here causes convention violations.
- **Merge-ready discipline** — Every worktree passes the same gate `/ship` enforces (opus + codex review, simplifier, build, attestations) before merge. This repo has **no pre-merge enforcement hook**, so you must run `bash scripts/merge-ready.sh check --pr <num>` yourself and treat a non-green result as a hard stop. Attestations are HEAD-pinned — a rebase invalidates them, so re-run the gate and re-stamp.
- **Sequential merges, real deploys** — PRs merge one at a time because each merge changes main *and* deploys to production. Start with the smallest PR to minimize rebase work, build-gate after each, and canary the live site after the roll.
