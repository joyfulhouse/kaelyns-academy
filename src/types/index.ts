// === Problem Types ===

export type MathOperation = 'addition' | 'subtraction' | 'placeValue' | 'skipCounting' | 'multiplication';

export type ReadingExercise = 'hearAndTap' | 'seeAndSay' | 'fillBlank' | 'letterSound' | 'blending';

export interface MathProblem {
  type: MathOperation;
  display: string;
  num1: number;
  num2: number;
  answer: number;
  options: number[];
  scaffoldSteps?: string[];
  level: number;
}

export interface ReadingProblem {
  type: ReadingExercise;
  display: string;
  answer: string;
  options: string[];
  sentence?: string;
  level: number;
}

export type Problem = MathProblem | ReadingProblem;

// === Progress Types ===

export interface SkillProgress {
  level: number;
  correctInLevel: number;
  wrongInSession: number;
  consecutiveCorrect: number;
  consecutiveWrong: number;
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
  lastSession: string;
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
  userMessage?: string;
}

export interface TutorResponse {
  text: string;
  audioUrl?: string;
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
