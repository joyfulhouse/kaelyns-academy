# Kaelyn's Academy v2 — Rebuild Design

**Date:** 2026-02-23
**Status:** Approved
**Goal:** Replace the current 12-section, 6,000 LOC learning app with a lean, AI-tutored experience that actually teaches a 6-7 year old math and reading.

## Problem Statement

The current app fails on every front for its target user (1st/2nd grader):
- **Too cluttered** — 12 sections, 8+ module choices, configurable practice settings
- **Not engaging** — no adaptive difficulty, no conversational feedback
- **Wrong difficulty** — goes up to 3-digit division; no progression system
- **Ineffective exercises** — random multiple-choice quizzes with no scaffolding when stuck

## Core Experience

Two-screen app with an always-present AI tutor.

**Home screen:** Two big buttons — Math and Reading. Nothing else.

**Exercise flow:**
1. Problem appears (deterministic generation, instant)
2. She answers
3. **Correct** — tutor speaks encouragement (AI-generated, varied), next problem
4. **Wrong** — tutor activates: breaks the problem into steps, walks her through it verbally, then gives a similar retry problem
5. After ~10 problems — tutor summarizes session, stars earned

**Adaptive engine (deterministic, no AI):**
- Tracks correct/incorrect per skill (e.g., "single-digit addition", "sight words level 2")
- 3 correct in a row — bump difficulty up
- 2 wrong in a row — bump difficulty down
- Missed problems return after 3-5 other problems (spaced repetition)

**AI tutor:**
- Always present as avatar + chat bubble at bottom of screen
- Every response spoken aloud via OpenAI TTS
- She can tap the tutor anytime to ask for help or hear an explanation
- Tutor uses simple sentences (under 15 words), fun analogies, never gives answers directly

## Math Curriculum

Three skill tracks, unlocked progressively:

### Track 1: Addition & Subtraction
- Level 1: Single digit (3 + 2, 7 - 4)
- Level 2: Single + double digit (8 + 15, 23 - 7)
- Level 3: Double digit no carrying (12 + 34, 46 - 23)
- Level 4: Double digit with carrying/borrowing (28 + 17, 43 - 26)
- Level 5: Triple digit (125 + 234, 367 - 142)

### Track 2: Place Value (unlocks after Level 2 add/sub)
- Woven into the problem flow, not a separate module
- Tutor occasionally asks: "In the number 47, which digit is in the tens place?"
- Visual: numbers shown with color-coded place columns when scaffolding

### Track 3: Multiplication Intro (unlocks after Level 3 add/sub)
- Level 1: Skip counting by 2s, 5s, 10s
- Level 2: Multiplication as groups ("3 groups of 4" with visual dots)
- Level 3: Times tables 1-5
- Level 4: Times tables 6-10

### Scaffolding Example (Math)

She sees: 28 + 17 = ? She answers: 35

Tutor speaks: "Almost! Let's break it into parts. First, what's 8 + 7?"
She answers 15.
"Yes! So we write down 5 and carry the 1. Now what's 2 + 1 + 1?"
She answers 4.
"So 28 + 17 = 45! Let's try another one like that."

AI generates the conversational response; problem data (numbers, correct answer, steps) is passed as structured context so the AI never does the math itself.

## Reading Curriculum

Two skill tracks:

### Track 1: Sight Words
- 8 levels using Dolch word lists (kept from v1)
- Level 1: "a", "I", "the", "is", "it" (pre-primer)
- Through Level 8: "have", "make", "want", "every" (3rd grade)
- Exercise types rotate:
  - **Hear & tap**: Tutor says a word, 4 buttons shown, tap the right one
  - **See & say**: Word shown, she taps to hear it, then taps "I know this!" or "Help me"
  - **Fill the blank**: Simple sentence with a missing word, pick from 3 options

### Track 2: Phonics (always available alongside sight words)
- Letter sounds (tap a letter, hear its sound)
- Blending: "What sound does C-A-T make?" — tutor sounds it out
- CVC words (consonant-vowel-consonant): bat, dog, sun, etc.
- Digraphs intro: sh, ch, th

### Scaffolding Example (Reading)

She sees: "The dog is ___." Options: big, dig, bag. She taps "dig".

Tutor speaks: "Hmm, let's look at that sentence again. 'The dog is...' — does 'dig' make sense? Dig means to make a hole. Which word describes the dog?"
She taps "big".
"That's right! The dog is big. Good thinking!"

## Architecture

Target: ~2,500 LOC across ~20 files.

```
src/
├── app/
│   ├── page.tsx              # Home: Math or Reading picker
│   ├── math/page.tsx         # Math exercise flow
│   ├── reading/page.tsx      # Reading exercise flow
│   ├── api/
│   │   ├── chat/route.ts     # OpenRouter proxy (LLM)
│   │   ├── tts/route.ts      # OpenRouter proxy (TTS)
│   │   └── progress/route.ts # Save/load progress
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── Tutor.tsx             # Avatar + chat bubble + TTS playback
│   ├── Problem.tsx           # Renders math or reading problem
│   ├── AnswerButtons.tsx     # 2-4 large tap targets
│   ├── ProgressBar.tsx       # Level progress + stars
│   └── Scaffold.tsx          # Step-by-step breakdown display
├── lib/
│   ├── engine.ts             # Adaptive difficulty engine
│   ├── mathProblems.ts       # Deterministic math generation
│   ├── readingProblems.ts    # Sight words + phonics generation
│   ├── openrouter.ts         # OpenRouter client (chat + TTS)
│   ├── progress.ts           # Cookie-based persistence
│   └── sightWordLists.ts     # Dolch word data (kept from v1)
├── hooks/
│   └── useProgress.ts        # Single hook for all progress tracking
└── types/
    └── index.ts              # Problem, Progress, TutorMessage types
```

### Key Technical Decisions

- **Next.js App Router** with actual routes (`/math`, `/reading`) instead of SPA section switching — browser back button works natively
- **No Redux** — `useProgress` hook with React context + cookie persistence. State is simple: current level per skill track, stars, session history
- **OpenRouter API** proxied through Next.js API routes (keeps API key server-side)
- **TTS audio** played via HTML5 `<audio>` element with blob URLs from the TTS endpoint
- **Tailwind CSS v4** — keep the color palette and design tokens from v1
- **Model configurable** via `OPENROUTER_MODEL` env var (default: `anthropic/claude-sonnet-4`, swappable to GPT-4o, Gemini, etc.)
- **TTS model**: `openai/tts-1` via OpenRouter

## AI Integration

### System Prompt (stored as file, not hardcoded)

```
You are Kaelyn's friendly math and reading tutor. You speak to a 6-7 year old.
- Use simple, short sentences (under 15 words)
- Be encouraging but honest
- When scaffolding: break problems into tiny steps, one at a time
- Never give the answer directly — guide her to find it
- Use fun analogies she'd understand (animals, food, toys)
- Vary your praise (don't just say "Great job!" every time)
```

### Structured Context Per Request

```json
{
  "problem": { "type": "addition", "num1": 28, "num2": 17, "answer": 45 },
  "studentAnswer": 35,
  "wasCorrect": false,
  "currentLevel": 4,
  "recentStreak": 3,
  "action": "scaffold"
}
```

The AI never does math — it explains pre-computed steps in a kid-friendly way.

### Cost Estimate

~$0.01-0.03 per session (10 problems, scaffolding on ~3 wrong answers, TTS on all tutor messages).

## Progress & Rewards

- Each skill track has levels (5 for add/sub, 4 for multiplication, 8 for sight words, 4 for phonics)
- **Level up** after 10 correct at current level (not necessarily consecutive)
- **Level down** after 5 wrong at current level in one session
- Stars: 1 per session completed, bonus star for 80%+ accuracy

### Progress Shape

```typescript
{
  math: { addSub: 3, placeValue: 2, multiply: 1 },
  reading: { sightWords: 4, phonics: 2 },
  stars: 47,
  lastSession: "2026-02-23"
}
```

No accounts, no login. Cookie-based persistence (same as v1). Cross-device sync is a future addition.

## What Gets Archived

- `kaelyn-math/` — move to `_archive/kaelyn-math/`
- `kaelyns-academy/src/` — delete and rebuild (keep `docs/`, `package.json` as starting point)

## Comparison: v1 vs v2

| | v1 (Current) | v2 (Rebuild) |
|---|---|---|
| Screens | 12 sections + nav | 3 pages (home, math, reading) |
| Choices for Kaelyn | Pick from 8+ modules | Pick Math or Reading |
| Difficulty | Manual selection | Adaptive engine |
| When stuck | Hidden "Need Help?" button | AI tutor walks through it step-by-step, out loud |
| Voice | Browser SpeechSynthesis | OpenAI TTS (natural voice) |
| LOC | ~6,000 | ~2,500 target |
| Files | ~45 | ~20 |
| AI | None | OpenRouter (model-swappable) for tutoring + TTS |
