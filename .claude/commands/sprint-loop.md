---
description: "Continuously execute sprints until all are complete. Each sprint runs in an isolated subagent with a fresh context window. Automatically activates the next planning sprint after each one finishes. When no sprints remain, runs sprint planning on backlog items."
allowed-tools: Agent, Bash, Read, Grep, Glob, Skill, TaskCreate, TaskUpdate, TaskList, AskUserQuestion, SendMessage
user-invocable: true
argument-description: "Optional: 'all' (default) to loop all sprints, or a number (e.g., '2') to limit how many sprints to execute."
---

# Sprint Loop: $ARGUMENTS

Read the full sprint-loop skill at `.claude/skills/sprint-loop.md` and follow it step by step.

**Limit**: $ARGUMENTS (if empty, loop until all sprints are complete)

**Parallelism**: Each sprint subagent MUST use wave-based parallel execution (process-sprint.md Steps 2.5-2.6) to process independent items concurrently. Sprints themselves remain sequential (each deploys before the next starts), but within each sprint, maximize throughput via parallel worktree agents.
