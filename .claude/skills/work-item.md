---
name: work-item
description: Create work items in the production database from the system user. Use this skill when production errors are discovered, when monitoring reveals issues, when code review finds bugs, or when the user runs /work-item. Handles parsing natural-language descriptions into structured work items with scoring.
---

# Create Work Item

> ⚠️ Requires the bug-reporting schema (work_items/sprints) from the P6 plan; until that lands, these skills are inert. The SQL queries below document the intended schema — they will work once the P6 migrations are applied.

This skill creates work items in the `work_items` table from the `system` user. Unlike tester feedback (which comes from the in-app chatbot), these items originate from monitoring, log analysis, code review, or manual developer reports.

> **Database access**: All `bash scripts/db.sh` calls below target the in-cluster CNPG primary (or local `DATABASE_URL`). The wrapper prints a `[db.sh]` env banner on stderr — confirm it before inserting. This project is single-tier (no dev/staging/prod branches).

## Why This Matters

The sprint system (`/sprint-plan`, `/sprint`) pulls from the `work_items` table. Items that only exist in markdown docs or conversation history won't be picked up for planning or execution. Every actionable issue must live in the database.

## Step 1: Parse Input

Extract structured fields from the natural-language input. The user may provide any combination of:

- **Title**: The core description of the issue
- **Category**: `bug`, `ux`, `feature_request`, `performance`, `content`, `other`
- **Priority**: `p0` (blocks alpha/data loss), `p1` (high impact), `p2` (medium), `p3` (cosmetic)
- **Effort**: `xs` (<30min), `s` (30min-2hr), `m` (2-4hr), `l` (4-8hr), `xl` (>8hr)
- **Alignment**: `high`, `medium`, `low`
- **Page URL / endpoint**: The affected route or API endpoint
- **Description**: Detailed context, error messages, stack traces

If the input is empty or unclear, use `AskUserQuestion` to gather:
1. What's the issue? (title + description)
2. What category? (default: `bug`)
3. What endpoint/page is affected? (default: `/`)

For fields the user doesn't specify, infer sensible defaults:
- **Category**: Default `bug` for errors, `performance` for timeouts, `feature_request` for missing functionality
- **Priority**: Infer from severity — 500 errors are p1+, warnings are p2, cosmetic is p3
- **Effort**: Infer from complexity — env var fix is `xs`, query optimization is `s`/`m`, new feature is `l`/`xl`
- **Alignment**: `high` if it affects core loop or observability, `medium` for supporting features, `low` for edge cases

## Step 2: Check for Duplicates

Before inserting, search for existing items with similar titles. Use 2-3 key words from the title as the search phrase.

**Important**: Escape single quotes in the search phrase by doubling them (`'` → `''`).

```bash
bash scripts/db.sh <<'EOF'
  SELECT id, title, dev_status, priority, created_at
  FROM work_items
  WHERE title ILIKE '%<key-phrase>%'
    AND dev_status NOT IN ('done', 'wontfix')
  ORDER BY created_at DESC
  LIMIT 5;
EOF
```

If a match is found:
- If the existing item covers the same issue, **do not insert** — report the duplicate
- If related but distinct, proceed with the insert but note the related item

## Step 3: Insert the Work Item

**Important**: Always escape single quotes in all string values by doubling them (`'` → `''`). Use a heredoc to avoid bash double-quote conflicts.

```bash
bash scripts/db.sh <<'EOF'
  INSERT INTO work_items (
    id, tenant_id, page_url, category, title, description,
    dev_status, sort_order, source,
    priority, effort, strategic_alignment,
    ai_priority_suggestion, ai_effort_suggestion, ai_alignment_suggestion,
    ai_scoring_rationale,
    conversation_history, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    'system',
    '<page-url>',
    '<category>',
    '<title>',
    '<description>',
    'backlog',
    0,
    'agent',
    '<priority>',
    '<effort>',
    '<alignment>',
    '<priority>',
    '<effort>',
    '<alignment>',
    '<rationale>',
    '[]'::jsonb,
    NOW(), NOW()
  ) RETURNING id, title, priority, effort, strategic_alignment, dev_status;
EOF
```

### Field Reference

| Field | Value | Notes |
|---|---|---|
| `tenant_id` | `'system'` | Always. System user for agent-created items. |
| `dev_status` | `'backlog'` | Ready for sprint planning pickup. |
| `sort_order` | `0` | Default ordering within kanban columns. |
| `source` | `'agent'` | Distinguishes from human tester feedback. |
| `conversation_history` | `'[]'::jsonb` | Empty — no chatbot conversation for system items. |
| `priority` | Same as `ai_priority_suggestion` | Auto-confirmed since the agent evaluated it. |
| `effort` | Same as `ai_effort_suggestion` | Auto-confirmed since the agent evaluated it. |
| `strategic_alignment` | Same as `ai_alignment_suggestion` | Auto-confirmed since the agent evaluated it. |

### Error Handling

If the `psql` command fails:
1. Read the error output — common causes: single quotes not escaped, FK violation (system user missing), connection timeout
2. Fix the SQL (escape quotes, verify values match enum constraints)
3. Retry the insertion
4. If it fails 3 times, report the error and stop

## Step 4: Handle Multiple Items

If the input contains multiple items (separated by semicolons, newlines, or numbered lists):

1. Parse each item individually
2. Check duplicates for each
3. Insert all non-duplicate items in a single SQL statement (multiple VALUES rows)
4. Report all created items in a summary table

## Step 5: Confirm Creation

After inserting, display a summary:

```
Created N work item(s):

| ID | Title | Priority | Effort | Alignment | Status |
|---|---|---|---|---|---|
| <uuid> | <title> | <priority> | <effort> | <alignment> | backlog |
```

If any items were skipped as duplicates, note them separately.

## Scoring Rationale Guidelines

Write a single sentence explaining the priority/effort/alignment decision. Examples:

- "Critical: health endpoint returning 503 on startup blocks all monitoring."
- "Medium: missing OG image breaks social sharing previews. Fix is a one-line addition."
- "Low urgency: cosmetic alignment issue, rarely visible."
- "High alignment: blocks observability pipeline needed for P0 monitoring."

## Database Schema Reference

```sql
work_items (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                TEXT NOT NULL,        -- 'system' for agent-created items
  page_url                 TEXT NOT NULL,        -- affected endpoint or page route
  category                 TEXT NOT NULL,        -- bug, ux, feature_request, performance, content, other
  title                    TEXT NOT NULL,        -- concise issue title
  description              TEXT NOT NULL,        -- detailed description with error messages, context
  screenshot_url           TEXT,                 -- (deprecated) single screenshot URL
  screenshot_urls          JSONB DEFAULT '[]',   -- array of image URLs
  dev_status               TEXT NOT NULL,        -- triage, backlog, sprint, in_progress, in_review, done, wontfix, deferred
  sort_order               INTEGER NOT NULL,     -- ordering within kanban columns
  sprint_id                UUID,                 -- soft FK to sprints table
  source                   TEXT NOT NULL,        -- human, agent
  metadata                 JSONB,

  -- Scoring
  priority                 TEXT,                 -- p0, p1, p2, p3
  effort                   TEXT,                 -- xs, s, m, l, xl
  strategic_alignment      TEXT,                 -- high, medium, low

  -- AI suggestions
  ai_priority_suggestion   TEXT,
  ai_effort_suggestion     TEXT,
  ai_alignment_suggestion  TEXT,
  ai_scoring_rationale     TEXT,

  -- Checkout lock
  checked_out_by           TEXT,
  checked_out_at           TIMESTAMP,

  -- References
  plan_path                TEXT,
  milestone_tag            TEXT,

  conversation_history     JSONB NOT NULL,       -- [] for system items
  created_at               TIMESTAMP NOT NULL,
  updated_at               TIMESTAMP NOT NULL
)
```

## Category Decision Guide

| Signal | Category |
|---|---|
| 500/504 errors, crashes, data loss | `bug` |
| Slow responses, timeouts, high latency | `performance` |
| Missing feature, new capability needed | `feature_request` |
| Confusing UI, bad UX flow | `ux` |
| Wrong copy, missing translations | `content` |
| Config issues, env vars, infra | `other` |
