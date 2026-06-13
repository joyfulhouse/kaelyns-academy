---
description: "Plan the next sprint — pull backlogged items, incorporate new feature ideas, score/prioritize, set capacity, and produce a ready-to-execute sprint."
allowed-tools: Agent, Bash, Edit, Glob, Grep, Read, Write, Skill, TaskCreate, TaskUpdate, TaskList, AskUserQuestion, WebFetch, SendMessage, EnterPlanMode, ExitPlanMode
user-invocable: true
argument-description: "Optional: 'new' to force a new sprint, a sprint name/ID to edit an existing one, or feature ideas to add (e.g. 'add: dark mode toggle, mobile nav redesign'). Default: edit existing planning sprint or create new."
---

# Sprint Planning: $ARGUMENTS

Read the full sprint-plan skill at `.claude/skills/sprint-plan.md` and follow it step by step.

**Input**: $ARGUMENTS (if empty, check for existing planning sprint or create new)

## Workflow

1. **Assess** — Check existing sprints, load backlog items
2. **Create/Update** — Create a new sprint or continue editing an existing planning sprint
3. **Score** — AI-score any unscored backlog items (priority, effort, alignment)
4. **Incorporate** — Add new feature ideas from user input as scored backlog items
5. **Propose** — Present the sprint plan with capacity analysis and recommended cuts
6. **Finalize** — Assign approved items to sprint, activate it
7. **Report** — Summary with effort breakdown. Next step: run `/sprint` to execute.

## Key Rules

- **Capacity is real.** Don't overload sprints. Under-commit, over-deliver.
- **Score everything.** No item enters the sprint without priority + effort + alignment.
- **User approves.** Present the plan and wait for confirmation before activating.
- **New features get scored too.** Feature ideas aren't free passes — evaluate against the roadmap.
