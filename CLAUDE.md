# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kaelyn's Academy (kaelyns.academy) is an AI-tutored learning app for a 6-7 year old. It provides adaptive math and reading exercises with a conversational AI tutor that speaks aloud via TTS. The app is intentionally minimal — two subjects, no configuration, no navigation maze.

**Subjects:**
- **Math**: Addition/subtraction (5 levels), place value, multiplication intro (skip counting to times tables)
- **Reading**: Dolch sight words (8 levels), phonics (letter sounds, CVC blending)

**Key features:**
- Adaptive difficulty engine (levels up/down based on performance)
- AI tutor via OpenRouter (scaffolding on wrong answers, encouragement, hints)
- OpenAI TTS via OpenRouter (every tutor response is spoken aloud)
- Cookie-based progress persistence (no accounts, no login)

## Commands

```bash
bun install          # Install dependencies
bun run dev          # Development server (localhost:3000)
bun run build        # Production build
bun start            # Run production server
bun run lint         # ESLint
bun test             # Run tests
```

## Architecture

### Tech Stack
- Next.js 16 with App Router (actual routes, not SPA)
- React 19 with TypeScript (strict mode)
- Tailwind CSS v4 with CSS variable theming
- OpenRouter API for chat completions + TTS
- No Redux — React context + useProgress hook

### Directory Structure

```
src/
├── app/
│   ├── page.tsx              # Home: Math or Reading picker
│   ├── math/page.tsx         # Math exercise loop (10 questions)
│   ├── reading/page.tsx      # Reading exercise loop (10 questions)
│   ├── api/
│   │   ├── chat/route.ts     # OpenRouter chat proxy
│   │   ├── tts/route.ts      # OpenRouter TTS proxy
│   │   └── progress/route.ts # Load/save progress cookies
│   ├── layout.tsx            # Root layout with ProgressProvider
│   └── globals.css           # Tailwind + CSS variables + animations
├── components/
│   ├── Tutor.tsx             # Chat bubble with owl avatar + TTS
│   ├── Problem.tsx           # Math or reading problem display
│   ├── AnswerButtons.tsx     # 2x2 colored answer grid
│   ├── ProgressBar.tsx       # Session progress bar
│   └── StarDisplay.tsx       # Star count display
├── lib/
│   ├── engine.ts             # Adaptive difficulty (level up/down, skill picking)
│   ├── mathProblems.ts       # Deterministic math problem generators
│   ├── readingProblems.ts    # Sight words + phonics generators
│   ├── openrouter.ts         # OpenRouter client (chat + TTS)
│   ├── tutorPrompt.ts        # AI tutor system prompt
│   ├── progress.ts           # Signed cookie persistence
│   └── sightWordLists.ts     # Dolch word data (8 levels)
├── hooks/
│   ├── useProgress.tsx       # Progress context provider + hook
│   └── useTutor.ts           # AI tutor state + TTS playback
└── types/
    └── index.ts              # All TypeScript interfaces
```

### Core Flow

```
Home (/) → Pick Math or Reading
  → /math or /reading
  → pickNextSkill() → getEffectiveLevel() → generateProblem()
  → Show problem + 4 answer buttons
  → On answer: processAnswer() → updateSkill() → ask tutor
  → Correct: encouragement → next problem
  → Wrong: scaffolding (AI) → next problem
  → After 10: summary + stars
```

### Adaptive Engine

- Tracks per-skill: level, correctInLevel, consecutiveCorrect/Wrong
- 3 correct in a row → problems get harder (within level)
- 2 wrong in a row → problems get easier
- 10 correct at level → level up + star
- 5 wrong in session → level down
- Skill unlocking: placeValue at addSub L2, multiply at addSub L3

### AI Integration

- **OpenRouter** for model flexibility (swap via `OPENROUTER_MODEL` env var)
- **System prompt** in `src/lib/tutorPrompt.ts` — tutor persona for 6-7 year old
- **Structured context** sent with each request (problem data, answer, steps) — AI never does math
- **TTS** via `openai/tts-1` through OpenRouter, voice: `nova`

### Environment Variables

```
OPENROUTER_API_KEY=     # Required
OPENROUTER_MODEL=anthropic/claude-sonnet-4  # Swappable
TTS_MODEL=openai/tts-1
SESSION_SECRET=change-me-in-production
```

## Key Patterns

### Path Aliases
Use `@/*` for imports (e.g., `@/components/Tutor`, `@/lib/engine`).

### Problem Generation
All deterministic — no AI needed. Problems generated instantly via `mathProblems.ts` and `readingProblems.ts`. Options always include 4 choices (correct answer + 3 distractors).

### Progress Persistence
Signed cookie (HMAC-SHA256). No database, no accounts. 30-day expiry.

### Audio
All tutor text is spoken via `/api/tts` → OpenAI TTS → blob URL → `<audio>` playback. Managed by `useTutor` hook.

## Coding Style

- TypeScript strict mode; functional React components with hooks
- `'use client'` directive required for client components
- Two-space indentation; PascalCase for components, camelCase for functions
- No Redux — use `useProgress` context hook for state
- Never disable linter rules — fix the root cause
- Use `bun` for all operations (never npm/yarn)

## Testing

- `bun test` runs all tests in `src/`
- Unit tests for: types, sight word data, math generators, reading generators, adaptive engine, progress signing
- Manual QA: verify exercise loops, TTS playback, progress persistence
