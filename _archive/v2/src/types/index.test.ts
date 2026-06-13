import { describe, test, expect } from 'bun:test';
import { DEFAULT_PROGRESS } from './index';
import type { SkillProgress } from './index';

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
