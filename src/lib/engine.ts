import type { Skill, MathSkill, ReadingSkill, SkillProgress, Subject } from '@/types';

// === Constants ===

export const LEVEL_UP_THRESHOLD = 10;
export const BUMP_DOWN_STREAK = 2;
export const SESSION_FAIL_LIMIT = 5;

export const MAX_LEVELS: Record<Skill, number> = {
  addSub: 5,
  placeValue: 3,
  multiply: 6,
  sightWords: 8,
  phonics: 4,
};

// === Answer Processing ===

export interface ProcessResult {
  progress: SkillProgress;
  levelUp: boolean;
  levelDown: boolean;
  earnedStar: boolean;
}

export function processAnswer(
  skill: Skill,
  progress: SkillProgress,
  wasCorrect: boolean,
): ProcessResult {
  const updated: SkillProgress = { ...progress };
  let levelUp = false;
  let levelDown = false;
  let earnedStar = false;

  if (wasCorrect) {
    updated.correctInLevel++;
    updated.consecutiveCorrect++;
    updated.consecutiveWrong = 0;

    // Check for level up
    if (updated.correctInLevel >= LEVEL_UP_THRESHOLD && updated.level < MAX_LEVELS[skill]) {
      updated.level++;
      updated.correctInLevel = 0;
      updated.consecutiveCorrect = 0;
      updated.wrongInSession = 0;
      levelUp = true;
      earnedStar = true;
    }
  } else {
    updated.wrongInSession++;
    updated.consecutiveWrong++;
    updated.consecutiveCorrect = 0;

    // Check for level down
    if (updated.wrongInSession >= SESSION_FAIL_LIMIT && updated.level > 1) {
      updated.level--;
      updated.correctInLevel = 0;
      updated.consecutiveCorrect = 0;
      updated.consecutiveWrong = 0;
      updated.wrongInSession = 0;
      levelDown = true;
    }
  }

  return { progress: updated, levelUp, levelDown, earnedStar };
}

// === Effective Level ===

export function getEffectiveLevel(progress: SkillProgress): number {
  // Drop effective level when on a cold streak
  if (progress.consecutiveWrong >= BUMP_DOWN_STREAK && progress.level > 1) {
    return progress.level - 1;
  }
  return progress.level;
}

// === Skill Unlock Logic ===

export function isSkillUnlocked(skill: Skill, mathAddSubLevel: number): boolean {
  switch (skill) {
    case 'addSub':
      return true;
    case 'placeValue':
      return mathAddSubLevel >= 2;
    case 'multiply':
      return mathAddSubLevel >= 3;
    case 'sightWords':
      return true;
    case 'phonics':
      return true;
  }
}

// === Skill Selection ===

export function pickNextSkill(
  subject: Subject,
  levels: Record<string, SkillProgress>,
): MathSkill | ReadingSkill {
  if (subject === 'math') {
    return pickMathSkill(levels as Record<MathSkill, SkillProgress>);
  }
  return pickReadingSkill(levels as Record<ReadingSkill, SkillProgress>);
}

function pickMathSkill(levels: Record<MathSkill, SkillProgress>): MathSkill {
  // Weighted random: addSub 3x weight, placeValue 1x, multiply 1x
  // Only include unlocked skills
  const addSubLevel = levels.addSub.level;
  const candidates: { skill: MathSkill; weight: number }[] = [
    { skill: 'addSub', weight: 3 },
  ];

  if (isSkillUnlocked('placeValue', addSubLevel)) {
    candidates.push({ skill: 'placeValue', weight: 1 });
  }

  if (isSkillUnlocked('multiply', addSubLevel)) {
    candidates.push({ skill: 'multiply', weight: 1 });
  }

  return weightedRandom(candidates);
}

function pickReadingSkill(levels: Record<ReadingSkill, SkillProgress>): ReadingSkill {
  // 60% sightWords, 40% phonics
  // Both are always unlocked, but we still use the levels parameter
  // to ensure the function signature is consistent
  void levels;
  const candidates: { skill: ReadingSkill; weight: number }[] = [
    { skill: 'sightWords', weight: 60 },
    { skill: 'phonics', weight: 40 },
  ];

  return weightedRandom(candidates);
}

function weightedRandom<T>(candidates: { skill: T; weight: number }[]): T {
  const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
  let random = Math.random() * totalWeight;

  for (const candidate of candidates) {
    random -= candidate.weight;
    if (random <= 0) {
      return candidate.skill;
    }
  }

  // Fallback to last candidate
  return candidates[candidates.length - 1].skill;
}
