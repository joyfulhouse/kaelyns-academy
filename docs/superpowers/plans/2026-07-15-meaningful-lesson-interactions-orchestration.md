# Meaningful Lesson Interactions Orchestration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every deployed lesson's answer-proxy UI with the direct, age-appropriate interaction approved in the design, while making scoring and evidence server-authoritative.

**Architecture:** Land one foundation branch first, then build three independent lesson-family branches from that commit, integrate them, and build the remaining literacy/language/content branches from the integrated base. Each activity remains a pluggable config/schema/logic/Player module. SVG is reserved for clocks, balances, and proportional geometry; DOM/CSS and dnd-kit handle tokens; Canvas remains journal-only. The host owns persistence and the single reward moment.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Zod 4, Tailwind CSS v4, Phosphor, motion/react, dnd-kit, Vitest, Playwright, bun.

**Approved design:** `docs/superpowers/specs/2026-07-14-meaningful-lesson-interactions-design.md`

## Global Constraints

- Use **bun** only. Never npm, yarn, or pnpm.
- Follow TDD for every behavior: add a failing pure-logic/schema/component-or-browser test, observe the expected failure, implement the smallest behavior, rerun the focused test, then run the branch gate.
- Never call `getDb()` or `getAuth()` at module scope; never add `eslint-disable`, `@ts-ignore`, provider SDKs, plaintext secrets, or dynamic Tailwind class construction.
- Preserve bounded child-facing AI. All generated configs remain schema-validated server-side and no open-ended child/LLM chat is introduced.
- Every pointer interaction has tap and keyboard parity, visible focus, a minimum 44px target, reduced-motion handling, and a textual accessible name.
- Players return only bounded response facts. They do not mint stars, persist mastery, or render the final reward. Server-safe plugin code validates the response and recomputes score/evidence.
- Activity-level `skillTags` are authoritative for authored activities. Config-carried skill fields are generated-item self-description only; authored duplicates must match exactly under tests or be removed.
- Prefer pure functions and shared primitives only when at least two consumers need them. Do not add a generic scene engine, universal drag abstraction, or Three.js.
- Do not import from `_archive/v2/`.
- Before any branch is called complete, run its focused tests plus `bun run lint && bun run typecheck && bun run test`. Before final integration, also run `bun run build` and the targeted Playwright suite.

## Worktree and dependency graph

```text
feature/lesson-interactions-foundation
  ├─ feature/lesson-life-skills-svg
  ├─ feature/lesson-structured-math
  └─ feature/lesson-order-writing
               │
               └── integration/lesson-wave-1
                     ├─ feature/lesson-literacy
                     └─ feature/lesson-language
                                  │
                                  └── integration/lesson-wave-2
                                        └─ feature/lesson-content-alignment
                                                   │
                                                   └─ integration/meaningful-lessons
```

Each worker creates an isolated worktree under `.claude/worktrees/` using `git worktree add`, runs `bun install --frozen-lockfile`, confirms the baseline focused tests, commits in task-sized increments, and reports the commit hashes. Workers never merge into another worker's branch. Foundation first splits the monolithic config file into per-kind modules and `kaelyn-adaptive` into per-unit modules. Plugin worktrees own only their per-kind contracts and affected unit files. `src/lib/ai/generable.ts`, `src/lib/ai/generated-validators.ts`, and shared aggregators have one later content/integration owner.

## Execution plans

1. `2026-07-15-lesson-interactions-foundation.md`
2. `2026-07-15-life-skills-svg-interactions.md`
3. `2026-07-15-structured-math-interactions.md`
4. `2026-07-15-order-writing-interactions.md`
5. `2026-07-15-literacy-interactions.md`
6. `2026-07-15-language-interactions.md`
7. `2026-07-15-curriculum-alignment-and-integration.md`

## Orchestration checklist

- [ ] Land the foundation plan and record its final commit as `FOUNDATION_BASE`.
- [ ] Branch life-skills, structured-math, and order-writing worktrees from `FOUNDATION_BASE`; execute all three in parallel.
- [ ] Cherry-pick those three branches into `integration/lesson-wave-1`; run lint, typecheck, and all unit tests.
- [ ] Branch literacy and language worktrees from the wave-1 integration commit and execute them in parallel.
- [ ] Integrate wave 2, then execute the content-alignment plan against that reviewed base so centralized AI/evidence files have one owner.
- [ ] Run the complete unit/build gate and targeted Playwright journeys for all 15 kinds.
- [ ] Request final code review from independent agents, including explicit regression, accessibility, content/evidence, and DRY/YAGNI passes.
- [ ] Address findings, rerun the full gate, and provide commit/test evidence in the handoff.
