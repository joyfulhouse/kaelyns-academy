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
    expect(getWordsUpToLevel(1).length).toBe(10);
    expect(getWordsUpToLevel(2).length).toBe(20);
  });

  test('getRandomWords returns requested count', () => {
    const words = getRandomWords(4, 1);
    expect(words.length).toBe(4);
    expect(new Set(words).size).toBe(4);
  });

  test('getRandomWords caps at available words', () => {
    const words = getRandomWords(100, 1);
    expect(words.length).toBe(10);
  });
});
