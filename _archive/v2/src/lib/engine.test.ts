import { describe, test, expect } from 'bun:test';
import {
  processAnswer,
  getEffectiveLevel,
  isSkillUnlocked,
  pickNextSkill,
  LEVEL_UP_THRESHOLD,
  SESSION_FAIL_LIMIT,
  BUMP_DOWN_STREAK,
  MAX_LEVELS,
} from './engine';
import type { SkillProgress } from '@/types';

function freshProgress(overrides: Partial<SkillProgress> = {}): SkillProgress {
  return {
    level: 1,
    correctInLevel: 0,
    wrongInSession: 0,
    consecutiveCorrect: 0,
    consecutiveWrong: 0,
    ...overrides,
  };
}

describe('processAnswer', () => {
  test('correct answer increments correctInLevel and consecutiveCorrect', () => {
    const result = processAnswer('addSub', freshProgress(), true);
    expect(result.progress.correctInLevel).toBe(1);
    expect(result.progress.consecutiveCorrect).toBe(1);
    expect(result.progress.consecutiveWrong).toBe(0);
  });

  test('wrong answer increments wrongInSession and consecutiveWrong', () => {
    const result = processAnswer('addSub', freshProgress(), false);
    expect(result.progress.wrongInSession).toBe(1);
    expect(result.progress.consecutiveWrong).toBe(1);
    expect(result.progress.consecutiveCorrect).toBe(0);
  });

  test('correct answer resets consecutiveWrong', () => {
    const progress = freshProgress({ consecutiveWrong: 3 });
    const result = processAnswer('addSub', progress, true);
    expect(result.progress.consecutiveWrong).toBe(0);
  });

  test('wrong answer resets consecutiveCorrect', () => {
    const progress = freshProgress({ consecutiveCorrect: 5 });
    const result = processAnswer('addSub', progress, false);
    expect(result.progress.consecutiveCorrect).toBe(0);
  });

  test('10 correct triggers level up and resets counters', () => {
    const progress = freshProgress();
    let lastResult = processAnswer('addSub', progress, true);

    for (let i = 1; i < LEVEL_UP_THRESHOLD; i++) {
      lastResult = processAnswer('addSub', lastResult.progress, true);
    }

    expect(lastResult.levelUp).toBe(true);
    expect(lastResult.earnedStar).toBe(true);
    expect(lastResult.progress.level).toBe(2);
    expect(lastResult.progress.correctInLevel).toBe(0);
    expect(lastResult.progress.consecutiveCorrect).toBe(0);
    expect(lastResult.progress.wrongInSession).toBe(0);
  });

  test('5 wrong in session triggers level down', () => {
    const progress = freshProgress({ level: 3, wrongInSession: SESSION_FAIL_LIMIT - 1 });
    const result = processAnswer('addSub', progress, false);
    expect(result.levelDown).toBe(true);
    expect(result.progress.level).toBe(2);
    expect(result.progress.correctInLevel).toBe(0);
    expect(result.progress.wrongInSession).toBe(0);
  });

  test('cannot level up past max level', () => {
    const progress = freshProgress({
      level: MAX_LEVELS.addSub,
      correctInLevel: LEVEL_UP_THRESHOLD - 1,
    });
    const result = processAnswer('addSub', progress, true);
    expect(result.levelUp).toBe(false);
    expect(result.progress.level).toBe(MAX_LEVELS.addSub);
  });

  test('cannot level down below 1', () => {
    const progress = freshProgress({
      level: 1,
      wrongInSession: SESSION_FAIL_LIMIT - 1,
    });
    const result = processAnswer('addSub', progress, false);
    expect(result.levelDown).toBe(false);
    expect(result.progress.level).toBe(1);
  });

  test('level down resets all counters', () => {
    const progress = freshProgress({
      level: 2,
      wrongInSession: SESSION_FAIL_LIMIT - 1,
      correctInLevel: 5,
      consecutiveCorrect: 2,
    });
    const result = processAnswer('addSub', progress, false);
    expect(result.levelDown).toBe(true);
    expect(result.progress.correctInLevel).toBe(0);
    expect(result.progress.consecutiveCorrect).toBe(0);
    expect(result.progress.consecutiveWrong).toBe(0);
    expect(result.progress.wrongInSession).toBe(0);
  });

  test('works for all skill types', () => {
    const skills = ['addSub', 'placeValue', 'multiply', 'sightWords', 'phonics'] as const;
    for (const skill of skills) {
      const result = processAnswer(skill, freshProgress(), true);
      expect(result.progress.correctInLevel).toBe(1);
    }
  });
});

describe('getEffectiveLevel', () => {
  test('returns current level when no streak', () => {
    const progress = freshProgress({ level: 3 });
    expect(getEffectiveLevel(progress)).toBe(3);
  });

  test('drops level on 2 consecutive wrong', () => {
    const progress = freshProgress({
      level: 3,
      consecutiveWrong: BUMP_DOWN_STREAK,
    });
    expect(getEffectiveLevel(progress)).toBe(2);
  });

  test('drops level on more than 2 consecutive wrong', () => {
    const progress = freshProgress({
      level: 4,
      consecutiveWrong: 5,
    });
    expect(getEffectiveLevel(progress)).toBe(3);
  });

  test('does not drop below level 1', () => {
    const progress = freshProgress({
      level: 1,
      consecutiveWrong: BUMP_DOWN_STREAK,
    });
    expect(getEffectiveLevel(progress)).toBe(1);
  });

  test('does not drop when consecutiveWrong < threshold', () => {
    const progress = freshProgress({
      level: 3,
      consecutiveWrong: 1,
    });
    expect(getEffectiveLevel(progress)).toBe(3);
  });
});

describe('isSkillUnlocked', () => {
  test('addSub is always unlocked', () => {
    expect(isSkillUnlocked('addSub', 1)).toBe(true);
    expect(isSkillUnlocked('addSub', 0)).toBe(true);
  });

  test('placeValue unlocks at addSub level 2', () => {
    expect(isSkillUnlocked('placeValue', 1)).toBe(false);
    expect(isSkillUnlocked('placeValue', 2)).toBe(true);
    expect(isSkillUnlocked('placeValue', 5)).toBe(true);
  });

  test('multiply unlocks at addSub level 3', () => {
    expect(isSkillUnlocked('multiply', 1)).toBe(false);
    expect(isSkillUnlocked('multiply', 2)).toBe(false);
    expect(isSkillUnlocked('multiply', 3)).toBe(true);
    expect(isSkillUnlocked('multiply', 5)).toBe(true);
  });

  test('reading skills are always unlocked', () => {
    expect(isSkillUnlocked('sightWords', 1)).toBe(true);
    expect(isSkillUnlocked('phonics', 1)).toBe(true);
    expect(isSkillUnlocked('sightWords', 0)).toBe(true);
    expect(isSkillUnlocked('phonics', 0)).toBe(true);
  });
});

describe('pickNextSkill', () => {
  test('math returns a valid math skill', () => {
    const levels = {
      addSub: freshProgress({ level: 3 }),
      placeValue: freshProgress(),
      multiply: freshProgress(),
    };

    for (let i = 0; i < 50; i++) {
      const skill = pickNextSkill('math', levels);
      expect(['addSub', 'placeValue', 'multiply']).toContain(skill);
    }
  });

  test('reading returns a valid reading skill', () => {
    const levels = {
      sightWords: freshProgress(),
      phonics: freshProgress(),
    };

    for (let i = 0; i < 50; i++) {
      const skill = pickNextSkill('reading', levels);
      expect(['sightWords', 'phonics']).toContain(skill);
    }
  });

  test('math with level 1 only returns addSub (others locked)', () => {
    const levels = {
      addSub: freshProgress({ level: 1 }),
      placeValue: freshProgress(),
      multiply: freshProgress(),
    };

    for (let i = 0; i < 30; i++) {
      const skill = pickNextSkill('math', levels);
      expect(skill).toBe('addSub');
    }
  });

  test('math with level 2 includes placeValue', () => {
    const levels = {
      addSub: freshProgress({ level: 2 }),
      placeValue: freshProgress(),
      multiply: freshProgress(),
    };

    const skills = new Set<string>();
    for (let i = 0; i < 100; i++) {
      skills.add(pickNextSkill('math', levels));
    }
    expect(skills.has('addSub')).toBe(true);
    expect(skills.has('placeValue')).toBe(true);
    expect(skills.has('multiply')).toBe(false);
  });

  test('math with level 3 includes multiply', () => {
    const levels = {
      addSub: freshProgress({ level: 3 }),
      placeValue: freshProgress(),
      multiply: freshProgress(),
    };

    const skills = new Set<string>();
    for (let i = 0; i < 100; i++) {
      skills.add(pickNextSkill('math', levels));
    }
    expect(skills.has('addSub')).toBe(true);
    expect(skills.has('placeValue')).toBe(true);
    expect(skills.has('multiply')).toBe(true);
  });

  test('reading picks both sightWords and phonics', () => {
    const levels = {
      sightWords: freshProgress(),
      phonics: freshProgress(),
    };

    const skills = new Set<string>();
    for (let i = 0; i < 100; i++) {
      skills.add(pickNextSkill('reading', levels));
    }
    expect(skills.has('sightWords')).toBe(true);
    expect(skills.has('phonics')).toBe(true);
  });
});
