---
name: sprint-plan
description: Plan the next sprint — pull backlogged work items, incorporate new feature ideas, score/prioritize, set capacity, and produce a ready-to-execute sprint. Use when the user runs /sprint-plan, asks to plan a sprint, wants to organize backlog items, or mentions adding feature ideas to the next sprint.
---

# Sprint Planning

> ⚠️ Requires the bug-reporting schema (work_items/sprints) from the P6 plan; until that lands, these skills are inert. The SQL queries below document the intended schema — they will work once the P6 migrations are applied.

This skill handles sprint planning — assembling, scoring, and organizing items into a sprint that's ready for execution via `/sprint`.

**Tables:** This skill operates on the `work_items` and `sprints` tables. Work items come from three sources: tester feedback (`source='human'`), agent-created items via `/work-item` skill (`source='agent'`, `tenant_id='system'`), and feature ideas added directly during planning.

> **Database access**: All `bash scripts/db.sh` calls below target the in-cluster CNPG primary (or local `DATABASE_URL`). The wrapper prints a `[db.sh]` env banner on stderr — confirm it before running mutations. This project is single-tier (no dev/staging/prod branches).

## Why This Matters

A sprint without planning is just a to-do list. Planning ensures:
- The right items are prioritized (p0/p1 bugs before cosmetic polish)
- Capacity is realistic (don't plan 40 hours of xl items for a 3-day sprint)
- New feature ideas get evaluated against the roadmap before entering the sprint
- The user has full visibility and approval before execution begins

## Step 0: Assess Current State

### Check for existing sprints

```bash
bash scripts/db.sh -c "
  SELECT s.id, s.name, s.status, s.milestone_tag, s.start_date, s.end_date, s.capacity, s.notes,
    (SELECT COUNT(*) FROM work_items WHERE sprint_id = s.id) as total_items,
    (SELECT COUNT(*) FROM work_items WHERE sprint_id = s.id AND dev_status = 'done') as done_items,
    (SELECT COUNT(*) FROM work_items WHERE sprint_id = s.id AND dev_status NOT IN ('done', 'wontfix')) as remaining_items
  FROM sprints s
  WHERE status IN ('planning', 'active', 'completed')
  ORDER BY created_at DESC
  LIMIT 5;"
```

If there's an **active** sprint with remaining items, ask the user:
- "There's an active sprint with N remaining items. Create a new sprint or add to the current one?"

If there's a **planning** sprint, continue editing it instead of creating a new one.

### Check the backlog

```bash
bash scripts/db.sh -c "
  SELECT id, category, title, priority, effort, strategic_alignment,
         ai_priority_suggestion, ai_effort_suggestion, ai_alignment_suggestion,
         ai_scoring_rationale, dev_status, source, milestone_tag, created_at
  FROM work_items
  WHERE dev_status IN ('backlog', 'triage')
    AND sprint_id IS NULL
  ORDER BY
    CASE COALESCE(priority, ai_priority_suggestion) WHEN 'p0' THEN 0 WHEN 'p1' THEN 1 WHEN 'p2' THEN 2 WHEN 'p3' THEN 3 ELSE 4 END,
    created_at ASC;"
```

## Step 1: Create or Update Sprint

### New sprint

Ask the user for:
- **Sprint name** (e.g., "P1", "Alpha Polish", "Sprint-1") — use a naming convention that makes sense for this project
- **Milestone tag** (e.g., `p0-foundation`, `p1-auth`, `p2-design`) — use kebab-case
- **Duration** (start/end dates) — leave NULL for open-ended planning sprints
- **Capacity** (max items — recommend based on past sprint velocity, typically 4–10 items)

```bash
bash scripts/db.sh -c "
  INSERT INTO sprints (id, name, status, milestone_tag, start_date, end_date, capacity, notes, created_at, updated_at)
  VALUES (gen_random_uuid(), '<name>', 'planning', '<milestone>', '<start-or-NULL>', '<end-or-NULL>', <capacity>, '<notes>', NOW(), NOW())
  RETURNING id, name, status, milestone_tag, start_date, end_date, capacity;"
```

### Existing planning sprint

Load its current items and continue from Step 2.

## Step 2: Score Unscored Backlog Items

For backlog items missing priority/effort/alignment scores, run AI scoring:

1. Read the project roadmap docs (if they exist in `docs/`) for strategic context
2. For each unscored item, fetch full context:

```bash
bash scripts/db.sh -c "
  SELECT id, category, title, description, page_url, conversation_history, source, milestone_tag
  FROM work_items
  WHERE id = '<item-id>';"
```

3. Score each item:
   - **Priority**: p0 (blocks current milestone/data loss), p1 (high impact on core loop), p2 (medium), p3 (cosmetic)
   - **Effort**: xs (<30min), s (30min-2hr), m (2-4hr), l (4-8hr), xl (>8hr)
   - **Alignment**: high (supports current milestone), medium (supports differentiation), low (tangential)

4. Save AI suggestions:

```bash
bash scripts/db.sh -c "
  UPDATE work_items
  SET ai_priority_suggestion = '<priority>',
      ai_effort_suggestion = '<effort>',
      ai_alignment_suggestion = '<alignment>',
      ai_scoring_rationale = '<one sentence rationale>',
      updated_at = NOW()
  WHERE id = '<item-id>';"
```

## Step 3: Incorporate New Feature Ideas

If the user has new feature ideas (not from tester feedback), create work items for them:

```bash
bash scripts/db.sh -c "
  INSERT INTO work_items (
    id, tenant_id, page_url, category, title, description,
    dev_status, sort_order, source,
    priority, effort, strategic_alignment,
    ai_priority_suggestion, ai_effort_suggestion, ai_alignment_suggestion,
    ai_scoring_rationale,
    conversation_history, milestone_tag, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), 'system', '<relevant-page>',
    'feature_request', '<title>', '<description>',
    'backlog', 0, 'agent',
    '<priority>', '<effort>', '<alignment>',
    '<priority>', '<effort>', '<alignment>',
    '<rationale>',
    '[]'::jsonb, '<milestone-or-NULL>', NOW(), NOW()
  ) RETURNING id, title, priority, effort, strategic_alignment;"
```

Use `tenant_id = 'system'`, `source = 'agent'`, and set both the user-confirmed columns and the AI suggestion columns to the same values for agent-created items.

## Step 4: Present Sprint Plan

Show the user a proposed sprint with items sorted by priority and effort:

| # | Type | Pri | Effort | Title | Category | Alignment | Source |
|---|------|-----|--------|-------|----------|-----------|--------|

Include:
- **Capacity check**: total items vs capacity, estimated effort distribution
- **Effort budget**: rough hours (xs=0.5, s=1, m=3, l=6, xl=10) vs sprint duration
- **Risk items**: any l/xl items that could blow the sprint
- **Recommended cuts**: if over capacity, suggest which p3/low-alignment items to defer

Ask: "Here's the proposed sprint. Want to adjust priorities, add/remove items, or approve and activate?"

## Step 4a: Adversarial Review of Sprint Composition (MANDATORY)

**Before presenting the sprint to the user for approval**, run Codex and Gemini adversarial reviews on the sprint composition:

```bash
# Write sprint summary for reviewers to analyze
cat > /tmp/sprint-plan-review.md << 'PLAN'
# Sprint Plan: <name>
<paste the full sprint table + capacity analysis + risk items from Step 4>
PLAN

# Codex adversarial review
bash scripts/codex-companion.sh adversarial-review --wait --scope working-tree

# Gemini adversarial review
bash scripts/gemini-companion.sh adversarial-review --wait --scope working-tree
```

Handle findings: research each one, adjust the sprint plan for valid issues, note false positives.

**Graceful fallback:** If both reviewers fail, continue to Step 4.5 — but log the gap.

Clean up:
```bash
rm -f /tmp/sprint-plan-review.md
```

## Step 4.5: Design Plans for L/XL Items

After the user approves the sprint composition but **before activation**, create implementation plans for any `l` or `xl` effort items.

For each l/xl item in the sprint:

1. **Use the `feature-dev:code-architect` agent** to analyze the codebase and produce an implementation blueprint.

2. **Use `AskUserQuestion`** to gather the user's preferences on key decisions. Ask about:
   - **Scope boundaries**: "What's in vs out for this sprint? Any features to defer?"
   - **UX direction**: "How should this look/feel? Any reference designs?"
   - **Architecture choices**: "New component vs extend existing? New table vs extend schema?"

   Ask ONE focused question at a time.

3. **Write a plan** to `docs/superpowers/plans/YYYY-MM-DD-<item-name>.md` using the `superpowers:writing-plans` skill.

4. **Adversarial review of the plan (MANDATORY)** — Run Codex and Gemini adversarial reviews on the plan:

   ```bash
   bash scripts/codex-companion.sh adversarial-review --wait --scope working-tree
   bash scripts/gemini-companion.sh adversarial-review --wait --scope working-tree
   ```

5. **Get user approval** on the plan before proceeding.

**Skip this step for xs/s/m items** — they're small enough for agents to figure out from the description alone.

## Step 5: Finalize Sprint

After user approval (and l/xl plans written):

### Assign items to the sprint

```bash
bash scripts/db.sh -c "
  UPDATE work_items
  SET sprint_id = '<sprint-id>',
      dev_status = 'sprint',
      priority = COALESCE(priority, ai_priority_suggestion),
      effort = COALESCE(effort, ai_effort_suggestion),
      strategic_alignment = COALESCE(strategic_alignment, ai_alignment_suggestion),
      sort_order = <order>,
      updated_at = NOW()
  WHERE id = '<item-id>'
  RETURNING id, title, priority, effort, dev_status;"
```

### Activate the sprint

```bash
bash scripts/db.sh -c "
  UPDATE sprints
  SET status = 'active', updated_at = NOW()
  WHERE id = '<sprint-id>'
  RETURNING id, name, status;"
```

### Deactivate previous active sprint (if any)

Only deactivate the previous sprint if all its items are done:

```bash
bash scripts/db.sh -c "
  UPDATE sprints
  SET status = 'completed', updated_at = NOW()
  WHERE status = 'active' AND id != '<sprint-id>'
    AND NOT EXISTS (
      SELECT 1 FROM work_items
      WHERE sprint_id = sprints.id
        AND dev_status NOT IN ('done', 'wontfix')
    )
  RETURNING id, name, status;"
```

## Step 6: Report

Summarize the planned sprint:
- Sprint name, dates, capacity
- Items by priority (p0: N, p1: N, p2: N, p3: N)
- Items by effort (xs: N, s: N, m: N, l: N, xl: N)
- Estimated total effort hours
- Items deferred to backlog
- Next step: "Run `/sprint` to start executing"

## Decision Points (Ask the User)

Always ask before:
- **Creating a new sprint** when one already exists
- **Including l/xl items** — flag the capacity risk
- **Cutting items** from the sprint
- **Changing priority** from what AI suggested — explain your reasoning
- **Adding feature ideas** that aren't in the backlog yet

Never ask for:
- Scoring mechanics (just do it)
- Standard DB queries
- Items already approved by the user

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
  screenshot_urls          JSONB DEFAULT '[]',
  conversation_history     JSONB NOT NULL,
  metadata                 JSONB,
  source                   TEXT NOT NULL,        -- human, agent
  dev_status               TEXT NOT NULL,        -- triage, backlog, sprint, in_progress, in_review, done, wontfix, deferred
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
  checked_out_at           TIMESTAMP,
  plan_path                TEXT,
  milestone_tag            TEXT,
  created_at               TIMESTAMP NOT NULL,
  updated_at               TIMESTAMP NOT NULL
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
