---
name: process-sprint
description: Process the active sprint — research (with external adversarial review for m/l/xl items), implement, ship all sprint items, then deploy to production via /ship. Handles the full lifecycle from research through production deploy, with deeper investigation for high-effort/complexity items.
---

# Process Sprint

> ⚠️ Requires the bug-reporting schema (work_items/sprints) from the P6 plan; until that lands, these skills are inert. The SQL queries below document the intended schema — they will work once the P6 migrations are applied.

This skill handles end-to-end execution of the active sprint. Unlike `/process-feedback` (which triages raw feedback), this skill **implements scored and approved sprint items** — from research through merge.

> **Database access**: All `bash scripts/db.sh` calls below target the in-cluster CNPG primary (or local `DATABASE_URL`). The wrapper prints a `[db.sh]` env banner on stderr — confirm it before running mutations. This project is single-tier (no dev/staging/prod branches); `scripts/db.sh` has no `--dev`/`--staging` flags.

## Why This Differs from /process-feedback

| Aspect | /process-feedback | /process-sprint |
|---|---|---|
| Input | Raw `status = 'new'` feedback | Scored `dev_status = 'sprint'` items |
| Goal | Triage, score, classify | Research, implement, ship |
| Research depth | Enough to score | Proportional to effort/complexity |
| Output | Scored items ready for sprint | Merged PRs, resolved items |

## Step 0: Load Active Sprint

```bash
bash scripts/db.sh -c "
  SELECT fs.id, fs.name, fs.status, fs.milestone_tag, fs.start_date, fs.end_date, fs.capacity, fs.notes,
    (SELECT COUNT(*) FROM work_items WHERE sprint_id = fs.id) as total_items,
    (SELECT COUNT(*) FROM work_items WHERE sprint_id = fs.id AND dev_status = 'done') as done_items,
    (SELECT COUNT(*) FROM work_items WHERE sprint_id = fs.id AND dev_status = 'in_progress') as in_progress_items
  FROM sprints fs
  WHERE status = 'active'
  ORDER BY start_date ASC
  LIMIT 1;"
```

If no active sprint is found, automatically find the next `planning` sprint (ordered by `start_date ASC`) and activate it:

```bash
bash scripts/db.sh -c "
  UPDATE sprints
  SET status = 'active', updated_at = NOW()
  WHERE id = (
    SELECT id FROM sprints
    WHERE status = 'planning'
    ORDER BY start_date ASC NULLS LAST
    LIMIT 1
  )
  RETURNING id, name, status, milestone_tag, start_date, end_date, capacity, notes;"
```

Do NOT ask the user for confirmation — if a planning sprint exists, activate it and begin. If the user specified a sprint name/ID, use that instead. If no planning sprints exist either, then report that no sprints are available and stop.

## Step 1: Load Sprint Items (Sorted by Priority)

```bash
bash scripts/db.sh -c "
  SELECT id, category, title, description, page_url, priority, effort, strategic_alignment,
         dev_status, status,
         screenshot_url IS NOT NULL as has_screenshot,
         (screenshot_urls IS NOT NULL AND screenshot_urls != '[]'::jsonb) as has_screenshots,
         metadata->'diagnostics' IS NOT NULL as has_diagnostics,
         ai_scoring_rationale,
         checked_out_by, checked_out_at
  FROM work_items
  WHERE sprint_id = '<sprint-id>'
    AND dev_status IN ('sprint', 'in_progress')
  ORDER BY
    CASE priority WHEN 'p0' THEN 0 WHEN 'p1' THEN 1 WHEN 'p2' THEN 2 WHEN 'p3' THEN 3 ELSE 4 END,
    CASE effort WHEN 'xs' THEN 0 WHEN 's' THEN 1 WHEN 'm' THEN 2 WHEN 'l' THEN 3 WHEN 'xl' THEN 4 ELSE 5 END,
    sort_order ASC;"
```

If a filter was provided (e.g., "only p0 and p1", "only bugs"), apply it to the WHERE clause.

## Step 2: Present Sprint Overview and Proceed

Present a brief summary to the user and **immediately start processing** — do NOT wait for confirmation:

| # | Pri | Effort | Title | Category | Alignment |
|---|-----|--------|-------|----------|-----------|

Include:
- Total items vs capacity
- Effort distribution (how many xs/s/m/l/xl)
- Execution order (p0 first, then p1 by effort ascending)
- Any items currently checked out by another agent

Then proceed directly to Step 2.5. Do NOT ask "ready to start?" or wait for user input.

## Step 2.5: Dependency Analysis & Execution Waves

**Parallelism is the primary execution strategy.** Before processing items, analyze dependencies and group into parallel execution waves.

### Grouping Rules

1. **Same `page_url` prefix** → same group (one worktree/PR)
2. **Same component directory** (e.g., `components/admin/`) → same group
3. **Shared utility / layout changes** → own group, later wave (other items may depend)
4. **Schema / migration changes** → own group, **Wave 0** (must land first)
5. **Independent pages/features** → separate groups, same wave (parallel)

### Build Waves

- **Wave 0** (if needed): Schema migrations, shared infrastructure changes. **Must complete all Phase A-D before Wave 1 starts.**
- **Wave 1**: All independent groups (max 4 parallel agents)
- **Wave 2+**: Items that depend on earlier wave outputs, or overflow from Wave 1
- Each wave must complete (all phases A-D) before the next wave begins.

Example:
```
Wave 1 (3 parallel agents):
  Agent A: [item-1, item-3] → both touch /admin/feedback page
  Agent B: [item-2] → touches /dashboard
  Agent C: [item-4] → touches public page
Wave 2 (2 parallel agents):
  Agent D: [item-5] → touches shared layout (depends on Wave 1)
  Agent E: [item-6] → touches /admin (same area, needs Wave 1 merged)
```

Present the wave plan, then immediately proceed to wave execution — no confirmation needed.

### Single-Item Fallback

If ALL items share the same page/component (can't parallelize), skip wave planning and process sequentially per Steps 3-4. This is the exception, not the rule.

## Step 2.6: Wave Execution Loop

For each wave, execute this loop:

### Phase A: Launch Parallel Worktree Agents

Launch one Agent per group, **all in a single message** (triggers parallel execution). Each agent is self-contained — it handles research, implementation, typecheck, commit, push, and PR creation for its item(s).

**Max 4 parallel agents** per wave to avoid resource contention.

**Agent prompt template** (customize per group):

```
Agent(
  description: "Sprint: <group-branch-name>",
  isolation: "worktree",
  prompt: "You are implementing sprint items for Kaelyn's Academy at /Users/bryanli/Projects/joyfulhouse/websites/kaelyns-academy.

    ## Items to implement
    <for each item in group:>
    - ID: <uuid>
    - Title: <title>
    - Category: <category>
    - Priority: <priority>, Effort: <effort>
    - Page: <page_url>
    - Description: <description>
    - AI Rationale: <ai_scoring_rationale>

    ## Branch name
    Use branch: <fix/descriptive-name or feat/descriptive-name>

    ## Your workflow
    1. **Acquire checkout lock** for each item (SQL in process-sprint.md Step 4a)
    2. **Research** proportional to effort:
       - xs/s: Read affected files, locate the fix
       - m: Also read related components. Run Codex+Gemini adversarial review.
       - l/xl: Full investigation — use Explore agent, write plan if xl
    3. **Implement** following all project conventions
    4. **Verify implementation is real** (not just plans/docs/TODOs):
       - Your diff MUST contain actual source code changes (.ts/.tsx files)
       - If your only changes are docs, plans, or TODO comments, you have NOT implemented the item — go back to step 3
    5. **Build**: bun run build — fix errors, max 3 iterations.
    6. **Commit**: conventional commit referencing work item UUID(s)
    7. **Push + Create PR**: gh pr create with summary, work items, test plan
    8. **Update DB**: Set dev_status = 'in_review' for each item

    ## Completion criteria
    - Your diff contains real source code changes (not just docs or plans)
    - bun run build passes with zero errors
    - PR description includes specific files changed and why
    - If you could not implement an item, report it as DEFERRED with the reason — do NOT mark it done

    Report back: items completed, PR URL, build output summary, any issues or items deferred."
)
```

**IMPORTANT**: Use `isolation: "worktree"` for each agent. The worktree gives each agent an isolated copy of the repo so they don't conflict.

**xs/s trivial items** (one-line fixes): Process these directly in the main worktree **before launching wave agents** — faster than worktree overhead. Do NOT process them concurrently with worktree agents since the main worktree must be stable while agents are running.

### Phase B: Collect Results

Wait for all agents in the wave to return. For each:
1. Record the **PR URL**, **branch name**, and **worktree path** (from the agent result — needed for Phase C)
2. Note any deferred items or issues
3. If an agent failed, log the error and continue — don't retry

### Phase C: Parallel Review, Then Sequential Merge

Run reviews on all PRs from the wave **in parallel**, but **merge sequentially** to avoid lockfile/shared-file conflicts:

**Step 1: Launch parallel review agents** (one per PR, all in a single message):
```
Agent(
  description: "Review PR <branch-name>",
  prompt: "Review this PR for Kaelyn's Academy. Do NOT merge — report review status only.

    PR: <pr-url>
    Branch: <branch-name>

    ## MANDATORY STEPS — Do NOT skip any step

    1. Check out the branch: git fetch origin && git checkout <branch-name>

    2. Run code-simplifier on changed files. Commit and push fixes.

    3. Run these THREE reviews. Steps 3a and 3b MUST use the Bash tool to execute the scripts.
       Do NOT skip them. Do NOT substitute your own review for them.

       3a. Codex standard review (MANDATORY — run via Bash tool):
           bash scripts/codex-companion.sh review --wait --scope working-tree
           Copy the FULL output into your report under '## Codex Review Output'.
           If the script fails or is unavailable, report the exact error message.

       3b. Gemini standard review (MANDATORY — run via Bash tool):
           bash scripts/gemini-companion.sh review --wait --scope working-tree
           Copy the FULL output into your report under '## Gemini Review Output'.
           If the script fails or is unavailable, report the exact error message.

       3c. Run pr-review-toolkit:code-reviewer on the PR.

       3d. Impeccable design-system critique — REQUIRED IFF the diff touches frontend.
           Run from the worktree:
             git diff --name-only main...HEAD | grep -E '\\.(tsx|css|scss)$|^src/components/|^src/app/'
           If the grep returns any path, invoke the impeccable critique skill scoped to those paths via the Skill tool:
             Skill('impeccable critique <changed-frontend-paths>')
           Note: PRODUCT.md/DESIGN.md + design system land in P2; impeccable runs against general heuristics until then.
           If the grep returns nothing, skip 3d and proceed.

       Run 3a and 3b in parallel (two Bash calls in one message). Run 3c concurrently or after. 3d runs after 3a/3b/3c.

    4. Fix ALL issues found across all reviews (3a/3b/3c, plus 3d for frontend-touching PRs). Commit and push.

    5. Verify: bun run typecheck && bun run build (zero errors)

    ## Report format (REQUIRED)

    Your report MUST include ALL of these sections:
    ## Codex Review Output
    <paste full codex output here, or 'UNAVAILABLE: <error>' if it failed>

    ## Gemini Review Output
    <paste full gemini output here, or 'UNAVAILABLE: <error>' if it failed>

    ## Code Reviewer Findings
    <summary of pr-review-toolkit findings>

    ## Issues Fixed
    <list of issues fixed, or 'None'>

    ## Build Verification
    <typecheck and build results>

    ## Verdict
    READY TO MERGE | BLOCKED (with reason)"
)
```

**Step 2: Verify review completeness (MANDATORY — main thread, before merging):**

For each review agent result, the main thread MUST verify the report contains:
- `## Codex Review Output` section with actual output (not empty, not "SKIPPED")
- `## Gemini Review Output` section with actual output (not empty, not "SKIPPED")
- `## Verdict` of READY TO MERGE

**If ANY section is missing, empty, or says "SKIPPED" (for m/l/xl items), do NOT merge.** Instead, run the missing review directly from the main thread on the PR branch worktree:
```bash
cd <worktree-path> && bash scripts/codex-companion.sh review --wait --scope working-tree
cd <worktree-path> && bash scripts/gemini-companion.sh review --wait --scope working-tree
```

**For xs/s items**: Claude code-reviewer is sufficient. Codex/Gemini sections can say "SKIPPED (xs/s effort)" — this is acceptable.
**For m/l/xl items**: All three reviewers are required. No exceptions.

**Step 3: Sequential merge** (main thread, after all reviews verified):
For each PR that reported READY TO MERGE and passed verification:

**STEP 3a (NON-NEGOTIABLE): Log non-blocking findings as work_items BEFORE merge.**

Every reviewer frequently emits findings the main thread chooses NOT to fix in the current PR. Persist them to `work_items` (once P6 schema lands):

```bash
bash scripts/db.sh -c "
  INSERT INTO work_items (
    id, tenant_id, page_url, category, title, description,
    conversation_history, dev_status, sort_order, source,
    severity, priority, effort
  )
  VALUES (
    gen_random_uuid(),
    'system',
    '<repo-area>',
    'tech-debt',
    '<short title, ≤80 chars>',
    '<full finding verbatim, including reviewer name, round, file:line, recommendation>',
    '[]'::jsonb,
    'backlog',
    0,
    'reviewer-followup',
    '<low|medium|high>',
    '<p2|p3>',
    '<xs|s|m>'
  );"
```

**STEP 3b: Merge.**
```bash
gh pr merge <pr-number> --merge --delete-branch
git pull origin main  # sync before next merge
```

### Phase D: Post-Wave Sync

**CWD and branch verification (MANDATORY — run BEFORE anything else):**

Worktree agents can leave CWD pointing to a deleted directory. Verify and recover before any git operations:

```bash
# 1. Verify CWD is valid — recover if stuck on a deleted worktree path
if [ ! -d "$(pwd)" ]; then
  echo "WARNING: CWD is deleted. Recovering to repo root."
  cd /Users/bryanli/Projects/joyfulhouse/websites/kaelyns-academy
fi

# 2. Ensure we're in the main worktree, not a sub-worktree
cd /Users/bryanli/Projects/joyfulhouse/websites/kaelyns-academy

# 3. Verify main branch — abort if a worktree agent leaked a checkout
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "CRITICAL: Main worktree is on '$CURRENT_BRANCH', not 'main'!"
  echo "A worktree agent leaked a checkout. Investigate before proceeding."
  exit 1
fi
```

After verification passes, sync with remote:

```bash
git pull origin main
```

**Post-merge build gate (MANDATORY):**

```bash
bun run build
```

If the build fails: fix on `main` directly, max 3 attempts, then escalate to user.

Update item statuses to `done`:
```bash
bash scripts/db.sh -c "
  UPDATE work_items
  SET dev_status = 'done',
      checked_out_by = NULL, checked_out_at = NULL, updated_at = NOW()
  WHERE id IN ('<uuid-1>', '<uuid-2>', ...)
  RETURNING id, title, dev_status;"
```

**Inter-wave worktree cleanup** — remove worktrees for branches merged in this wave so the next wave starts clean:

```bash
for path in "${WAVE_WORKTREES[@]}"; do
  branch=$(cd "$path" 2>/dev/null && git rev-parse --abbrev-ref HEAD 2>/dev/null)
  [ -z "$branch" ] && continue
  state=$(gh pr list --head "$branch" --state all --json state --jq '.[0].state' 2>/dev/null)
  if [ "$state" = "MERGED" ] || [ "$state" = "CLOSED" ]; then
    git worktree remove "$path" 2>&1 | tail -1
    git branch -D "$branch" 2>&1 | tail -1
  fi
done
git worktree prune
```

---

**Steps 3 and 4 below are reference material** — they describe what each worktree agent does internally. When running in wave mode (the default), agents follow these steps autonomously.

---

## Step 3: Research Phase (Effort-Proportional)

### External Review During Research (Codex / Gemini)

For **m/l/xl effort items**, request an external review of your research findings and proposed approach before implementing:

1. **Codex review**:
   ```bash
   bash scripts/codex-companion.sh adversarial-review --wait --scope working-tree
   ```
2. **Gemini review** (parallel with Codex):
   ```bash
   bash scripts/gemini-companion.sh adversarial-review --wait --scope working-tree
   ```

**Graceful fallback**: If either reviewer returns an error, log and continue — do NOT block the sprint.

**When to skip external review**: xs/s effort items don't need it. Also skip for mechanical fixes (typo, alignment, missing import) regardless of effort label.

---

For each item, research depth scales with the effort estimate:

### xs/s effort (< 2 hours)
1. Read the item description
2. Locate the affected file(s)
3. Read the relevant source code
4. Identify the fix

### m effort (2-4 hours)
1. Everything from xs/s above
2. Read related components and shared utilities
3. Look for similar patterns elsewhere in the codebase
4. Check if the change touches shared state or has downstream effects
5. **External review** — run Codex and Gemini adversarial reviews in parallel

### l effort (4-8 hours)
1. Everything from m above
2. **Use an Explore agent** to map the full scope of affected files
3. Read the relevant Drizzle schema files if DB changes needed
4. Check if new migrations are needed
5. Consider if the change needs a plan — write one to `docs/superpowers/plans/` if so
6. **External review** — run the Codex and Gemini adversarial review scripts in parallel

### xl effort (8+ hours)
1. Everything from l above
2. **Mandatory plan** — write to `docs/superpowers/plans/YYYY-MM-DD-<name>.md` using the `superpowers:writing-plans` skill
3. **Use a code-architect agent** to design the solution
4. **External review** — run Codex and Gemini adversarial review scripts in parallel after committing the plan
5. Present the plan (with external review feedback) to the user for approval before any implementation

## Step 4: Implement Each Item

### 4a. Acquire Checkout Lock

```bash
bash scripts/db.sh -c "
  UPDATE work_items
  SET checked_out_by = 'agent-process-sprint',
      checked_out_at = NOW(),
      dev_status = 'in_progress',
      updated_at = NOW()
  WHERE id = '<item-id>'
    AND (checked_out_by IS NULL OR checked_out_at < NOW() - INTERVAL '2 hours')
  RETURNING id, checked_out_by;"
```

If 0 rows returned, the item is locked by another agent — skip it and move to the next.

### 4b. Create Worktree

```bash
git worktree add .claude/worktrees/sprint-<short-name> -b fix/<descriptive-name>
```

### 4c. Implement the Fix

Follow all project conventions from CLAUDE.md.

### 4d. Typecheck

```bash
cd .claude/worktrees/sprint-<short-name> && bun run typecheck
```

Fix any errors before proceeding. Max 3 iterations, then escalate.

### 4e. Commit

```
fix: <description>

Resolves work item: <work-item-uuid>
```

### 4f. Push and Create PR

```bash
git push -u origin fix/<branch-name>
gh pr create --title "fix: <title>" --body "$(cat <<'EOF'
## Summary
<what changed and why>

## Work Items
- <uuid>: <title>

## Test Plan
- [ ] <verification steps>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Transition item to `in_review`:

```bash
bash scripts/db.sh -c "
  UPDATE work_items
  SET dev_status = 'in_review', updated_at = NOW()
  WHERE id = '<item-id>';"
```

### 4g. Review and Merge

Follow the merge checklist:
1. Run **code-simplifier** agent on changed files
2. Commit simplifier changes
3. Run in parallel:
   - **Codex standard review**: `bash scripts/codex-companion.sh review --wait --scope working-tree`
   - **Gemini standard review**: `bash scripts/gemini-companion.sh review --wait --scope working-tree`
   - **code-review:code-review** skill on the PR
   - **pr-review-toolkit:code-reviewer** agent
4. Fix all issues found across all four reviews
5. Merge the PR

## Step 5: Mark Items Done

After each PR is merged:

```bash
bash scripts/db.sh -c "
  UPDATE work_items
  SET dev_status = 'done',
      checked_out_by = NULL,
      checked_out_at = NULL,
      updated_at = NOW()
  WHERE id = '<item-id>'
  RETURNING id, title, dev_status;"
```

For items **deferred** (moved back to backlog):

```bash
bash scripts/db.sh -c "
  UPDATE work_items
  SET dev_status = 'backlog',
      sprint_id = NULL,
      checked_out_by = NULL,
      checked_out_at = NULL,
      updated_at = NOW()
  WHERE id = '<item-id>'
  RETURNING id, title, dev_status;"
```

## Step 6: Sprint Progress Check

```bash
bash scripts/db.sh -c "
  SELECT
    dev_status,
    COUNT(*) as count,
    string_agg(LEFT(title, 50), ', ' ORDER BY
      CASE priority WHEN 'p0' THEN 0 WHEN 'p1' THEN 1 WHEN 'p2' THEN 2 WHEN 'p3' THEN 3 END
    ) as items
  FROM work_items
  WHERE sprint_id = '<sprint-id>'
  GROUP BY dev_status
  ORDER BY CASE dev_status
    WHEN 'in_progress' THEN 0 WHEN 'sprint' THEN 1 WHEN 'in_review' THEN 2
    WHEN 'done' THEN 3 WHEN 'wontfix' THEN 4 ELSE 5 END;"
```

## Step 7: Clean Up

After all items are processed:

1. **Remove sprint worktrees and local branches for merged PRs**:

   ```bash
   git worktree list | tail -n +2 > /tmp/sprint-worktrees.txt

   while IFS= read -r line; do
     path=$(echo "$line" | awk '{print $1}')
     branch=$(echo "$line" | awk '{print $NF}' | tr -d '[]')
     [ -z "$branch" ] && continue
     state=$(gh pr list --head "$branch" --state all --json state --jq '.[0].state' 2>/dev/null)
     if [ "$state" = "MERGED" ] || [ "$state" = "CLOSED" ]; then
       dirty=$(cd "$path" 2>/dev/null && git status --short 2>/dev/null | grep -v '^?? node_modules' | wc -l | tr -d ' ')
       if [ "$dirty" = "0" ]; then
         git worktree remove "$path" 2>&1 | tail -1
         git branch -D "$branch" 2>&1 | tail -1
       fi
     fi
   done < /tmp/sprint-worktrees.txt
   git worktree prune
   rm -f /tmp/sprint-worktrees.txt
   ```

2. Pull latest main:
   ```bash
   git pull
   ```

3. Check if sprint is complete:
   ```bash
   bash scripts/db.sh -c "
     SELECT
       (SELECT COUNT(*) FROM work_items WHERE sprint_id = '<sprint-id>' AND dev_status = 'done') as completed,
       (SELECT COUNT(*) FROM work_items WHERE sprint_id = '<sprint-id>') as total,
       (SELECT COUNT(*) FROM work_items WHERE sprint_id = '<sprint-id>' AND dev_status NOT IN ('done', 'wontfix')) as remaining;"
   ```

4. If all items done, mark sprint complete:
   ```bash
   bash scripts/db.sh -c "
     UPDATE sprints
     SET status = 'completed', updated_at = NOW()
     WHERE id = '<sprint-id>'
     RETURNING id, name, status;"
   ```

## Step 7.5: Apply Pending Migrations

After cleanup and before shipping, check if any Drizzle migrations were generated during the sprint and apply them.

```bash
# Compare Drizzle migration files with what's in the DB
ls -1 drizzle/*.sql | sort | tail -5
```

For each unapplied migration:

1. **Review the SQL** — confirm it's safe (uses `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, etc.)
2. **Apply via db.sh**:
   ```bash
   bash scripts/db.sh -c "<migration SQL>"
   ```
3. **Verify** — spot-check that the new columns/tables exist:
   ```bash
   bash scripts/db.sh -c "\d <table_name>"
   ```

> **Single-tier**: there is only one database tier in this homelab project. `scripts/db.sh` targets the CNPG primary directly. No `--dev`/`--staging` variants exist.

**Skip this step** if no new migration files were created during the sprint (check `git diff main~N...main --name-only -- drizzle/`).

## Step 8: Ship to Production

After the sprint is complete (all items done/deferred/wontfix and sprint marked `completed`), **automatically invoke `/ship`** to deploy everything to production.

This runs the full `/ship` pipeline:
- Typecheck + lint
- Code review (pre-PR)
- Code simplifier
- Verify
- Deploy to production (homelab GitOps — ArgoCD rolling update, not Vercel)
- Canary health check (`/api/health`)
- Branch & worktree cleanup

**No user confirmation needed** — the sprint completing is the signal to ship. The `/ship` skill has its own safety gates (canary checks) that will catch problems.

If `/ship` fails at any step, report the failure and stop. Do NOT retry the full pipeline — let the user decide how to proceed.

## Parallel Execution (Primary Strategy)

**Wave-based parallelism is the default.** See Step 2.5 and Step 2.6 for the full model.

Key constraints:
- Max **4 parallel agents** per wave
- Schema/migration changes run in **Wave 0** (before everything else)
- Items on the **same page** go in the **same agent** (one PR per group)
- After each wave, **pull main** before starting the next wave
- **xs/s trivial items**: Process directly in main worktree before launching wave agents

## Decision Points — Autonomous by Default

**Only escalate to the user when**:
- **Destructive schema changes** — dropping columns/tables, irreversible migrations
- **Conflicting requirements** — two items contradict each other
- **Major architectural shifts** — changing a pattern used across many files
- **Significant unexpected scope expansion**
- **Ambiguous intent** — genuinely can't tell what the user wants

## Database Schema Reference

```sql
work_items (
  id                       UUID PRIMARY KEY,
  tenant_id                TEXT NOT NULL,
  page_url                 TEXT NOT NULL,
  category                 TEXT NOT NULL,        -- bug, ux, feature_request, performance, content, other
  title                    TEXT NOT NULL,
  description              TEXT NOT NULL,
  screenshot_url           TEXT,
  screenshot_urls          JSONB,
  status                   TEXT NOT NULL,        -- new, reviewed, resolved, wontfix
  conversation_history     JSONB NOT NULL,
  metadata                 JSONB,
  created_at               TIMESTAMP NOT NULL,
  updated_at               TIMESTAMP NOT NULL,
  dev_status               TEXT NOT NULL,        -- triage, backlog, sprint, in_progress, in_review, done, wontfix
  sort_order               INTEGER NOT NULL,
  sprint_id                UUID,
  priority                 TEXT,                 -- p0, p1, p2, p3
  effort                   TEXT,                 -- xs, s, m, l, xl
  strategic_alignment      TEXT,                 -- high, medium, low
  ai_priority_suggestion   TEXT,
  ai_effort_suggestion     TEXT,
  ai_alignment_suggestion  TEXT,
  ai_scoring_rationale     TEXT,
  checked_out_by           TEXT,
  checked_out_at           TIMESTAMP
)

sprints (
  id                       UUID PRIMARY KEY,
  name                     TEXT NOT NULL,
  status                   TEXT NOT NULL,        -- planning, active, completed
  milestone_tag            TEXT,
  start_date               TIMESTAMP,
  end_date                 TIMESTAMP,
  capacity                 INTEGER,
  notes                    TEXT,
  created_at               TIMESTAMP NOT NULL,
  updated_at               TIMESTAMP NOT NULL
)
```
