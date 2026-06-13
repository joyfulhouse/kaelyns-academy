---
name: process-sentry
description: Process and triage Sentry errors from production. Use this skill when the user mentions Sentry errors, production errors, error monitoring, error triage, wants to review unresolved issues, or runs /process-sentry. Covers the full lifecycle — fetching issues via the Sentry CLI, triaging by root cause, grouping related errors, fixing actionable bugs in worktrees, downgrading noise to warnings, resolving cleared issues, and reporting a summary.
---

# Process Sentry Errors

> **Note**: Create the `kaelyns-academy` Sentry project first (the project may not exist yet — set it up in Sentry, then add `SENTRY_ORG` and `SENTRY_PROJECT` to your environment or `.env`).

End-to-end workflow for triaging and resolving Sentry errors from production. Uses the `sentry` CLI to fetch unresolved issues, classify them, fix actionable bugs, and clear resolved issues.

## Prerequisites

This skill drives Sentry through the **`sentry` CLI** (https://cli.sentry.dev) for
both reads and writes. It handles authentication and org/project detection
automatically — no token wrangling. Confirm it's ready once per session:

```bash
sentry auth status      # expect: ✓ Authenticated. If not: sentry auth login
```

- **Org/project**: `kaelyns-academy/kaelyns-academy` (or whatever org slug is set in your Sentry account).
  Pass this explicitly to `list`/`explore` if auto-detection is ever wrong.
- The CLI's auth token lives in `~/.sentry/cli.db` (auto-refreshing), separate from `.env`.
- Use `--json --fields ...` for machine-readable triage; add `-f`/`--fresh` to bypass the local cache.

## Environment Filtering

Kaelyn's Academy runs a single production environment. Future staging is tracked as a P6 item.

**Default behavior of this skill:** process **production only**. Staging
errors would be surfaced separately once a staging environment exists.

| Environment | When to triage                         | Action on real bug                              | Action on noise                |
|-------------|----------------------------------------|--------------------------------------------------|--------------------------------|
| production  | Always — every run of this skill       | Fix in worktree → PR → ship to prod              | Downgrade to `captureNonCritical` |
| staging     | Future (P6) — staging environment not yet provisioned | — | — |

When fetching issues, append `environment:production` to the query string.

## Step 1: Fetch Unresolved Issues

Pull all unresolved **production** issues sorted by frequency:

```bash
# Human-readable (add -f to bypass the local cache)
sentry issue list kaelyns-academy/kaelyns-academy \
  --query "is:unresolved environment:production" --sort freq --limit 50
```

For machine-readable triage, select fields as JSON and shape with `jq`:

```bash
sentry issue list kaelyns-academy/kaelyns-academy \
  --query "is:unresolved environment:production" --sort freq --limit 50 \
  --json --fields shortId,title,culprit,count,userCount,priority,level,firstSeen,lastSeen,seerFixabilityScore \
  | jq -r '.[] | "[\(.shortId)] count=\(.count) users=\(.userCount) priority=\(.priority // "?") \(.level)\n   \((.title // "") | .[0:120])\n   \(.culprit // "?")  first=\((.firstSeen // "") | .[0:10]) last=\((.lastSeen // "") | .[0:10])"'
```

## Step 2: Get Event Details

For each issue, inspect its events for stack traces, tags, and source context.

```bash
# Issue detail + latest event
sentry issue view <issue-id>

# Production-only event spread with full bodies
sentry issue events <issue-id> --query "environment:production" --full --period 90d --limit 20

# Production-only release/tags/timestamps of recent events, as JSON
sentry issue events <issue-id> --query "environment:production" --period 90d --json \
  --fields eventID,dateCreated,title,tags | jq '.'
```

Optional Seer AI: `sentry issue explain <issue-id>` (root cause) and `sentry issue plan <issue-id>` (fix plan). Use judiciously — not as an automatic follow-up.

## Step 3: Triage and Classify

For each issue, read the affected source files and classify into one of these categories:

### Fixable Bug
A real code defect with a clear fix. Examples:
- Parse errors from incorrect data types
- Missing error handling (silent catches, unlogged failures)
- Variable hoisting or scoping bugs
- Hydration mismatches from non-deterministic rendering

**Action**: Proceed to fix in a worktree.

### Operational Noise
Expected failures captured at too high a severity level. Examples:
- WebSocket disconnections
- Rate limit responses
- Network timeouts on external APIs
- Transient DB connection blips caught by error boundaries

**Action**: Downgrade from `captureException` (error) to `captureNonCritical` (warning). Or resolve in Sentry if already handled.

### Stale Client
Errors from cached old client JS after a deploy. Examples:
- Module not found errors for deleted files
- Type mismatches from changed API contracts

**Action**: Resolve in Sentry (self-healing after cache expires). If recurring, ensure error boundary handles gracefully.

### Dead Code
Errors from code that is no longer imported/used but remains in the codebase.

**Action**: Delete the dead code, resolve in Sentry.

### Ambiguous
Root cause is unclear or fix requires design decisions.

**Action**: Use `AskUserQuestion` to present analysis and recommendation to the user.

## Step 4: Group Related Issues

Many Sentry issues share a root cause. Group them before fixing:
- Same source file + same error type = one fix
- Same close code from different paths = one severity change
- Same stale-client pattern across routes = one error boundary fix

Present a summary table:

```
| Group | Issues | Root Cause | Action | Fix Location |
|-------|--------|-----------|--------|-------------|
| A     | KA-2   | Stale server action | Error boundary reload | error-page.tsx |
| B     | KA-E,G | Tool response parse | Stringify response | some-hook.ts |
```

When Sentry has split **one** root cause into separate issues, collapse them with
`sentry issue merge <id1> <id2> --into <id1>` (largest group as canonical parent).
Only merge genuine duplicates — different root causes that happen to share a title stay separate.

## Step 5: Fix in Worktrees

For each fix group, create a worktree and implement. Follow project conventions:

1. Create branch: `fix/<descriptive-name>`
2. Read affected source files first
3. Apply the fix following the error handling patterns:
   - Server files: use `captureNonCritical` from `@/lib/logger`
   - Client files: use `captureNonCritical` from `@/lib/capture`
   - Fire-and-forget promises: `.catch((err) => captureNonCritical("...", err))`
   - Downgrade noise: replace `Sentry.captureException` with `captureNonCritical`
4. Run `bun run typecheck`
5. Commit with `fix:` prefix. Putting `Fixes KA-<id>` in the commit or PR body makes Sentry auto-resolve the issue on merge — skip Step 6 for those.
6. Push, create PR, merge

For parallel fixes (no file overlap), dispatch multiple worktree agents simultaneously.

## Step 6: Resolve Issues in Sentry

After fixes are merged — or for noise / self-healed / stale-client issues — clear the corresponding Sentry issues with the CLI.

> **Status mutations are issue-group-wide, not environment-scoped.** `resolve` and `archive` have no `--environment` flag — they clear the *entire* group. When you **fixed the root cause in code**, a global `resolve` is correct. For noise/stale-client resolutions without a code fix, verify there are no non-production events before clearing.

```bash
# Self-healed / already-handled noise / stale-client → plain resolve.
sentry issue resolve <issue-id>

# Just fixed in code → tie the resolution to the upcoming deploy:
sentry issue resolve <issue-id> --in @next
```

For noise that should be **silenced** rather than resolved, archive instead — and **ask the user first** (see Key Rules / "Ask before ignoring"):

```bash
sentry issue archive <issue-id> --until auto   # un-archives on a frequency spike
sentry issue archive <issue-id>                 # archive forever
```

Verify the board afterward:

```bash
sentry issue list kaelyns-academy/kaelyns-academy --query "is:unresolved environment:production" -f
```

## Step 7: Report Summary

Present a final summary:

```
## Sentry Triage Summary — YYYY-MM-DD

| # | Issue | Count | Category | Action Taken |
|---|-------|-------|----------|-------------|
| 1 | KA-XX | N | fixable_bug | Fixed in PR #NNN |
| 2 | KA-YY | N | noise | Downgraded to warning |
| 3 | KA-ZZ | N | stale_client | Resolved (self-healing) |

**Total**: X issues triaged, Y fixed, Z resolved, W ignored
```

## Red Flags — You're Rationalizing

| Thought | Reality |
|---|---|
| "This error is just noise, I'll resolve it without reading the code" | Every error deserves investigation. Noise today can mask a real bug tomorrow. |
| "The count is low, it's not worth fixing" | Low-count errors are often the hardest to reproduce later. Fix them now while you have the stack trace. |
| "I'll add a try/catch to suppress this" | Suppressing errors hides bugs. Fix the root cause or downgrade to `captureNonCritical` with context. |
| "This is a stale client error, just resolve it" | Confirm it's stale by checking the deploy timeline. If the error persists 24h after deploy, it's not stale. |
| "I know what this is without reading the event details" | Read the event. Stack traces contain context you can't guess from the title alone. |
| "I'll batch-resolve all these similar errors" | Group first, then resolve. Similar titles can have different root causes. |
| "The fix is obvious — just add a null check" | Null checks hide bugs. Find out WHY the value is null. |

## Error Handling Patterns Reference

The project uses a structured error handling hierarchy (see `src/lib/` for the actual implementations):

| Level | When |
|-------|------|
| Error (alerts) | Application bugs, unexpected failures |
| Warning (visible, no alert) | Analytics writes, notification failures, operational noise |
| User error (NOT sent to Sentry) | Input validation, 404s, gating |

Fire-and-forget promises must NEVER use empty `.catch(() => {})`. Always use:
```typescript
.catch((err) => captureNonCritical("Description of what failed", err))
```
