---
description: "Create work items in the production database from the system user. Supports bugs, features, performance issues, and operational tasks discovered during monitoring, debugging, or code review."
allowed-tools: Agent, Bash, Read, Grep, Glob, Write, Skill, TaskCreate, TaskUpdate, TaskList, AskUserQuestion
user-invocable: true
argument-description: "A natural-language description of the issue(s) to create. Can be a single item or multiple items separated by semicolons. Examples: 'bug: calendar sync times out every 15 min', 'p0 bug /api/health: 503 on startup', 'bug: OG card flex error; bug: missing seed prompt'. If empty, prompts interactively."
---

# Create Work Item: $ARGUMENTS

Read the full work-item skill at `.claude/skills/work-item.md` and follow it step by step.

**Input**: $ARGUMENTS (if empty, ask the user interactively via AskUserQuestion)

## Workflow

1. **Parse** — Extract title, category, priority, effort, alignment, and description from the input
2. **Deduplicate** — Search the database for existing items with similar titles before inserting
3. **Insert** — Create the work item(s) as the `system` tenant with `source = 'agent'`
4. **Batch** — If multiple items, insert all non-duplicates in a single statement
5. **Confirm** — Display the created item(s) with their IDs and scores

## Key Rules

- **Always use `system` as tenant_id** — these are system-detected issues, not user feedback
- **Always use `agent` as source** — distinguishes from human-submitted feedback
- **Always check for duplicates** — search by title similarity before inserting
- **Always escape single quotes** — double them (`'` → `''`) in all SQL string values
- **Default dev_status is `backlog`** — items land in backlog ready for sprint planning
- **Default status is `reviewed`** — system items skip the `new` triage stage
