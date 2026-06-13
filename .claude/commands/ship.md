---
description: "Ship it: simplify, review, commit, PR, review again, test, verify, merge, deploy to production via homelab GitOps, canary health check, and branch/worktree cleanup. Kaelyn's Academy homelab-specific workflow."
---

# Ship It (Kaelyn's Academy)

Project-specific ship workflow. Executes the full pipeline from code review through production deploy with post-deploy verification. This overrides the global `/global:ship-it` for this project.

## Pre-Flight: Readiness Dashboard

Before starting, display the current state:

```
╔══════════════════════════════════════════════════════╗
║                  SHIP READINESS                      ║
╠══════════════════════════════════════════════════════╣
║  Branch:     <current branch>                        ║
║  Ahead of main by: <N> commits                       ║
║  Changed files: <N>                                  ║
║  Typecheck:  [ ] Not run                             ║
║  Lint:       [ ] Not run                             ║
║  Simplifier: [ ] Not run                             ║
║  Review (Opus):   [ ] Not run                        ║
║  Review (Codex):  [ ] Not run                        ║
║  Review (Gemini): [ ] Not run                        ║
║  Tests:      [ ] Not run                             ║
║  Docs:       [ ] Not checked                         ║
╚══════════════════════════════════════════════════════╝
```

Run `git log --oneline main..HEAD` and `git diff --stat main...HEAD` to populate.

## Step 1: Typecheck + Lint + Build

```bash
bun run typecheck && bun run lint && bun run build
```

Fix any errors. Do not proceed with warnings unresolved. Update the dashboard.

**Why `bun run build` is required**: typecheck + lint do NOT catch every
Next.js compile-time error. The most common gap is `"use server"` files
exporting non-async values — TypeScript sees a normal const export but Next.js
fails with "The module has no exports at all" and breaks every consumer of
the file. Other build-only failures: Cache Components / `'use cache'`
boundary checks, Edge runtime constraints, server-only/client-only import
crossings, `next.config.ts` schema validation, and Sentry source map upload.
Never ship a build-broken main because the gate only ran tsc — never again.

## Step 2: Code Review — Pre-PR (NON-NEGOTIABLE)

**This step MUST NOT be skipped, abbreviated, or bypassed under any circumstances.** All three reviewers must run and complete. If a reviewer fails to start, retry once. If it still fails, report the failure and STOP — do not proceed without all three reviews.

Run all three reviewers **in parallel**:

1. **Opus code-reviewer** (Claude — max effort):
   Launch `pr-review-toolkit:code-reviewer` agent with `model: "opus"`. The agent must perform an exhaustive review — read every changed file in full, check against ALL CLAUDE.md rules, architecture conventions, security, correctness, and general code quality. Report ALL issues at every severity level (no confidence threshold filtering — override the agent's default ≥80 filter). This is a production gate review, not a quick scan.

2. **Codex adversarial review**:
   ```bash
   bash scripts/codex-companion.sh adversarial-review --wait --scope working-tree
   ```

3. **Gemini standard review**:
   ```bash
   bash scripts/gemini-companion.sh review --wait --scope working-tree
   ```

**All three must run.** If a reviewer fails to start or errors out, retry once. If it still fails after retry, STOP and report — do not proceed without attempting all three. However, if a reviewer runs successfully but returns no findings (empty output), that counts as a completed review — continue normally.

**Fix ALL issues found — every severity level, not just high confidence.** Even low-confidence findings should be addressed. Commit fixes. Re-run typecheck + lint after fixes.

When prompting the review agent, do NOT ask it to filter by severity. Ask it to report ALL issues it finds. You fix all of them. The only exception: if a finding is a **false positive** (the reviewer misunderstood the code or the issue doesn't actually exist), you may skip it — but document why it's a false positive in the commit message or inline comment.

## Step 3: Code Simplifier

Run the code-simplifier agent on all changed files (`git diff --name-only main...HEAD`) AFTER fixing review items. This catches complexity introduced by review fixes. Commit any simplifications with `refactor: simplify <description>`.

## Step 3.5: Impeccable Design Critique (frontend-touching changes only)

**Required if `git diff --name-only main...HEAD` includes any `*.tsx`/`*.css`/`*.scss` file or any path under `src/components/`, `src/app/`, or `src/templates/`.** Otherwise this step is skipped (and the merge gate auto-passes the impeccable attestation as `skipped-no-frontend`).

Invoke the impeccable design-system skill scoped to the changed frontend paths:

```
Skill("impeccable critique <changed-frontend-paths>")
```

> **Note**: PRODUCT.md/DESIGN.md + the design system land in P2; until then impeccable runs against general heuristics (spacing, colour contrast, typography, responsive layout, accessible markup, consistent component usage).

Fix every finding. Commit with `refactor(design): <description>` or `style: <description>`. The attestation is stamped during Step 8 alongside the other merge-ready attestations.

## Step 4: Commit, Push, Create PR

1. Stage all remaining changes
2. Commit with conventional commit message (`feat:`, `fix:`, `refactor:`)
3. Push branch to origin
4. Create PR: `gh pr create --base main`
5. PR body must include: Summary, Key decisions, Test plan

## Step 5: Post-PR Review (NON-NEGOTIABLE)

**This step MUST NOT be skipped, abbreviated, or bypassed under any circumstances.** This is the final gate before merge — all three reviewers must run at max effort against the full branch diff.

Run all three reviewers **in parallel**:

1. **Opus code-reviewer** (Claude — max effort):
   Launch `/code-review:code-review` on the PR URL with `model: "opus"`. Exhaustive review of the entire PR diff — read every file, check architecture, security, correctness, conventions, and ALL CLAUDE.md rules. No severity filtering. This is the final gate before production.

2. **Codex adversarial review**:
   ```bash
   bash scripts/codex-companion.sh adversarial-review --wait --scope branch
   ```

3. **Gemini adversarial review**:
   ```bash
   bash scripts/gemini-companion.sh adversarial-review --wait --scope branch
   ```

**All three must run.** If a reviewer fails to start or errors out, retry once. If it still fails after retry, STOP and report — do not proceed without attempting all three. However, if a reviewer runs successfully but returns no findings (empty output), that counts as a completed review — continue normally.

Fix ALL issues found. Commit and push.

## Step 5.5: Re-run Impeccable Critique (frontend-touching changes only)

If review fixes touched frontend paths (or this PR was already frontend-touching), re-run the impeccable critique skill on the post-fix diff. Adversarial review fixes can reintroduce design-system drift.

```
Skill("impeccable critique <changed-frontend-paths>")
```

Address findings. Commit with `style: <description>` and push.

For pure-backend PRs that didn't touch frontend in either pass, this step is skipped — the impeccable attestation will be stamped `skipped-no-frontend` in Step 8.

## Step 6: Final Simplifier Pass

Run code-simplifier again. This catches complexity introduced by review fixes. Commit and push if changes.

## Step 7: Run Tests

```bash
bun run test 2>/dev/null || echo "No test suite configured — skip"
```

If tests exist, ALL must pass. Fix failures, commit, push.

## Step 8: Verify (Evidence Required)

**You MUST run these commands and read their output before proceeding:**

```bash
bun run typecheck   # Must show zero errors
bun run lint        # Must show zero warnings
bun run build       # Must exit 0 — catches Next.js compile-time errors
                    # that typecheck cannot see (e.g. `"use server"` non-
                    # function exports, cache boundary violations)
```

Do NOT proceed to merge on faith. Run the commands. Read the output. Confirm zero errors.

## Step 8.5: Dead-Code Audit (knip)

`bun run audit:dead-code` is a required pre-merge attestor (once configured — skip if the script is not yet wired up in package.json; add a note to docs/claude/).

```bash
bun run audit:dead-code   # exit 0 = clean. exit 1 = findings to fix.
```

**If the audit exits 0** (clean): stamp `--status clean` in Step 10.

**If the audit exits 1** (findings): fix findings (remove dead exports, unused deps), re-run, stamp `--status findings-fixed`.

**If `bun run audit:dead-code` is not yet configured**, stamp `--status clean` with a note and add a work item to wire it up.

**Never silence findings with knip-ignore comments** — either fix the code or fix `knip.ts` to declare the missed entry/dep/binary with a comment.

## Step 9: Update Documentation

Check if any docs need updating per CLAUDE.md rules:
- New feature/route → `docs/architecture/STRUCTURE.md` (if it exists)
- Architecture decision → `docs/architecture/DECISIONS.md` (if it exists)
- New component/utility → relevant docs
- Convention change → `CLAUDE.md`

Commit and push doc updates if any.

## Step 10: Merge to Main

Confirm ALL of the following are true:
- [ ] Pre-PR review completed: Opus + Codex + Gemini (all three)
- [ ] Post-PR review completed: Opus + Codex + Gemini (all three)
- [ ] Impeccable critique completed (frontend-touching PRs only — Step 3.5 + Step 5.5)
- [ ] All review issues resolved (from all review passes including impeccable)
- [ ] Final simplifier pass clean
- [ ] Tests pass (or no test suite)
- [ ] Typecheck + lint clean (verified in Step 8)
- [ ] Dead-code audit clean (verified in Step 8.5)
- [ ] Docs up to date

Then attest each reviewer (stamps the current HEAD into `.merge-ready/<reviewer>`)
and merge. `touch .merge-ready` no longer works — `.merge-ready` is now a
directory of per-reviewer attestations, and the pre-merge hook validates each
stamped HEAD against the PR branch's current HEAD.

```bash
bash scripts/merge-ready.sh attest simplifier --status <no-op|applied>
bash scripts/merge-ready.sh attest opus --status <clean|findings-fixed>
bash scripts/merge-ready.sh attest codex --status <clean|findings-fixed>

# Frontend-touching PRs only — see Step 3.5 / 5.5. Skip line below for
# pure-backend PRs and use --status skipped-no-frontend instead.
bash scripts/merge-ready.sh attest impeccable --status <clean|findings-fixed|skipped-no-frontend>

bash scripts/merge-ready.sh attest build
bash scripts/merge-ready.sh attest docs --status <updated|no-op|deferred>

# Dead-code audit — Step 8.5 produced this result.
bash scripts/merge-ready.sh attest knip --status <clean|findings-fixed>

gh pr merge --merge --delete-branch
git checkout main && git pull origin main
```

## Step 11: Deploy to Production (homelab GitOps — NOT Vercel)

After merge to `main`, deploy is automatic via GitOps — there is no `vercel deploy`:

1. Forgejo Actions (`homelab/.forgejo/workflows/build-kaelyns-academy.yml`) detects the merge, builds the image, pushes to Harbor (`registry.joyful.house/homelab/kaelyns-academy:<sha>`), and pins `<sha>` into `k3s-infra/k8s/kaelyns-academy/deployment.yaml`.
2. ArgoCD detects the k3s-infra change (~30s) and performs a rolling update.
3. **Migrations run BEFORE traffic:** pending Drizzle migrations apply to `kaelyns-academy-db` as a pre-sync step before new pods take traffic. Migrations MUST be expand-only / backward-compatible so the previous pods keep working until the roll completes.

Wait for sync: `kubectl -n argocd get app kaelyns-academy -w` until Synced + Healthy.

> **P6 note**: The Forgejo Actions workflow + ArgoCD app are deploy-gate items (T8–T12 in the P0 plan). Until they land, Step 11 is manual: build the Docker image locally, push to Harbor, and update the deployment manifest by hand.

## Step 12: Canary Health Check

- `curl -fsS -o /dev/null -w '%{http_code}\n' https://kaelyns.academy/api/health` → MUST be `200`. (It returns 503 on schema drift or DB-down — see src/lib/db/health.ts.)
- Spot-check key routes return 200.
- Check Sentry for new errors in the 5 minutes post-roll (use the process-sentry skill).

### DB migration confirmation

Before the deploy (or confirming it succeeded), verify migrations ran:

```bash
bash scripts/db.sh -c "SELECT * FROM drizzle_migrations ORDER BY created_at DESC LIMIT 5;"
```

`scripts/db.sh` targets the in-cluster CNPG primary (or local `DATABASE_URL`); it prints an env banner — confirm it points at the right database before running.

> No three-tier model: this is a single-tier homelab project. `scripts/db.sh` runs against the one CNPG cluster. There are no `--dev`/`--staging`/`--prod` flags.

### Canary failure / rollback

- Revert the SHA-pin commit in `k3s-infra` (ArgoCD rolls back to the previous image), OR `kubectl -n kaelyns-academy rollout undo deploy/kaelyns-academy`.
- NEVER run migrations after the traffic flip.

## Step 13: Branch & Worktree Cleanup

After a successful canary (Step 12 passed), clean up stale branches and worktrees. **Run autonomously** — any branch whose PR is MERGED or CLOSED is objectively safe to delete, regardless of whether it came from the current ship or a prior one. Only branches with open PRs, no PR at all, or active worktrees need judgment.

### 13a. Prune stale remote tracking refs

Always start here — this removes local references to branches already deleted upstream:

```bash
git fetch --prune
```

### 13b. Categorize worktrees

```bash
git worktree prune
git worktree list | tail -n +2
```

For each non-main worktree, determine its PR state:

```bash
git worktree list | tail -n +2 | while read path commit branch; do
  branch_name=$(echo "$branch" | tr -d '[]')
  state=$(gh pr list --head "$branch_name" --state all --json state --jq '.[0].state' 2>/dev/null)
  dirty=$(cd "$path" && git status --short 2>/dev/null | wc -l | tr -d ' ')
  echo "$path|$branch_name|$state|$dirty"
done
```

**Auto-remove** worktrees where:
- PR state is `MERGED` or `CLOSED`
- AND dirty count is 0 (or only `?? node_modules`)

```bash
git worktree remove <path>
```

**Ask the user** about worktrees where:
- Dirty count > 0 with non-node_modules changes (may contain uncommitted work)
- PR state is `OPEN` (active work)
- No PR state at all (unknown)

### 13c. Categorize branches (fast, parallel)

The slow path is sequential `gh pr list` calls. Use `xargs -P 8` to parallelize.

```bash
# Step 1: Regular-merged branches (fast — no gh calls needed)
git branch --merged main | grep -v '^\*\|^  main$' | sed 's/^  //' > /tmp/ship-regular-merged.txt

# Step 2: Local branches that still need PR check (not regular-merged)
git branch | sed 's/^[* ]*//' | grep -v '^main$' | grep -vFxf /tmp/ship-regular-merged.txt > /tmp/ship-unmerged-locals.txt

# Step 3: Parallel PR state check for unmerged locals
cat /tmp/ship-unmerged-locals.txt \
  | xargs -I {} -P 8 sh -c 'echo "{}|$(gh pr list --head {} --state all --json state --jq ".[0].state" 2>/dev/null)"' \
  > /tmp/ship-local-states.txt

# Step 4: Same for remote branches (excludes protected refs)
git branch -r | grep -v 'HEAD\|origin/main\|origin/release\|origin/production' \
  | sed 's|^ *origin/||' > /tmp/ship-remote-branches.txt

cat /tmp/ship-remote-branches.txt \
  | xargs -I {} -P 8 sh -c 'echo "{}|$(gh pr list --head {} --state all --json state --jq ".[0].state" 2>/dev/null)"' \
  > /tmp/ship-remote-states.txt
```

### 13d. Delete safe branches autonomously

Any branch whose PR is MERGED or CLOSED is safe to delete — the local copy is cruft. Do NOT ask.

```bash
# Regular-merged (git knows about these — safe with -d)
xargs -r git branch -d < /tmp/ship-regular-merged.txt

# Squash-merged locals (git can't see the merge — force with -D)
grep '|MERGED$\||CLOSED$' /tmp/ship-local-states.txt | cut -d'|' -f1 | xargs -r git branch -D

# Remote branches whose PRs are merged/closed (parallel delete)
grep '|MERGED$\||CLOSED$' /tmp/ship-remote-states.txt | cut -d'|' -f1 \
  | xargs -I {} -P 8 git push origin --delete {} 2>&1 | tail -20
```

Branches with `OPEN` PR state or no PR state remain — see 13e.

### 13e. Handle ambiguous branches

List branches that were NOT auto-deleted:

```bash
echo '=== Locals with OPEN PRs (keep) ==='
grep '|OPEN$' /tmp/ship-local-states.txt | cut -d'|' -f1

echo '=== Locals with no PR (ambiguous) ==='
grep '|$' /tmp/ship-local-states.txt | cut -d'|' -f1

echo '=== Remotes with OPEN PRs (keep) ==='
grep '|OPEN$' /tmp/ship-remote-states.txt | cut -d'|' -f1

echo '=== Remotes with no PR (ambiguous) ==='
grep '|$' /tmp/ship-remote-states.txt | cut -d'|' -f1
```

- **OPEN PRs**: leave alone, report as "kept".
- **No PR**: report but do NOT delete. These may be protected refs or branches that were never pushed. Use `AskUserQuestion` only if the user explicitly asked for aggressive cleanup — otherwise leave them.

### 13f. Report cleanup results

```bash
echo "Remaining local branches:  $(git branch | wc -l | tr -d ' ')"
echo "Remaining remote branches: $(git branch -r | wc -l | tr -d ' ')"
echo "Remaining worktrees:       $(git worktree list | wc -l | tr -d ' ')"
rm -f /tmp/ship-*.txt
```

Report the delta (before → after) in the final summary so the user can see the cleanup impact.

## Ship Complete

Report final status:

```
╔══════════════════════════════════════════════════════╗
║                  SHIP COMPLETE                       ║
╠══════════════════════════════════════════════════════╣
║  PR:         #NNN (merged)                           ║
║  Deploy:     https://kaelyns.academy                 ║
║  Canary:     PASS / FAIL                             ║
║  Cleanup:    <N> local + <N> remote branches pruned  ║
║  Duration:   ~Nm                                     ║
╚══════════════════════════════════════════════════════╝
```
