---
description: "Execute the active sprint — research (with external review), implement, ship all scored sprint items, then deploy to production via /ship. Auto-activates next planning sprint if no active sprint exists. Runs autonomously, only pausing for genuinely ambiguous decisions."
allowed-tools: Agent, Bash, Edit, Glob, Grep, Read, Write, Skill, TaskCreate, TaskUpdate, TaskList, AskUserQuestion, WebFetch, SendMessage, EnterPlanMode, ExitPlanMode
user-invocable: true
argument-description: "Optional: sprint name/ID, priority filter (e.g. 'p0 p1'), or 'all'. Default: active sprint, all priorities."
---

# Sprint Execution: $ARGUMENTS

Read the full sprint skill at `.claude/skills/process-sprint.md` and follow it step by step.

**Filter**: $ARGUMENTS (if empty, process all items in the active sprint)

## Workflow

1. **Load Sprint** — Find or activate a sprint. If no active sprint, activate the next planning sprint automatically.
2. **Overview** — Present brief sprint summary, then **immediately start processing** — no confirmation needed.
3. **Wave Planning** — Analyze item dependencies, group by page/component affinity, build execution waves of independent groups.
4. **Wave Execution** (for each wave):
   - **Launch parallel worktree agents** (max 4 per wave) — each agent handles research + implement + typecheck + commit + PR for its item group
   - **Parallel review** all PRs from the wave (code-simplifier + code-reviewer + Codex + Gemini), then **sequential merge** to avoid lockfile conflicts
   - Pull main, mark items done
5. **Report** — Sprint progress: completed, deferred, remaining, waves used, parallel efficiency
6. **Ship to Production** — After sprint completes, automatically invoke `/ship` to deploy, verify canary, and clean up branches/worktrees

## Key Rules

- **Parallel by default.** Group independent items into waves and launch parallel worktree agents. Sequential is the fallback for items that can't be parallelized.
- **Autonomous by default.** Use best judgment and keep moving. Only ask the user for genuinely ambiguous decisions (conflicting requirements, destructive schema changes, major architectural shifts).
- **Items are already planned and scored.** Don't re-triage — implement what's approved.
- **Research depth scales with effort.** xs/s: just read the code. l/xl: use Explore agents, write plans. Research happens INSIDE each worktree agent, not as a separate phase.
- **External review for m/l/xl items.** Run Codex and Gemini adversarial reviews in parallel on the worktree. If either is unavailable, log and continue with the other — never block the sprint.
- **Defer items autonomously** if they clearly don't fit. Note in progress report, don't ask.
- **Group related items.** Same page/component = one worktree agent/PR. Different pages = parallel agents.
- **Review all wave PRs in parallel, merge sequentially.** Launch review agents simultaneously (Codex + Gemini + Claude code-reviewer), then merge one at a time to avoid lockfile conflicts.
- **Follow the merge checklist.** Every PR goes through code-simplifier + code-reviewer before merge.
- **Sprint completion triggers /ship.** No separate ship step needed — the sprint handles the full lifecycle through production deploy.
