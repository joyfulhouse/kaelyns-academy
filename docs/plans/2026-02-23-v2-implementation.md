# Kaelyn's Academy v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild Kaelyn's Academy as a lean, AI-tutored learning app with adaptive difficulty, OpenRouter LLM integration, and OpenAI TTS — targeting ~2,500 LOC across ~20 files.

**Architecture:** Next.js App Router with 3 routes (home, math, reading). Deterministic problem generation for instant UX. OpenRouter API for conversational tutoring and TTS. Cookie-based progress persistence via React context. No Redux.

**Tech Stack:** Next.js 16, React 19, TypeScript (strict), Tailwind CSS v4, OpenRouter (chat + TTS), bun

---

## Phase 0: Cleanup & Project Setup

### Task 1: Archive old code and reset project

**Files:**
- Move: `../kaelyn-math/` → `../_archive/kaelyn-math/`
- Delete: `src/` (entire directory)
- Keep: `docs/`, `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `tailwind.config.ts` (if exists)

**Step 1: Archive kaelyn-math**

```bash
mv /Users/bryanli/Projects/joyfulhouse/websites/kaelyn-math /Users/bryanli/Projects/joyfulhouse/websites/_archive/kaelyn-math
```

**Step 2: Back up current src before deleting**

```bash
cp -r src src.bak
```

**Step 3: Delete old src**

```bash
rm -rf src
```

**Step 4: Create new directory structure**

```bash
mkdir -p src/app/api/chat src/app/api/tts src/app/api/progress
mkdir -p src/app/math src/app/reading
mkdir -p src/components src/lib src/hooks src/types
```

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: archive kaelyn-math, clear src for v2 rebuild"
```

---

### Task 2: Update dependencies

**Files:**
- Modify: `package.json`
- Create: `.env.local`

**Step 1: Update package.json**

Replace contents with:

```json
{
  "name": "kaelyns-academy",
  "version": "2.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "bun test"
  },
  "dependencies": {
    "next": "^16.0.10",
    "react": "^19.2.1",
    "react-dom": "^19.2.1"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^22",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.0.8",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
```

Removed: `@reduxjs/toolkit`, `react-redux`, `js-cookie`, `@types/js-cookie`, `chrome-launcher`, `ws`

**Step 2: Create .env.local**

```
OPENROUTER_API_KEY=
OPENROUTER_MODEL=anthropic/claude-sonnet-4
TTS_MODEL=openai/tts-1
SESSION_SECRET=change-me-in-production
```

Note: User must add their OpenRouter API key.

**Step 3: Install**

```bash
bun install
```

**Step 4: Commit**

```bash
git add package.json bun.lock .env.local
git commit -m "chore: update deps for v2 — remove Redux, add OpenRouter config"
```

---

## Phase 1: Types & Data Layer

### Task 3: Define core types

**Files:**
- Create: `src/types/index.ts`
- Test: `src/types/index.test.ts`

**Step 1: Write types**

```typescript
// src/types/index.ts

// === Problem Types ===

export type MathOperation = 'addition' | 'subtraction' | 'placeValue' | 'skipCounting' | 'multiplication';

export type ReadingExercise = 'hearAndTap' | 'seeAndSay' | 'fillBlank' | 'letterSound' | 'blending';

export interface MathProblem {
  type: MathOperation;
  display: string;           // "28 + 17 = ?"
  num1: number;
  num2: number;
  answer: number;
  options: number[];          // 4 answer choices including correct
  scaffoldSteps?: string[];   // pre-computed steps for AI context
  level: number;
}

export interface ReadingProblem {
  type: ReadingExercise;
  display: string;            // the word or sentence
  answer: string;             // correct word
  options: string[];           // 3-4 choices
  sentence?: string;           // for fillBlank type
  level: number;
}

export type Problem = MathProblem | ReadingProblem;

// === Progress Types ===

export interface SkillProgress {
  level: number;
  correctInLevel: number;     // resets on level change
  wrongInSession: number;     // resets each session
  consecutiveCorrect: number; // for bump-up logic
  consecutiveWrong: number;   // for bump-down logic
}

export interface Progress {
  math: {
    addSub: SkillProgress;
    placeValue: SkillProgress;
    multiply: SkillProgress;
  };
  reading: {
    sightWords: SkillProgress;
    phonics: SkillProgress;
  };
  stars: number;
  lastSession: string;        // ISO date
}

// === Tutor Types ===

export type TutorAction = 'greet' | 'correct' | 'scaffold' | 'summarize' | 'hint' | 'chat';

export interface TutorRequest {
  action: TutorAction;
  problem?: Problem;
  studentAnswer?: number | string;
  wasCorrect?: boolean;
  currentLevel?: number;
  recentStreak?: number;
  sessionStats?: { correct: number; total: number };
  userMessage?: string;       // for free-form chat
}

export interface TutorResponse {
  text: string;
  audioUrl?: string;          // blob URL from TTS
}

// === Engine Types ===

export type Subject = 'math' | 'reading';

export type MathSkill = 'addSub' | 'placeValue' | 'multiply';
export type ReadingSkill = 'sightWords' | 'phonics';
export type Skill = MathSkill | ReadingSkill;

export const DEFAULT_PROGRESS: Progress = {
  math: {
    addSub: { level: 1, correctInLevel: 0, wrongInSession: 0, consecutiveCorrect: 0, consecutiveWrong: 0 },
    placeValue: { level: 1, correctInLevel: 0, wrongInSession: 0, consecutiveCorrect: 0, consecutiveWrong: 0 },
    multiply: { level: 1, correctInLevel: 0, wrongInSession: 0, consecutiveCorrect: 0, consecutiveWrong: 0 },
  },
  reading: {
    sightWords: { level: 1, correctInLevel: 0, wrongInSession: 0, consecutiveCorrect: 0, consecutiveWrong: 0 },
    phonics: { level: 1, correctInLevel: 0, wrongInSession: 0, consecutiveCorrect: 0, consecutiveWrong: 0 },
  },
  stars: 0,
  lastSession: '',
};
```

**Step 2: Write type validation test**

```typescript
// src/types/index.test.ts
import { describe, test, expect } from 'bun:test';
import { DEFAULT_PROGRESS } from './index';
import type { MathProblem, ReadingProblem, Progress, SkillProgress } from './index';

describe('types', () => {
  test('DEFAULT_PROGRESS has all required skills', () => {
    expect(DEFAULT_PROGRESS.math.addSub.level).toBe(1);
    expect(DEFAULT_PROGRESS.math.placeValue.level).toBe(1);
    expect(DEFAULT_PROGRESS.math.multiply.level).toBe(1);
    expect(DEFAULT_PROGRESS.reading.sightWords.level).toBe(1);
    expect(DEFAULT_PROGRESS.reading.phonics.level).toBe(1);
    expect(DEFAULT_PROGRESS.stars).toBe(0);
  });

  test('SkillProgress starts at zero', () => {
    const skill: SkillProgress = DEFAULT_PROGRESS.math.addSub;
    expect(skill.correctInLevel).toBe(0);
    expect(skill.wrongInSession).toBe(0);
    expect(skill.consecutiveCorrect).toBe(0);
    expect(skill.consecutiveWrong).toBe(0);
  });
});
```

**Step 3: Run test**

```bash
bun test src/types/index.test.ts
```

Expected: PASS

**Step 4: Commit**

```bash
git add src/types/
git commit -m "feat: add core type definitions for v2"
```

---

### Task 4: Port sight word data

**Files:**
- Create: `src/lib/sightWordLists.ts` (simplified from v1)

**Step 1: Write simplified sight word module**

Port from v1 but remove: curriculum switching (mutable global state), SIPPS curriculum, legacy exports. Keep: Dolch levels, `getWordsForLevel`, `getRandomWords`.

```typescript
// src/lib/sightWordLists.ts

export interface SightWordLevel {
  level: number;
  name: string;
  words: string[];
}

export const SIGHT_WORD_LEVELS: SightWordLevel[] = [
  { level: 1, name: 'First Words', words: ['a', 'I', 'the', 'to', 'and', 'is', 'it', 'you', 'my', 'we'] },
  { level: 2, name: 'Color Words', words: ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'black', 'white', 'brown'] },
  { level: 3, name: 'Action Words', words: ['go', 'see', 'look', 'come', 'run', 'play', 'like', 'can', 'said', 'went'] },
  { level: 4, name: 'People Words', words: ['he', 'she', 'me', 'we', 'they', 'him', 'her', 'mom', 'dad', 'friend'] },
  { level: 5, name: 'Question Words', words: ['what', 'where', 'who', 'when', 'why', 'how', 'are', 'was', 'were', 'do'] },
  { level: 6, name: 'Everyday Words', words: ['up', 'down', 'in', 'out', 'on', 'off', 'big', 'little', 'good', 'day'] },
  { level: 7, name: 'More Words', words: ['this', 'that', 'here', 'there', 'all', 'some', 'one', 'two', 'three', 'no'] },
  { level: 8, name: 'Story Words', words: ['have', 'has', 'had', 'make', 'made', 'want', 'help', 'find', 'say', 'yes'] },
];

export function getWordsForLevel(level: number): string[] {
  return SIGHT_WORD_LEVELS.find((l) => l.level === level)?.words ?? [];
}

export function getWordsUpToLevel(level: number): string[] {
  return SIGHT_WORD_LEVELS.filter((l) => l.level <= level).flatMap((l) => l.words);
}

export function getRandomWords(count: number, level: number): string[] {
  const words = getWordsForLevel(level);
  const shuffled = [...words].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export const TOTAL_LEVELS = SIGHT_WORD_LEVELS.length;
```

**Step 2: Write test**

```typescript
// src/lib/sightWordLists.test.ts
import { describe, test, expect } from 'bun:test';
import { getWordsForLevel, getWordsUpToLevel, getRandomWords, TOTAL_LEVELS, SIGHT_WORD_LEVELS } from './sightWordLists';

describe('sightWordLists', () => {
  test('has 8 levels', () => {
    expect(TOTAL_LEVELS).toBe(8);
  });

  test('each level has 10 words', () => {
    for (const level of SIGHT_WORD_LEVELS) {
      expect(level.words.length).toBe(10);
    }
  });

  test('getWordsForLevel returns correct level', () => {
    expect(getWordsForLevel(1)).toContain('the');
    expect(getWordsForLevel(2)).toContain('red');
  });

  test('getWordsForLevel returns empty for invalid level', () => {
    expect(getWordsForLevel(99)).toEqual([]);
  });

  test('getWordsUpToLevel accumulates', () => {
    const l1 = getWordsUpToLevel(1);
    const l2 = getWordsUpToLevel(2);
    expect(l1.length).toBe(10);
    expect(l2.length).toBe(20);
  });

  test('getRandomWords returns requested count', () => {
    const words = getRandomWords(4, 1);
    expect(words.length).toBe(4);
    // no duplicates
    expect(new Set(words).size).toBe(4);
  });

  test('getRandomWords caps at available words', () => {
    const words = getRandomWords(100, 1);
    expect(words.length).toBe(10);
  });
});
```

**Step 3: Run test**

```bash
bun test src/lib/sightWordLists.test.ts
```

Expected: PASS

**Step 4: Commit**

```bash
git add src/lib/sightWordLists.ts src/lib/sightWordLists.test.ts
git commit -m "feat: port Dolch sight word data (simplified from v1)"
```

---

### Task 5: Build math problem generators

**Files:**
- Create: `src/lib/mathProblems.ts`
- Test: `src/lib/mathProblems.test.ts`

**Step 1: Write math problem generators**

```typescript
// src/lib/mathProblems.ts
import type { MathProblem, MathOperation } from '@/types';

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeOptions(answer: number, count: number = 4): number[] {
  const opts = new Set<number>([answer]);
  while (opts.size < count) {
    const offset = randInt(1, Math.max(5, Math.floor(answer * 0.3)));
    const candidate = Math.random() > 0.5 ? answer + offset : Math.max(0, answer - offset);
    if (candidate !== answer) opts.add(candidate);
  }
  return shuffle([...opts]);
}

// Level ranges for addition/subtraction
const ADD_SUB_RANGES: Record<number, { min: number; max: number; carry: boolean }> = {
  1: { min: 1, max: 9, carry: false },
  2: { min: 1, max: 20, carry: false },
  3: { min: 10, max: 99, carry: false },
  4: { min: 10, max: 99, carry: true },
  5: { min: 100, max: 999, carry: true },
};

function needsCarry(a: number, b: number): boolean {
  while (a > 0 || b > 0) {
    if ((a % 10) + (b % 10) >= 10) return true;
    a = Math.floor(a / 10);
    b = Math.floor(b / 10);
  }
  return false;
}

function needsBorrow(a: number, b: number): boolean {
  while (a > 0 || b > 0) {
    if ((a % 10) < (b % 10)) return true;
    a = Math.floor(a / 10);
    b = Math.floor(b / 10);
  }
  return false;
}

export function generateAddSub(level: number): MathProblem {
  const config = ADD_SUB_RANGES[Math.min(level, 5)] ?? ADD_SUB_RANGES[5];
  const isAdd = Math.random() > 0.5;

  for (let attempt = 0; attempt < 50; attempt++) {
    let num1 = randInt(config.min, config.max);
    let num2 = randInt(config.min, Math.min(num1, config.max));

    if (config.carry && isAdd && !needsCarry(num1, num2)) continue;
    if (config.carry && !isAdd && !needsBorrow(num1, num2)) continue;
    if (!config.carry && isAdd && needsCarry(num1, num2)) continue;
    if (!config.carry && !isAdd && needsBorrow(num1, num2)) continue;

    const answer = isAdd ? num1 + num2 : num1 - num2;
    if (answer < 0) continue;

    const op = isAdd ? '+' : '-';
    const steps = isAdd
      ? [`What is ${num1 % 10} + ${num2 % 10}?`, `Now add the tens: ${Math.floor(num1 / 10)} + ${Math.floor(num2 / 10)}`]
      : [`What is ${num1 % 10} - ${num2 % 10}?`, `Now subtract the tens`];

    return {
      type: isAdd ? 'addition' : 'subtraction',
      display: `${num1} ${op} ${num2} = ?`,
      num1, num2, answer,
      options: makeOptions(answer),
      scaffoldSteps: steps,
      level,
    };
  }

  // Fallback: simple single-digit
  const num1 = randInt(1, 9);
  const num2 = randInt(1, num1);
  const answer = isAdd ? num1 + num2 : num1 - num2;
  return {
    type: isAdd ? 'addition' : 'subtraction',
    display: `${num1} ${isAdd ? '+' : '-'} ${num2} = ?`,
    num1, num2, answer,
    options: makeOptions(answer),
    level,
  };
}

export function generatePlaceValue(level: number): MathProblem {
  const maxDigits = Math.min(level + 1, 4); // level 1 = 2 digits, level 3 = 4 digits
  const min = Math.pow(10, maxDigits - 1);
  const max = Math.pow(10, maxDigits) - 1;
  const num = randInt(min, max);

  const places = ['ones', 'tens', 'hundreds', 'thousands'];
  const placeIdx = randInt(0, maxDigits - 1);
  const placeName = places[placeIdx];
  const answer = Math.floor(num / Math.pow(10, placeIdx)) % 10;

  return {
    type: 'placeValue',
    display: `What digit is in the ${placeName} place of ${num}?`,
    num1: num,
    num2: placeIdx,
    answer,
    options: makeOptions(answer, 4).map(n => Math.abs(n) % 10),
    level,
  };
}

// Skip counting ranges by level
const SKIP_RANGES: Record<number, number[]> = {
  1: [2, 5, 10],
  2: [3, 4, 6],
  3: [7, 8, 9],
};

export function generateMultiply(level: number): MathProblem {
  if (level <= 3) {
    // Skip counting
    const factors = SKIP_RANGES[Math.min(level, 3)] ?? [2, 5, 10];
    const by = factors[randInt(0, factors.length - 1)];
    const count = randInt(2, 6);
    const answer = by * count;
    return {
      type: 'skipCounting',
      display: `Count by ${by}s: ${by}, ${by * 2}, ${by * 3}, ... what comes at position ${count}?`,
      num1: by,
      num2: count,
      answer,
      options: makeOptions(answer),
      level,
    };
  }

  // Times tables
  const maxFactor = level <= 4 ? 5 : 10;
  const num1 = randInt(1, maxFactor);
  const num2 = randInt(1, maxFactor);
  const answer = num1 * num2;
  return {
    type: 'multiplication',
    display: `${num1} × ${num2} = ?`,
    num1, num2, answer,
    options: makeOptions(answer),
    scaffoldSteps: [`Think of ${num1} groups of ${num2}`, `${num1} × ${num2} = ${answer}`],
    level,
  };
}

// Master dispatcher
export function generateMathProblem(skill: 'addSub' | 'placeValue' | 'multiply', level: number): MathProblem {
  switch (skill) {
    case 'addSub': return generateAddSub(level);
    case 'placeValue': return generatePlaceValue(level);
    case 'multiply': return generateMultiply(level);
  }
}
```

**Step 2: Write tests**

```typescript
// src/lib/mathProblems.test.ts
import { describe, test, expect } from 'bun:test';
import { generateAddSub, generatePlaceValue, generateMultiply, generateMathProblem } from './mathProblems';

describe('generateAddSub', () => {
  test('level 1 produces single-digit problems', () => {
    for (let i = 0; i < 20; i++) {
      const p = generateAddSub(1);
      expect(p.num1).toBeGreaterThanOrEqual(1);
      expect(p.num1).toBeLessThanOrEqual(9);
      expect(p.num2).toBeGreaterThanOrEqual(1);
      expect(p.num2).toBeLessThanOrEqual(9);
      expect(p.options).toContain(p.answer);
      expect(p.options.length).toBe(4);
      expect(p.answer).toBeGreaterThanOrEqual(0);
    }
  });

  test('answer is always correct', () => {
    for (let i = 0; i < 50; i++) {
      const p = generateAddSub(3);
      if (p.type === 'addition') {
        expect(p.answer).toBe(p.num1 + p.num2);
      } else {
        expect(p.answer).toBe(p.num1 - p.num2);
      }
    }
  });

  test('options always contain the correct answer', () => {
    for (let i = 0; i < 50; i++) {
      const p = generateAddSub(2);
      expect(p.options).toContain(p.answer);
    }
  });
});

describe('generatePlaceValue', () => {
  test('answer matches the correct digit', () => {
    for (let i = 0; i < 20; i++) {
      const p = generatePlaceValue(1);
      const numStr = String(p.num1);
      const digits = numStr.split('').reverse();
      expect(p.answer).toBe(Number(digits[p.num2]));
    }
  });

  test('options contain correct answer', () => {
    for (let i = 0; i < 20; i++) {
      const p = generatePlaceValue(2);
      expect(p.options).toContain(p.answer);
    }
  });
});

describe('generateMultiply', () => {
  test('level 1-3 generates skip counting', () => {
    const p = generateMultiply(1);
    expect(p.type).toBe('skipCounting');
    expect(p.answer).toBe(p.num1 * p.num2);
  });

  test('level 4+ generates multiplication', () => {
    const p = generateMultiply(4);
    expect(p.type).toBe('multiplication');
    expect(p.answer).toBe(p.num1 * p.num2);
    expect(p.num1).toBeLessThanOrEqual(5);
    expect(p.num2).toBeLessThanOrEqual(5);
  });
});

describe('generateMathProblem', () => {
  test('dispatches to correct generator', () => {
    const add = generateMathProblem('addSub', 1);
    expect(['addition', 'subtraction']).toContain(add.type);

    const pv = generateMathProblem('placeValue', 1);
    expect(pv.type).toBe('placeValue');

    const mul = generateMathProblem('multiply', 1);
    expect(mul.type).toBe('skipCounting');
  });
});
```

**Step 3: Run tests**

```bash
bun test src/lib/mathProblems.test.ts
```

Expected: PASS

**Step 4: Commit**

```bash
git add src/lib/mathProblems.ts src/lib/mathProblems.test.ts
git commit -m "feat: add math problem generators (add/sub, place value, multiply)"
```

---

### Task 6: Build reading problem generators

**Files:**
- Create: `src/lib/readingProblems.ts`
- Test: `src/lib/readingProblems.test.ts`

**Step 1: Write reading problem generators**

```typescript
// src/lib/readingProblems.ts
import type { ReadingProblem, ReadingExercise } from '@/types';
import { getWordsForLevel, getRandomWords } from './sightWordLists';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Simple sentences using sight words for fill-in-the-blank
const SENTENCE_TEMPLATES: Record<number, Array<{ sentence: string; word: string; distractors: string[] }>> = {
  1: [
    { sentence: 'I see ___ dog.', word: 'a', distractors: ['is', 'it'] },
    { sentence: '___ like to play.', word: 'I', distractors: ['a', 'it'] },
    { sentence: 'Come to ___ house.', word: 'my', distractors: ['is', 'it'] },
    { sentence: '___ can run fast.', word: 'you', distractors: ['the', 'a'] },
    { sentence: 'It ___ a cat.', word: 'is', distractors: ['my', 'we'] },
  ],
  2: [
    { sentence: 'The sky is ___.', word: 'blue', distractors: ['red', 'big'] },
    { sentence: 'I have a ___ ball.', word: 'red', distractors: ['run', 'see'] },
    { sentence: 'The sun is ___.', word: 'yellow', distractors: ['green', 'black'] },
  ],
  3: [
    { sentence: 'Let us ___ and play!', word: 'go', distractors: ['he', 'is'] },
    { sentence: '___ at the bird!', word: 'look', distractors: ['can', 'my'] },
    { sentence: 'I ___ to jump.', word: 'like', distractors: ['said', 'went'] },
    { sentence: 'She ___ hello.', word: 'said', distractors: ['run', 'see'] },
  ],
  4: [
    { sentence: '___ is my friend.', word: 'she', distractors: ['me', 'we'] },
    { sentence: 'Give it to ___.', word: 'him', distractors: ['she', 'they'] },
    { sentence: '___ went to school.', word: 'they', distractors: ['her', 'me'] },
  ],
  5: [
    { sentence: '___ is your name?', word: 'what', distractors: ['who', 'how'] },
    { sentence: '___ do you live?', word: 'where', distractors: ['when', 'why'] },
    { sentence: '___ are you today?', word: 'how', distractors: ['what', 'who'] },
  ],
};

// CVC words for phonics
const CVC_WORDS = ['cat', 'bat', 'hat', 'mat', 'rat', 'sat', 'dog', 'hog', 'log', 'fog',
  'sun', 'bun', 'fun', 'run', 'gun', 'cup', 'pup', 'bus', 'bug', 'rug',
  'pen', 'hen', 'ten', 'men', 'den', 'pig', 'big', 'dig', 'fig', 'wig'];

const LETTER_SOUNDS: Record<string, string> = {
  a: 'ah', b: 'buh', c: 'kuh', d: 'duh', e: 'eh', f: 'fuh', g: 'guh',
  h: 'huh', i: 'ih', j: 'juh', k: 'kuh', l: 'luh', m: 'muh', n: 'nuh',
  o: 'ah', p: 'puh', q: 'kwuh', r: 'ruh', s: 'suh', t: 'tuh', u: 'uh',
  v: 'vuh', w: 'wuh', x: 'ks', y: 'yuh', z: 'zuh',
};

export function generateSightWord(level: number): ReadingProblem {
  const exerciseTypes: ReadingExercise[] = ['hearAndTap', 'seeAndSay', 'fillBlank'];
  const type = randItem(exerciseTypes);

  if (type === 'fillBlank') {
    const templates = SENTENCE_TEMPLATES[Math.min(level, 5)] ?? SENTENCE_TEMPLATES[1];
    const template = randItem(templates);
    return {
      type: 'fillBlank',
      display: template.sentence,
      answer: template.word,
      options: shuffle([template.word, ...template.distractors]),
      sentence: template.sentence,
      level,
    };
  }

  const words = getWordsForLevel(level);
  const answer = randItem(words);
  const distractors = getRandomWords(3, level).filter(w => w !== answer);
  while (distractors.length < 3) {
    const fallback = getRandomWords(1, Math.max(1, level - 1));
    if (fallback[0] !== answer && !distractors.includes(fallback[0])) {
      distractors.push(fallback[0]);
    }
  }

  return {
    type,
    display: answer,
    answer,
    options: shuffle([answer, ...distractors.slice(0, 3)]),
    level,
  };
}

export function generatePhonics(level: number): ReadingProblem {
  if (level <= 2) {
    // Letter sounds
    const letter = String.fromCharCode(97 + Math.floor(Math.random() * 26));
    const sound = LETTER_SOUNDS[letter];
    const otherLetters = shuffle(Object.keys(LETTER_SOUNDS).filter(l => l !== letter)).slice(0, 3);
    return {
      type: 'letterSound',
      display: `What letter makes the "${sound}" sound?`,
      answer: letter,
      options: shuffle([letter, ...otherLetters]),
      level,
    };
  }

  // CVC blending
  const word = randItem(CVC_WORDS);
  const distractors = shuffle(CVC_WORDS.filter(w => w !== word)).slice(0, 3);
  return {
    type: 'blending',
    display: `Blend: ${word.split('').join(' - ')}`,
    answer: word,
    options: shuffle([word, ...distractors]),
    level,
  };
}

export function generateReadingProblem(skill: 'sightWords' | 'phonics', level: number): ReadingProblem {
  return skill === 'sightWords' ? generateSightWord(level) : generatePhonics(level);
}
```

**Step 2: Write tests**

```typescript
// src/lib/readingProblems.test.ts
import { describe, test, expect } from 'bun:test';
import { generateSightWord, generatePhonics, generateReadingProblem } from './readingProblems';

describe('generateSightWord', () => {
  test('returns valid problem with options containing answer', () => {
    for (let i = 0; i < 20; i++) {
      const p = generateSightWord(1);
      expect(p.options).toContain(p.answer);
      expect(p.options.length).toBeGreaterThanOrEqual(3);
      expect(p.level).toBe(1);
    }
  });

  test('fillBlank type includes sentence', () => {
    // Run enough times to hit fillBlank
    let foundFillBlank = false;
    for (let i = 0; i < 50; i++) {
      const p = generateSightWord(1);
      if (p.type === 'fillBlank') {
        expect(p.sentence).toBeDefined();
        expect(p.sentence).toContain('___');
        foundFillBlank = true;
        break;
      }
    }
    // It's random, but 50 tries should hit it
    expect(foundFillBlank).toBe(true);
  });
});

describe('generatePhonics', () => {
  test('level 1-2 generates letter sounds', () => {
    const p = generatePhonics(1);
    expect(p.type).toBe('letterSound');
    expect(p.answer.length).toBe(1);
    expect(p.options).toContain(p.answer);
  });

  test('level 3+ generates blending', () => {
    const p = generatePhonics(3);
    expect(p.type).toBe('blending');
    expect(p.answer.length).toBe(3); // CVC words
    expect(p.display).toContain(' - ');
  });
});

describe('generateReadingProblem', () => {
  test('dispatches correctly', () => {
    const sw = generateReadingProblem('sightWords', 1);
    expect(['hearAndTap', 'seeAndSay', 'fillBlank']).toContain(sw.type);

    const ph = generateReadingProblem('phonics', 1);
    expect(['letterSound', 'blending']).toContain(ph.type);
  });
});
```

**Step 3: Run tests**

```bash
bun test src/lib/readingProblems.test.ts
```

Expected: PASS

**Step 4: Commit**

```bash
git add src/lib/readingProblems.ts src/lib/readingProblems.test.ts
git commit -m "feat: add reading problem generators (sight words, phonics)"
```

---

### Task 7: Build adaptive difficulty engine

**Files:**
- Create: `src/lib/engine.ts`
- Test: `src/lib/engine.test.ts`

**Step 1: Write adaptive engine**

```typescript
// src/lib/engine.ts
import type { SkillProgress, MathSkill, ReadingSkill } from '@/types';

const LEVEL_UP_THRESHOLD = 10;    // correct answers needed to level up
const BUMP_UP_STREAK = 3;         // consecutive correct → bump difficulty
const BUMP_DOWN_STREAK = 2;       // consecutive wrong → bump difficulty down
const SESSION_FAIL_LIMIT = 5;     // wrong in session → level down

const MAX_LEVELS: Record<string, number> = {
  addSub: 5,
  placeValue: 3,
  multiply: 6,
  sightWords: 8,
  phonics: 4,
};

export interface EngineResult {
  updatedProgress: SkillProgress;
  shouldLevelUp: boolean;
  shouldLevelDown: boolean;
  earnedStar: boolean;
}

export function processAnswer(
  skill: MathSkill | ReadingSkill,
  progress: SkillProgress,
  wasCorrect: boolean,
): EngineResult {
  const maxLevel = MAX_LEVELS[skill] ?? 5;
  const updated = { ...progress };

  if (wasCorrect) {
    updated.correctInLevel += 1;
    updated.consecutiveCorrect += 1;
    updated.consecutiveWrong = 0;
  } else {
    updated.wrongInSession += 1;
    updated.consecutiveWrong += 1;
    updated.consecutiveCorrect = 0;
  }

  let shouldLevelUp = false;
  let shouldLevelDown = false;

  // Level up: enough correct at this level
  if (updated.correctInLevel >= LEVEL_UP_THRESHOLD && updated.level < maxLevel) {
    shouldLevelUp = true;
    updated.level += 1;
    updated.correctInLevel = 0;
    updated.wrongInSession = 0;
  }

  // Level down: too many wrong in one session
  if (updated.wrongInSession >= SESSION_FAIL_LIMIT && updated.level > 1) {
    shouldLevelDown = true;
    updated.level -= 1;
    updated.correctInLevel = 0;
    updated.wrongInSession = 0;
  }

  // Star earned on level up
  const earnedStar = shouldLevelUp;

  return { updatedProgress: updated, shouldLevelUp, shouldLevelDown, earnedStar };
}

export function getEffectiveLevel(progress: SkillProgress): number {
  // Temporarily bump difficulty for hot streaks
  if (progress.consecutiveCorrect >= BUMP_UP_STREAK) {
    return progress.level; // stay at level but next problems will be harder within level
  }
  // Temporarily ease difficulty for cold streaks
  if (progress.consecutiveWrong >= BUMP_DOWN_STREAK) {
    return Math.max(1, progress.level - 1);
  }
  return progress.level;
}

export function isSkillUnlocked(skill: MathSkill | ReadingSkill, mathAddSubLevel: number): boolean {
  switch (skill) {
    case 'addSub': return true;
    case 'placeValue': return mathAddSubLevel >= 2;
    case 'multiply': return mathAddSubLevel >= 3;
    case 'sightWords': return true;
    case 'phonics': return true;
    default: return true;
  }
}

export function pickNextSkill(
  subject: 'math' | 'reading',
  mathLevels: { addSub: number; placeValue: number; multiply: number },
): MathSkill | ReadingSkill {
  if (subject === 'reading') {
    // Alternate between sight words and phonics
    return Math.random() > 0.6 ? 'sightWords' : 'phonics';
  }

  // Math: weighted random based on what's unlocked
  const candidates: MathSkill[] = ['addSub'];
  if (isSkillUnlocked('placeValue', mathLevels.addSub)) candidates.push('placeValue');
  if (isSkillUnlocked('multiply', mathLevels.addSub)) candidates.push('multiply');

  // Weight toward addSub (core skill)
  const weights = candidates.map(s => s === 'addSub' ? 3 : 1);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * totalWeight;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return 'addSub';
}
```

**Step 2: Write tests**

```typescript
// src/lib/engine.test.ts
import { describe, test, expect } from 'bun:test';
import { processAnswer, getEffectiveLevel, isSkillUnlocked, pickNextSkill } from './engine';
import type { SkillProgress } from '@/types';

function freshProgress(level: number = 1): SkillProgress {
  return { level, correctInLevel: 0, wrongInSession: 0, consecutiveCorrect: 0, consecutiveWrong: 0 };
}

describe('processAnswer', () => {
  test('increments correctInLevel on correct answer', () => {
    const result = processAnswer('addSub', freshProgress(), true);
    expect(result.updatedProgress.correctInLevel).toBe(1);
    expect(result.updatedProgress.consecutiveCorrect).toBe(1);
  });

  test('increments wrongInSession on wrong answer', () => {
    const result = processAnswer('addSub', freshProgress(), false);
    expect(result.updatedProgress.wrongInSession).toBe(1);
    expect(result.updatedProgress.consecutiveWrong).toBe(1);
  });

  test('levels up after 10 correct', () => {
    const progress = { ...freshProgress(), correctInLevel: 9 };
    const result = processAnswer('addSub', progress, true);
    expect(result.shouldLevelUp).toBe(true);
    expect(result.updatedProgress.level).toBe(2);
    expect(result.updatedProgress.correctInLevel).toBe(0);
    expect(result.earnedStar).toBe(true);
  });

  test('does not level up past max', () => {
    const progress = { ...freshProgress(5), correctInLevel: 9 };
    const result = processAnswer('addSub', progress, true);
    expect(result.shouldLevelUp).toBe(false);
    expect(result.updatedProgress.level).toBe(5);
  });

  test('levels down after 5 wrong in session', () => {
    const progress = { ...freshProgress(3), wrongInSession: 4 };
    const result = processAnswer('addSub', progress, false);
    expect(result.shouldLevelDown).toBe(true);
    expect(result.updatedProgress.level).toBe(2);
  });

  test('does not level down below 1', () => {
    const progress = { ...freshProgress(1), wrongInSession: 4 };
    const result = processAnswer('addSub', progress, false);
    expect(result.shouldLevelDown).toBe(false);
    expect(result.updatedProgress.level).toBe(1);
  });
});

describe('getEffectiveLevel', () => {
  test('returns base level normally', () => {
    expect(getEffectiveLevel(freshProgress(3))).toBe(3);
  });

  test('drops level on cold streak', () => {
    const p = { ...freshProgress(3), consecutiveWrong: 2 };
    expect(getEffectiveLevel(p)).toBe(2);
  });

  test('does not drop below 1', () => {
    const p = { ...freshProgress(1), consecutiveWrong: 2 };
    expect(getEffectiveLevel(p)).toBe(1);
  });
});

describe('isSkillUnlocked', () => {
  test('addSub always unlocked', () => {
    expect(isSkillUnlocked('addSub', 1)).toBe(true);
  });

  test('placeValue unlocks at addSub level 2', () => {
    expect(isSkillUnlocked('placeValue', 1)).toBe(false);
    expect(isSkillUnlocked('placeValue', 2)).toBe(true);
  });

  test('multiply unlocks at addSub level 3', () => {
    expect(isSkillUnlocked('multiply', 2)).toBe(false);
    expect(isSkillUnlocked('multiply', 3)).toBe(true);
  });

  test('reading skills always unlocked', () => {
    expect(isSkillUnlocked('sightWords', 1)).toBe(true);
    expect(isSkillUnlocked('phonics', 1)).toBe(true);
  });
});

describe('pickNextSkill', () => {
  test('math always includes addSub', () => {
    for (let i = 0; i < 20; i++) {
      const skill = pickNextSkill('math', { addSub: 1, placeValue: 1, multiply: 1 });
      expect(['addSub', 'placeValue', 'multiply']).toContain(skill);
    }
  });

  test('reading returns sightWords or phonics', () => {
    for (let i = 0; i < 20; i++) {
      const skill = pickNextSkill('reading', { addSub: 1, placeValue: 1, multiply: 1 });
      expect(['sightWords', 'phonics']).toContain(skill);
    }
  });
});
```

**Step 3: Run tests**

```bash
bun test src/lib/engine.test.ts
```

Expected: PASS

**Step 4: Commit**

```bash
git add src/lib/engine.ts src/lib/engine.test.ts
git commit -m "feat: add adaptive difficulty engine with level up/down logic"
```

---

### Task 8: Build OpenRouter client

**Files:**
- Create: `src/lib/openrouter.ts`
- Create: `src/lib/tutorPrompt.ts`

**Step 1: Write tutor system prompt**

```typescript
// src/lib/tutorPrompt.ts

export const TUTOR_SYSTEM_PROMPT = `You are a friendly, encouraging tutor helping a 6-7 year old named Kaelyn learn math and reading.

Rules:
- Use simple, short sentences (under 15 words each)
- Be warm and encouraging, but honest when she gets something wrong
- When scaffolding: break problems into tiny steps, one at a time
- NEVER give the answer directly — guide her to find it herself
- Use fun comparisons she'd understand (animals, food, toys, colors)
- Vary your praise — don't repeat the same phrase twice in a row
- Keep responses under 3 sentences unless scaffolding
- For scaffolding, ask ONE question at a time and wait for her response

You will receive structured data about the current problem. Use it to give accurate guidance. Never do the math yourself — the data tells you the correct answer and steps.`;
```

**Step 2: Write OpenRouter client**

```typescript
// src/lib/openrouter.ts

import type { TutorRequest, TutorResponse } from '@/types';
import { TUTOR_SYSTEM_PROMPT } from './tutorPrompt';

function buildUserMessage(req: TutorRequest): string {
  switch (req.action) {
    case 'greet':
      return 'Kaelyn just started a new session. Greet her warmly and ask if she is ready.';

    case 'correct':
      return `Kaelyn answered correctly! Problem: ${req.problem?.display}. Her streak is ${req.recentStreak}. Give brief, varied encouragement.`;

    case 'scaffold': {
      const steps = (req.problem && 'scaffoldSteps' in req.problem && req.problem.scaffoldSteps)
        ? `\nScaffold steps: ${req.problem.scaffoldSteps.join(' → ')}`
        : '';
      return `Kaelyn answered "${req.studentAnswer}" but the correct answer is ${req.problem?.answer}. Problem: ${req.problem?.display}.${steps}\nBreak this into simple steps. Ask her the first small step.`;
    }

    case 'summarize':
      return `Session done! Kaelyn got ${req.sessionStats?.correct} out of ${req.sessionStats?.total}. Summarize warmly and encourage her to come back.`;

    case 'hint':
      return `Kaelyn is asking for help with: ${req.problem?.display}. Give a small hint without revealing the answer.`;

    case 'chat':
      return `Kaelyn says: "${req.userMessage}". Respond helpfully in context of her learning session.`;

    default:
      return req.userMessage ?? 'Say something encouraging.';
  }
}

export async function chatCompletion(req: TutorRequest): Promise<string> {
  const model = process.env.OPENROUTER_MODEL ?? 'anthropic/claude-sonnet-4';
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://kaelyns.academy',
      'X-Title': "Kaelyn's Academy",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: TUTOR_SYSTEM_PROMPT },
        { role: 'user', content: buildUserMessage(req) },
      ],
      max_tokens: 200,
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter error: ${response.status} ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? 'Great job, keep going!';
}

export async function textToSpeech(text: string): Promise<ArrayBuffer> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const ttsModel = process.env.TTS_MODEL ?? 'openai/tts-1';

  const response = await fetch('https://openrouter.ai/api/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ttsModel,
      input: text,
      voice: 'nova',
      response_format: 'mp3',
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`TTS error: ${response.status} ${err}`);
  }

  return response.arrayBuffer();
}
```

**Step 3: Commit** (no automated test for API calls — tested manually and via integration)

```bash
git add src/lib/openrouter.ts src/lib/tutorPrompt.ts
git commit -m "feat: add OpenRouter client for chat and TTS"
```

---

### Task 9: Build progress persistence

**Files:**
- Create: `src/lib/progress.ts`
- Test: `src/lib/progress.test.ts`

**Step 1: Write progress cookie helpers**

```typescript
// src/lib/progress.ts
import { cookies } from 'next/headers';
import { createHmac } from 'crypto';
import type { Progress } from '@/types';
import { DEFAULT_PROGRESS } from '@/types';

const COOKIE_NAME = 'ka-progress';
const SIG_COOKIE = 'ka-sig';
const MAX_AGE = 30 * 24 * 60 * 60; // 30 days

function getSecret(): string {
  return process.env.SESSION_SECRET ?? 'dev-secret-change-in-prod';
}

function sign(data: string): string {
  return createHmac('sha256', getSecret()).update(data).digest('hex');
}

export async function loadProgress(): Promise<Progress> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  const sig = cookieStore.get(SIG_COOKIE)?.value;

  if (!raw || !sig) return { ...DEFAULT_PROGRESS };

  if (sign(raw) !== sig) return { ...DEFAULT_PROGRESS };

  try {
    return JSON.parse(raw) as Progress;
  } catch {
    return { ...DEFAULT_PROGRESS };
  }
}

export async function saveProgress(progress: Progress): Promise<void> {
  const cookieStore = await cookies();
  const raw = JSON.stringify(progress);

  cookieStore.set(COOKIE_NAME, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: MAX_AGE,
    path: '/',
  });

  cookieStore.set(SIG_COOKIE, sign(raw), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: MAX_AGE,
    path: '/',
  });
}
```

**Step 2: Write sign/verify unit test**

```typescript
// src/lib/progress.test.ts
import { describe, test, expect } from 'bun:test';
import { createHmac } from 'crypto';
import { DEFAULT_PROGRESS } from '@/types';

// Test the signing logic directly (can't test cookies outside Next.js)
function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

describe('progress signing', () => {
  test('sign produces consistent output', () => {
    const data = JSON.stringify(DEFAULT_PROGRESS);
    const sig1 = sign(data, 'test-secret');
    const sig2 = sign(data, 'test-secret');
    expect(sig1).toBe(sig2);
  });

  test('different secrets produce different signatures', () => {
    const data = JSON.stringify(DEFAULT_PROGRESS);
    const sig1 = sign(data, 'secret-a');
    const sig2 = sign(data, 'secret-b');
    expect(sig1).not.toBe(sig2);
  });

  test('tampered data fails verification', () => {
    const data = JSON.stringify(DEFAULT_PROGRESS);
    const sig = sign(data, 'test-secret');
    const tampered = data.replace('"stars":0', '"stars":999');
    expect(sign(tampered, 'test-secret')).not.toBe(sig);
  });
});
```

**Step 3: Run tests**

```bash
bun test src/lib/progress.test.ts
```

Expected: PASS

**Step 4: Commit**

```bash
git add src/lib/progress.ts src/lib/progress.test.ts
git commit -m "feat: add cookie-based progress persistence with HMAC signing"
```

---

## Phase 2: API Routes

### Task 10: Build API routes

**Files:**
- Create: `src/app/api/chat/route.ts`
- Create: `src/app/api/tts/route.ts`
- Create: `src/app/api/progress/route.ts`

**Step 1: Chat API route**

```typescript
// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { chatCompletion } from '@/lib/openrouter';
import type { TutorRequest } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as TutorRequest;
    const text = await chatCompletion(body);
    return NextResponse.json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

**Step 2: TTS API route**

```typescript
// src/app/api/tts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { textToSpeech } from '@/lib/openrouter';

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json() as { text: string };
    if (!text || text.length > 500) {
      return NextResponse.json({ error: 'Text required (max 500 chars)' }, { status: 400 });
    }
    const audio = await textToSpeech(text);
    return new NextResponse(audio, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

**Step 3: Progress API route**

```typescript
// src/app/api/progress/route.ts
import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { loadProgress, saveProgress } from '@/lib/progress';
import type { Progress } from '@/types';

export async function GET() {
  const progress = await loadProgress();
  return NextResponse.json(progress);
}

export async function POST(request: NextRequest) {
  try {
    const progress = await request.json() as Progress;
    await saveProgress(progress);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

**Step 4: Commit**

```bash
git add src/app/api/
git commit -m "feat: add API routes for chat, TTS, and progress"
```

---

## Phase 3: React Hooks & Context

### Task 11: Build useProgress hook

**Files:**
- Create: `src/hooks/useProgress.ts`

**Step 1: Write the hook**

```typescript
// src/hooks/useProgress.ts
'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { Progress, Skill } from '@/types';
import { DEFAULT_PROGRESS } from '@/types';
import type { SkillProgress } from '@/types';

interface ProgressContextType {
  progress: Progress;
  updateSkill: (subject: 'math' | 'reading', skill: string, updates: Partial<SkillProgress>) => void;
  addStar: () => void;
  loading: boolean;
}

const ProgressContext = createContext<ProgressContextType | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<Progress>(DEFAULT_PROGRESS);
  const [loading, setLoading] = useState(true);

  // Load on mount
  useEffect(() => {
    fetch('/api/progress')
      .then(res => res.json())
      .then(data => setProgress(data))
      .catch(() => setProgress(DEFAULT_PROGRESS))
      .finally(() => setLoading(false));
  }, []);

  // Save on change (debounced)
  useEffect(() => {
    if (loading) return;
    const timer = setTimeout(() => {
      fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(progress),
      }).catch(console.error);
    }, 500);
    return () => clearTimeout(timer);
  }, [progress, loading]);

  const updateSkill = useCallback((subject: 'math' | 'reading', skill: string, updates: Partial<SkillProgress>) => {
    setProgress(prev => ({
      ...prev,
      [subject]: {
        ...prev[subject],
        [skill]: { ...(prev[subject] as Record<string, SkillProgress>)[skill], ...updates },
      },
    }));
  }, []);

  const addStar = useCallback(() => {
    setProgress(prev => ({ ...prev, stars: prev.stars + 1 }));
  }, []);

  return (
    <ProgressContext value={{ progress, updateSkill, addStar, loading }}>
      {children}
    </ProgressContext>
  );
}

export function useProgress() {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error('useProgress must be used within ProgressProvider');
  return ctx;
}
```

**Step 2: Commit**

```bash
git add src/hooks/useProgress.ts
git commit -m "feat: add useProgress hook with context provider and auto-save"
```

---

### Task 12: Build useTutor hook

**Files:**
- Create: `src/hooks/useTutor.ts`

**Step 1: Write the hook**

```typescript
// src/hooks/useTutor.ts
'use client';

import { useState, useCallback, useRef } from 'react';
import type { TutorRequest, TutorResponse } from '@/types';

export function useTutor() {
  const [messages, setMessages] = useState<TutorResponse[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const speak = useCallback(async (text: string) => {
    setSpeaking(true);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error('TTS failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }

      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setSpeaking(false);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => setSpeaking(false);
      await audio.play();
    } catch {
      setSpeaking(false);
    }
  }, []);

  const ask = useCallback(async (req: TutorRequest): Promise<string> => {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      if (!res.ok) throw new Error('Chat failed');
      const { text } = await res.json();
      setMessages(prev => [...prev, { text }]);
      await speak(text);
      return text;
    } catch {
      const fallback = 'Keep going, you are doing great!';
      setMessages(prev => [...prev, { text: fallback }]);
      return fallback;
    }
  }, [speak]);

  const clearMessages = useCallback(() => setMessages([]), []);

  return { messages, speaking, ask, speak, clearMessages };
}
```

**Step 2: Commit**

```bash
git add src/hooks/useTutor.ts
git commit -m "feat: add useTutor hook with chat and TTS integration"
```

---

## Phase 4: UI Components

### Task 13: Build globals.css and layout

**Files:**
- Create: `src/app/globals.css` (trimmed from v1 — keep colors, fonts, core animations; drop carry/borrow/stacked-math specifics)
- Create: `src/app/layout.tsx`

**Step 1: Write globals.css**

Keep from v1: `:root` color variables, `@theme inline` block, body styles, font config, `.btn` classes, `.card` class, `.feedback` classes, `.progress-bar` class, core animations (`fadeSlideIn`, `popIn`, `celebrate`, `shake`, `bounceIn`, `fadeIn`).

Drop from v1: All carry/borrow animations, `.digit-input`, `.carry-digit`, `.borrow-indicator`, `.visualization-bubble`, `.nav-pill`, `.timeline`, place value color classes, stacked math styles.

**Step 2: Write layout.tsx**

```typescript
// src/app/layout.tsx
import type { Metadata } from 'next';
import { Fredoka, Nunito } from 'next/font/google';
import { ProgressProvider } from '@/hooks/useProgress';
import './globals.css';

const fredoka = Fredoka({ subsets: ['latin'], variable: '--font-fredoka' });
const nunito = Nunito({ subsets: ['latin'], variable: '--font-nunito' });

export const metadata: Metadata = {
  title: "Kaelyn's Academy",
  description: 'Learn math and reading with your AI tutor',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fredoka.variable} ${nunito.variable}`}>
      <body>
        <ProgressProvider>
          {children}
        </ProgressProvider>
      </body>
    </html>
  );
}
```

**Step 3: Verify build compiles**

```bash
bun run build
```

Expected: Compiles (may have warnings about missing pages, that's fine).

**Step 4: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat: add layout with ProgressProvider and trimmed globals.css"
```

---

### Task 14: Build shared UI components

**Files:**
- Create: `src/components/Tutor.tsx`
- Create: `src/components/Problem.tsx`
- Create: `src/components/AnswerButtons.tsx`
- Create: `src/components/ProgressBar.tsx`
- Create: `src/components/StarDisplay.tsx`

**Step 1: Tutor component**

A chat bubble at the bottom of the screen showing the tutor's latest message. Includes a small avatar icon, the text, and a pulsing indicator when speaking.

```typescript
// src/components/Tutor.tsx
'use client';
import { useTutor } from '@/hooks/useTutor';

interface TutorProps {
  messages: Array<{ text: string }>;
  speaking: boolean;
  onTap?: () => void;
}

export function Tutor({ messages, speaking, onTap }: TutorProps) {
  const latestMessage = messages[messages.length - 1]?.text;

  return (
    <button
      onClick={onTap}
      className="fixed bottom-4 left-4 right-4 mx-auto max-w-lg flex items-center gap-3 bg-paper border-2 border-coral-light rounded-xl p-4 shadow-lifted transition-all hover:shadow-float active:scale-[0.98] z-50"
      aria-label="Talk to tutor"
    >
      {/* Avatar */}
      <div className="relative shrink-0 w-12 h-12 rounded-full bg-coral flex items-center justify-center text-2xl">
        🦉
        {speaking && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-sage rounded-full animate-pulse-scale" />
        )}
      </div>

      {/* Message */}
      <p className="text-sm text-chocolate leading-snug text-left flex-1 min-h-[40px] flex items-center">
        {latestMessage ?? 'Tap me for help!'}
      </p>
    </button>
  );
}
```

**Step 2: Problem component**

Displays the current problem. For math: large number display. For reading: large word or sentence.

```typescript
// src/components/Problem.tsx
'use client';
import type { Problem, MathProblem, ReadingProblem } from '@/types';

interface ProblemProps {
  problem: Problem;
}

export function ProblemDisplay({ problem }: ProblemProps) {
  if ('num1' in problem) {
    return <MathDisplay problem={problem} />;
  }
  return <ReadingDisplay problem={problem} />;
}

function MathDisplay({ problem }: { problem: MathProblem }) {
  return (
    <div className="animate-fade-slide-in text-center py-8">
      <p className="font-display text-5xl md:text-6xl text-chocolate tracking-wide">
        {problem.display}
      </p>
    </div>
  );
}

function ReadingDisplay({ problem }: { problem: ReadingProblem }) {
  if (problem.type === 'fillBlank') {
    return (
      <div className="animate-fade-slide-in text-center py-8">
        <p className="font-display text-3xl md:text-4xl text-chocolate">
          {problem.sentence}
        </p>
      </div>
    );
  }

  if (problem.type === 'blending') {
    return (
      <div className="animate-fade-slide-in text-center py-8">
        <p className="font-body text-lg text-chocolate-muted mb-2">Blend these sounds:</p>
        <p className="font-display text-5xl md:text-6xl text-coral tracking-[0.3em]">
          {problem.answer.split('').join(' · ')}
        </p>
      </div>
    );
  }

  // hearAndTap, seeAndSay, letterSound
  return (
    <div className="animate-fade-slide-in text-center py-8">
      <p className="font-display text-6xl md:text-7xl text-chocolate">
        {problem.display}
      </p>
    </div>
  );
}
```

**Step 3: AnswerButtons component**

2x2 grid of large, colorful tap targets.

```typescript
// src/components/AnswerButtons.tsx
'use client';
import { useState } from 'react';

const COLORS = ['bg-coral', 'bg-sage', 'bg-sky', 'bg-yellow'];

interface AnswerButtonsProps {
  options: (string | number)[];
  onAnswer: (answer: string | number) => void;
  disabled?: boolean;
  correctAnswer?: string | number;
  showResult?: boolean;
}

export function AnswerButtons({ options, onAnswer, disabled, correctAnswer, showResult }: AnswerButtonsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
      {options.map((opt, i) => {
        let extraClass = '';
        if (showResult && opt === correctAnswer) extraClass = 'ring-4 ring-sage animate-celebrate';
        if (showResult && opt !== correctAnswer) extraClass = 'opacity-50';

        return (
          <button
            key={`${opt}-${i}`}
            onClick={() => onAnswer(opt)}
            disabled={disabled}
            className={`${COLORS[i % COLORS.length]} text-white font-display text-2xl md:text-3xl py-5 rounded-xl shadow-medium transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed min-h-[64px] ${extraClass}`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
```

**Step 4: ProgressBar component**

```typescript
// src/components/ProgressBar.tsx
'use client';

interface ProgressBarProps {
  current: number;
  total: number;
  label?: string;
}

export function ProgressBar({ current, total, label }: ProgressBarProps) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="w-full">
      {label && <p className="text-sm text-chocolate-muted mb-1 font-body">{label}</p>}
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
```

**Step 5: StarDisplay component**

```typescript
// src/components/StarDisplay.tsx
'use client';
import { useProgress } from '@/hooks/useProgress';

export function StarDisplay() {
  const { progress } = useProgress();
  return (
    <div className="flex items-center gap-1 text-yellow font-display text-lg">
      <span>⭐</span>
      <span>{progress.stars}</span>
    </div>
  );
}
```

**Step 6: Commit**

```bash
git add src/components/
git commit -m "feat: add core UI components (Tutor, Problem, AnswerButtons, ProgressBar, StarDisplay)"
```

---

## Phase 5: Pages

### Task 15: Build home page

**Files:**
- Create: `src/app/page.tsx`

**Step 1: Write home page**

Two big buttons: Math and Reading. Star count in top corner. Clean, minimal.

```typescript
// src/app/page.tsx
'use client';
import Link from 'next/link';
import { StarDisplay } from '@/components/StarDisplay';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 px-4">
      {/* Header */}
      <div className="absolute top-4 right-4">
        <StarDisplay />
      </div>

      {/* Title */}
      <div className="text-center animate-fade-slide-in">
        <h1 className="font-display text-4xl md:text-5xl text-chocolate mb-2">
          Kaelyn's Academy
        </h1>
        <p className="font-body text-chocolate-muted text-lg">What do you want to learn?</p>
      </div>

      {/* Subject Buttons */}
      <div className="flex flex-col sm:flex-row gap-6 w-full max-w-md">
        <Link
          href="/math"
          className="flex-1 bg-coral hover:bg-coral-dark text-white font-display text-3xl py-10 rounded-2xl shadow-lifted text-center transition-all hover:scale-105 active:scale-95 hover:shadow-float"
        >
          <span className="text-5xl block mb-2">🔢</span>
          Math
        </Link>

        <Link
          href="/reading"
          className="flex-1 bg-sage hover:bg-sage-dark text-white font-display text-3xl py-10 rounded-2xl shadow-lifted text-center transition-all hover:scale-105 active:scale-95 hover:shadow-float"
        >
          <span className="text-5xl block mb-2">📖</span>
          Reading
        </Link>
      </div>
    </main>
  );
}
```

**Step 2: Verify dev server loads**

```bash
bun run dev &
sleep 3
curl -s http://localhost:3000 | head -20
kill %1
```

Expected: HTML response with "Kaelyn's Academy"

**Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add home page with Math/Reading subject picker"
```

---

### Task 16: Build math exercise page

**Files:**
- Create: `src/app/math/page.tsx`

This is the core exercise loop. It:
1. Picks a skill via the engine
2. Generates a problem
3. Shows it with answer buttons
4. Processes the answer via the engine
5. Calls the tutor for feedback
6. Repeats

**Step 1: Write math page**

```typescript
// src/app/math/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useProgress } from '@/hooks/useProgress';
import { useTutor } from '@/hooks/useTutor';
import { ProblemDisplay } from '@/components/Problem';
import { AnswerButtons } from '@/components/AnswerButtons';
import { ProgressBar } from '@/components/ProgressBar';
import { Tutor } from '@/components/Tutor';
import { StarDisplay } from '@/components/StarDisplay';
import { generateMathProblem } from '@/lib/mathProblems';
import { processAnswer, getEffectiveLevel, pickNextSkill } from '@/lib/engine';
import type { MathProblem, MathSkill } from '@/types';

const SESSION_LENGTH = 10;

export default function MathPage() {
  const { progress, updateSkill, addStar } = useProgress();
  const { messages, speaking, ask } = useTutor();

  const [currentProblem, setCurrentProblem] = useState<MathProblem | null>(null);
  const [currentSkill, setCurrentSkill] = useState<MathSkill>('addSub');
  const [questionNum, setQuestionNum] = useState(0);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [sessionDone, setSessionDone] = useState(false);

  const nextProblem = useCallback(() => {
    const skill = pickNextSkill('math', {
      addSub: progress.math.addSub.level,
      placeValue: progress.math.placeValue.level,
      multiply: progress.math.multiply.level,
    }) as MathSkill;

    const skillProgress = progress.math[skill];
    const level = getEffectiveLevel(skillProgress);
    const problem = generateMathProblem(skill, level);

    setCurrentSkill(skill);
    setCurrentProblem(problem);
    setShowResult(false);
    setAnswered(false);
  }, [progress]);

  // Initial greeting + first problem
  useEffect(() => {
    ask({ action: 'greet' });
    nextProblem();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAnswer = useCallback(async (answer: string | number) => {
    if (answered || !currentProblem) return;
    setAnswered(true);
    setShowResult(true);

    const wasCorrect = Number(answer) === currentProblem.answer;
    const result = processAnswer(currentSkill, progress.math[currentSkill], wasCorrect);

    // Update progress
    updateSkill('math', currentSkill, result.updatedProgress);
    if (result.earnedStar) addStar();

    const newCorrect = wasCorrect ? sessionCorrect + 1 : sessionCorrect;
    if (wasCorrect) setSessionCorrect(newCorrect);
    const newQuestionNum = questionNum + 1;
    setQuestionNum(newQuestionNum);

    // Tutor feedback
    if (wasCorrect) {
      await ask({
        action: 'correct',
        problem: currentProblem,
        wasCorrect: true,
        recentStreak: result.updatedProgress.consecutiveCorrect,
      });
    } else {
      await ask({
        action: 'scaffold',
        problem: currentProblem,
        studentAnswer: answer,
        wasCorrect: false,
        currentLevel: result.updatedProgress.level,
      });
    }

    // Next problem or end session
    if (newQuestionNum >= SESSION_LENGTH) {
      setSessionDone(true);
      await ask({
        action: 'summarize',
        sessionStats: { correct: newCorrect, total: SESSION_LENGTH },
      });
      if (newCorrect >= Math.floor(SESSION_LENGTH * 0.8)) addStar();
    } else {
      setTimeout(() => nextProblem(), 1500);
    }
  }, [answered, currentProblem, currentSkill, progress, sessionCorrect, questionNum, ask, updateSkill, addStar, nextProblem]);

  if (sessionDone) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 pb-24">
        <div className="text-center animate-bounceIn">
          <p className="text-6xl mb-4">🌟</p>
          <h1 className="font-display text-3xl text-chocolate mb-2">Session Complete!</h1>
          <p className="font-display text-5xl text-coral">{sessionCorrect}/{SESSION_LENGTH}</p>
        </div>
        <div className="flex gap-4">
          <button onClick={() => { setSessionDone(false); setQuestionNum(0); setSessionCorrect(0); nextProblem(); }} className="btn btn-primary btn-large">
            Play Again
          </button>
          <Link href="/" className="btn btn-ghost btn-large">Home</Link>
        </div>
        <Tutor messages={messages} speaking={speaking} />
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center gap-6 px-4 pt-6 pb-24">
      {/* Top bar */}
      <div className="w-full max-w-lg flex items-center justify-between">
        <Link href="/" className="text-chocolate-muted text-2xl">←</Link>
        <ProgressBar current={questionNum} total={SESSION_LENGTH} />
        <StarDisplay />
      </div>

      {/* Problem */}
      {currentProblem && (
        <>
          <ProblemDisplay problem={currentProblem} />
          <AnswerButtons
            options={currentProblem.options}
            onAnswer={handleAnswer}
            disabled={answered}
            correctAnswer={currentProblem.answer}
            showResult={showResult}
          />
        </>
      )}

      {/* Tutor */}
      <Tutor
        messages={messages}
        speaking={speaking}
        onTap={() => currentProblem && ask({ action: 'hint', problem: currentProblem })}
      />
    </main>
  );
}
```

**Step 2: Verify it renders**

```bash
bun run dev &
sleep 3
curl -s http://localhost:3000/math | head -20
kill %1
```

**Step 3: Commit**

```bash
git add src/app/math/
git commit -m "feat: add math exercise page with adaptive loop and AI tutor"
```

---

### Task 17: Build reading exercise page

**Files:**
- Create: `src/app/reading/page.tsx`

**Step 1: Write reading page**

Same exercise loop pattern as math, but uses reading problem generators and reading skills. Functionally very similar to the math page but with reading-specific display.

Follow the same structure as `src/app/math/page.tsx` but:
- Use `generateReadingProblem` instead of `generateMathProblem`
- Use `pickNextSkill('reading', ...)` for skill selection
- Compare answers as strings instead of numbers
- For `hearAndTap` type: tutor speaks the word first, then shows options
- For `seeAndSay` type: show word, let her tap to hear it

**Step 2: Verify it renders**

```bash
bun run dev &
sleep 3
curl -s http://localhost:3000/reading | head -20
kill %1
```

**Step 3: Commit**

```bash
git add src/app/reading/
git commit -m "feat: add reading exercise page with sight words and phonics"
```

---

## Phase 6: Integration & Polish

### Task 18: Run full build and lint

**Step 1: Lint**

```bash
bun run lint
```

Fix any issues.

**Step 2: Build**

```bash
bun run build
```

Fix any type errors.

**Step 3: Run all tests**

```bash
bun test
```

Expected: All tests pass.

**Step 4: Commit fixes**

```bash
git add -A
git commit -m "fix: resolve lint and build errors"
```

---

### Task 19: Update CLAUDE.md for v2

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Rewrite CLAUDE.md**

Update to reflect v2 architecture: new directory structure, no Redux, OpenRouter integration, adaptive engine, simplified component list. Remove all references to v1 sections (CarryOver, Borrowing, StackedMath, etc.), Redux slices, and old API routes.

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for v2 architecture"
```

---

### Task 20: Manual QA with dev server

**Step 1: Start dev server**

```bash
bun run dev
```

**Step 2: Test checklist** (manual, using browser or chrome-test skill):

- [ ] Home page loads with Math/Reading buttons
- [ ] Star count shows in corner
- [ ] Math button navigates to /math
- [ ] Math problems appear with 4 answer options
- [ ] Correct answer: tutor speaks encouragement, next problem loads
- [ ] Wrong answer: tutor speaks scaffolding explanation
- [ ] Progress bar advances per question
- [ ] Session ends after 10 questions with summary
- [ ] "Play Again" resets session
- [ ] Home button returns to /
- [ ] Reading button navigates to /reading
- [ ] Sight words display correctly at various levels
- [ ] Fill-in-blank shows sentence with gap
- [ ] Phonics blending shows separated letters
- [ ] TTS plays for all tutor messages
- [ ] Back button (browser) works between pages
- [ ] Progress persists across page refreshes (cookie)
- [ ] Touch targets are minimum 48px on mobile viewport

**Step 3: Fix any issues found, commit**

```bash
git add -A
git commit -m "fix: QA fixes from manual testing"
```

---

### Task 21: Delete backup and final commit

**Step 1: Remove src.bak**

```bash
rm -rf src.bak
```

**Step 2: Final commit**

```bash
git add -A
git commit -m "chore: remove v1 backup, v2 rebuild complete"
```

---

## Summary

| Phase | Tasks | What's Built |
|-------|-------|-------------|
| 0 | 1-2 | Archive old code, update deps |
| 1 | 3-9 | Types, data, generators, engine, OpenRouter client, progress |
| 2 | 10 | API routes (chat, TTS, progress) |
| 3 | 11-12 | React hooks (useProgress, useTutor) |
| 4 | 13-14 | Layout, globals.css, UI components |
| 5 | 15-17 | Home, math, and reading pages |
| 6 | 18-21 | Build, lint, CLAUDE.md, QA, cleanup |

**Estimated file count:** ~22 files
**Estimated LOC:** ~2,500
