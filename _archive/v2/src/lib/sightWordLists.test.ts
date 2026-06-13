import { describe, test, expect } from 'bun:test';
import { getWordsForLevel, getWordsUpToLevel, getRandomWords, TOTAL_LEVELS, SIGHT_WORD_LEVELS } from './sightWordLists';

describe('sightWordLists', () => {
  test('has 8 levels', () => {
    expect(TOTAL_LEVELS).toBe(8);
  });

  test('each level has at least 10 words', () => {
    for (const level of SIGHT_WORD_LEVELS) {
      expect(level.words.length).toBeGreaterThanOrEqual(10);
    }
  });

  test('no duplicate words within a level', () => {
    for (const level of SIGHT_WORD_LEVELS) {
      const lower = level.words.map((w) => w.toLowerCase());
      expect(new Set(lower).size).toBe(lower.length);
    }
  });

  test('getWordsForLevel returns correct level', () => {
    expect(getWordsForLevel(1)).toContain('see');
    expect(getWordsForLevel(1)).toContain('the');
    expect(getWordsForLevel(2)).toContain('she');
  });

  test('getWordsForLevel returns empty for invalid level', () => {
    expect(getWordsForLevel(99)).toEqual([]);
  });

  test('getWordsUpToLevel accumulates', () => {
    const l1 = getWordsUpToLevel(1).length;
    const l2 = getWordsUpToLevel(2).length;
    expect(l2).toBeGreaterThan(l1);
  });

  test('getRandomWords returns requested count', () => {
    const words = getRandomWords(4, 1);
    expect(words.length).toBe(4);
    expect(new Set(words).size).toBe(4);
  });

  test('getRandomWords caps at available words', () => {
    const words = getRandomWords(100, 1);
    expect(words.length).toBe(getWordsForLevel(1).length);
  });

  test('SIPPS levels come first (1-4), Dolch levels follow (5-8)', () => {
    expect(SIGHT_WORD_LEVELS[0].name).toContain('SIPPS');
    expect(SIGHT_WORD_LEVELS[3].name).toContain('SIPPS');
    expect(SIGHT_WORD_LEVELS[4].name).toContain('Dolch');
    expect(SIGHT_WORD_LEVELS[7].name).toContain('Dolch');
  });
});
