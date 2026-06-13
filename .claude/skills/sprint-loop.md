---
name: sprint-loop
description: Continuously execute sprints back-to-back from the main thread until all sprints are complete. Wave planning, parallel worktree-agent dispatch, PR reviews, sequential merges, and /ship all run in the main thread (sub-agents are only spawned at the wave level for item implementation and PR review). Automatically activates the next planning sprint after each completes. When no sprints remain, runs sprint planning for any remaining backlog items.
---

# Sprint Loop

> ⚠️ Requires the bug-reporting schema (work_items/sprints) from the P6 plan; until that lands, these skills are inert.

This skill orchestrates multiple sprints back-to-back **from the main thread**. The main thread is the orchestrator: it activates each sprint, runs `process-sprint.md` Steps 0-8 directly, and then advances to the next sprint.

> **Database access**: All `bash scripts/db.sh` calls below target the in-cluster CNPG primary (or local `DATABASE_URL`). The wrapper prints a `[db.sh]` env banner on stderr. This project is single-tier (no dev/staging/prod branches).

## Architecture: Main-Thread Orchestration

Sprint loop runs **entirely in the main thread**. Each sprint's wave planning, parallel agent dispatch, review coordination, merging, and `/ship` happen at the top level — NOT inside a sub-agent.

**Why main-thread, not per-sprint subagents:**

- **Sub-agents cannot spawn sub-agents.** If we delegated a whole sprint to a sub-agent, it could not launch the parallel worktree agents that Step 2.6 Phase A requires — wave parallelism would collapse to sequential execution.
- The wave model already isolates the heavy work: worktree agents (Phase A) and PR review agents (Phase C) are sub-agents and consume the bulk of tokens.

**Sub-agent boundaries (the only places we spawn agents):**
- Phase A of each wave → one worktree agent per item group (`isolation: "worktree"`, max 4 in parallel)
- Phase C of each wave → per PR: one simplifier sub-agent, then three parallel review sub-agents (Opus / Codex / Gemini-advisory)

Everything else — sprint activation, wave planning, sequential merges, DB updates, branch cleanup, `/ship` invocation — happens directly in the main thread.

## Step 0: Parse Arguments

- No args or `all` → loop until all sprints complete
- A number (e.g., `2`) → execute at most N sprints then stop

## Step 1: Sprint Discovery

Query the database to find sprints to execute:

```bash
bash scripts/db.sh -c "
  SELECT id, name, status, capacity,
    (SELECT COUNT(*) FROM work_items WHERE sprint_id = s.id AND dev_status NOT IN ('done', 'wontfix')) as remaining
  FROM sprints s
  WHERE status IN ('active', 'planning')
  ORDER BY
    CASE status WHEN 'active' THEN 0 WHEN 'planning' THEN 1 END,
    start_date ASC;"
```

Build the queue:
1. **Active sprint first** (if one exists with remaining items)
2. **Planning sprints** in start_date order (will be activated one at a time)

If no active or planning sprints exist, go to Step 4 (sprint planning).

Present the queue to the user, then immediately start — no confirmation needed.

## Step 2: Execute Sprint (Loop Body)

For each sprint in the queue, the **main thread** runs the full process-sprint workflow. Do NOT spawn a sub-agent for the sprint as a whole.

### 2a. Activate if planning

```bash
bash scripts/db.sh -c "
  UPDATE sprints SET status = 'active', updated_at = NOW()
  WHERE id = '<sprint-id>' AND status = 'planning'
  RETURNING id, name, status;"
```

### 2b. Pre-flight checks

**Migration conflict prevention**: Check the current max migration number. If any sprint items may need migrations, pre-assign numbers to avoid collisions between parallel worktree agents:
```bash
ls -1 drizzle/ | sort | tail -5
```

**Database target confirmation**: Verify targeting before any DB mutations:
```bash
bash scripts/db.sh -c "SELECT current_database(), inet_server_addr();" 2>&1 | head -3
```

**Main worktree clean**: Ensure no uncommitted changes or stale stash:
```bash
git status --short && git stash list
```

### 2c. Run process-sprint Steps 0-8 directly in the main thread

Open `.claude/skills/process-sprint.md` and follow it step-by-step from Step 0 through Step 8, in the main thread. Key points:

- **Step 0** (Load active sprint): already done — the sprint just got activated in 2a.
- **Step 2.5** (Dependency analysis & waves): group items by page/component affinity, build waves.
- **Step 2.6 Phase A** (Launch parallel worktree agents): this is the **only** place sub-agents get spawned during item implementation. Launch up to 4 worktree agents in a single message (parallel). Each uses `isolation: "worktree"`.
- **Step 2.6 Phase C** (Per-PR review pipeline → merge-as-they-arrive): for EVERY PR, run the non-negotiable simplifier → parallel Opus+Codex+Gemini → fix → impeccable (frontend-touching only) → build → docs → knip pipeline. Each required reviewer MUST stamp an attestation via `bash scripts/merge-ready.sh attest …`. Merge each PR the moment it returns ready — do NOT wait for the rest of the wave.
- **Step 2.6 Phase D** (Post-wave sync): **CWD+branch verification first** (verify CWD is valid, `cd /Users/bryanli/Projects/joyfulhouse/websites/kaelyns-academy`, confirm `git branch --show-current` returns `main` — abort if not). Then pull main, mark items done in DB, clean up wave worktrees, proceed to next wave.
- **Step 7.5** (Apply pending migrations): apply via `bash scripts/db.sh` targeting the CNPG primary. This is single-tier — there is no `--dev`/`--staging` variant.
- **Step 8** (Deploy to production): invoke `/ship`. The homelab GitOps deploy is triggered by the merge to `main` — Forgejo Actions builds the image, pushes to Harbor, pins the SHA in k3s-infra, and ArgoCD syncs (~30s). Wait for `kubectl -n argocd get app kaelyns-academy -w` to show Synced + Healthy before marking the sprint deployed.

**xs/s trivial items**: process directly in the main worktree before launching wave agents. The per-PR review pipeline below applies to these too — no PR is exempt because of size.

### Per-PR review pipeline (NON-NEGOTIABLE)

Every PR goes through this exact sequence before `gh pr merge`. Enforcement lives in the pre-merge hook, which delegates to `bash scripts/merge-ready.sh check --pr <num>`.

**The eight-step sequence, for every PR:**

1. **Simplifier pass.** Dispatch `code-simplifier:code-simplifier` sub-agent. At the end, from the worktree root:
   ```bash
   bash scripts/merge-ready.sh attest simplifier --status <no-op|applied>
   ```

2. **Parallel review fan-out.** In a single message, dispatch three review sub-agents:

   - `pr-review-toolkit:code-reviewer` (Opus, exhaustive, no severity filter). At the end:
     ```bash
     bash scripts/merge-ready.sh attest opus --status <clean|findings-fixed>
     ```
   - Codex adversarial (bash sub-agent wrapping `bash scripts/codex-companion.sh adversarial-review --wait --scope branch`). At the end:
     ```bash
     bash scripts/merge-ready.sh attest codex --status <clean|findings-fixed>
     ```
   - Gemini adversarial (bash sub-agent wrapping `bash scripts/gemini-companion.sh adversarial-review --wait --scope branch`) — **ADVISORY, non-blocking**. If it fails or times out, log it and move on. **No attestation is required or expected for Gemini.**

3. **Fix and re-attest.** If any blocking reviewer reports findings, fix them, commit, push, then re-run affected reviewer(s). Loop until all blocking reviewers stamp `clean` or `findings-fixed` at the current HEAD.

4. **Impeccable design-system critique (frontend-touching PRs only).** If `git diff --name-only main...HEAD` from the worktree contains any `*.tsx`/`*.css`/`*.scss` file or any path under `src/components/` or `src/app/`, dispatch a sub-agent that invokes the impeccable skill.
   Note: PRODUCT.md/DESIGN.md + design system land in P2; impeccable runs against general heuristics until then.
   At the end, from the worktree root:
   ```bash
   bash scripts/merge-ready.sh attest impeccable --status <clean|findings-fixed>
   ```
   For PRs that don't touch frontend:
   ```bash
   bash scripts/merge-ready.sh attest impeccable --status skipped-no-frontend
   ```

5. **Build attestation.**
   ```bash
   cd <worktree-path>
   bun run build     # must exit 0
   bash scripts/merge-ready.sh attest build
   ```

6. **Docs attestation.** Check whether the PR added or changed modules that need docs entries. Update, commit, push, then:
   ```bash
   bash scripts/merge-ready.sh attest docs --status <updated|no-op|deferred>
   ```

7. **Knip (dead-code) attestation.** After every other reviewer has settled:
   ```bash
   cd <worktree-path>
   bun run audit:dead-code   # exit 0 = clean. exit 1 = findings.
   bash scripts/merge-ready.sh attest knip --status <clean|findings-fixed>
   ```
   If `bun run audit:dead-code` is not yet configured, stamp `--status clean` with a note.

8. **Merge.**
   ```bash
   gh pr merge <PR> --merge --delete-branch
   ```

### Per-PR follow-up logging (NON-NEGOTIABLE)

Every non-blocking finding from any reviewer MUST be logged as a `work_items` row before the PR merges (once P6 schema lands). Use `bash scripts/db.sh` with the INSERT shape from process-sprint.md Step 2.6 Phase C Step 3a.

### 2d. Verify sprint completion and clean up

After process-sprint Steps 0-8 finish for this sprint:
1. **Verify sprint status** in DB.
2. **Mark sprint completed** if not already.
3. **Pull latest main**: `git checkout main && git pull --prune`
4. **Quick branch cleanup** — delete local branches whose PRs are merged/closed.

### 2e. Self-compact before next sprint (MANDATORY)

Before looping to the next sprint, manually compact orchestration state. Keep:
- One-line status for every completed sprint
- The sprint queue (remaining sprint IDs/names)
- Any deferred items with a one-line reason
- Final PR URLs

Drop:
- Wave plans for completed sprints
- Full PR review reports from Phase C (keep only verdict lines)
- Codex/Gemini raw output (already acted on)
- Worktree paths and branch names

**Summary block format** (print this verbatim, then move on):
```
── Sprint Compacted: <name> ──
Shipped: N/M items | PRs: <url1>, <url2>, ... | Deploy: <ok|failed>
Deferred: <item-id> (<reason>), ...
Next: <next-sprint-name or "backlog planning">
```

### 2f. Check loop continuation

- If limit reached → stop
- If more sprints in queue → continue to Step 2a with next sprint
- If no more sprints → go to Step 3

## Step 3: Check for Remaining Backlog

After all sprints are done:

```bash
bash scripts/db.sh -c "
  SELECT COUNT(*) as remaining FROM work_items
  WHERE dev_status IN ('backlog', 'triage')
    AND status NOT IN ('resolved', 'wontfix');"
```

- **If remaining > 0**: Report count, then run `/sprint-plan` to create a new sprint.
- **If remaining = 0**: All work is done. Report completion.

## Step 4: Sprint Planning (When No Sprints Exist)

If Step 1 found no sprints, or Step 3 found remaining backlog items:

```
Skill("sprint-plan")
```

After planning completes, loop back to Step 2 to execute it.

## Step 5: Final Report

```
╔══════════════════════════════════════════════════════╗
║               SPRINT LOOP COMPLETE                   ║
╠══════════════════════════════════════════════════════╣
║  Sprints executed: N                                 ║
║  Total items shipped: N                              ║
║  Total PRs merged: N                                 ║
║  Deploys: N                                          ║
║  Remaining backlog: N items                          ║
╚══════════════════════════════════════════════════════╝
```

## Error Handling

- **A worktree agent crashes/times out**: Log it, mark the item as deferred, continue with the rest of the wave.
- **A PR review agent crashes**: Treat the PR as BLOCKED, skip its merge, continue.
- **Deploy fails**: Report the failure and stop the sprint loop.
- **All items deferred**: Warn the user. Continue to the next sprint.
- **Main thread runs low on context**: Step 2e's mandatory self-compaction is the primary defense.
