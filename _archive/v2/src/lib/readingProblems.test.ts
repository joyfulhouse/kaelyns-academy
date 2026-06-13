import { describe, test, expect, beforeEach } from 'bun:test';
import {
  generateSightWord,
  generatePhonics,
  generateReadingProblem,
  resetExerciseRotation,
  LETTER_SOUNDS,
  CVC_WORDS,
} from './readingProblems';

beforeEach(() => {
  resetExerciseRotation();
});

describe('generateSightWord', () => {
  test('rotates between exercise types', () => {
    const p1 = generateSightWord(1);
    const p2 = generateSightWord(1);
    const p3 = generateSightWord(1);
    expect(p1.type).toBe('hearAndTap');
    expect(p2.type).toBe('seeAndSay');
    expect(p3.type).toBe('fillBlank');
  });

  test('options contain the correct answer', () => {
    for (let i = 0; i < 30; i++) {
      const p = generateSightWord(1);
      expect(p.options).toContain(p.answer);
    }
  });

  test('hearAndTap has 4 options', () => {
    const p = generateSightWord(1); // first call is hearAndTap
    expect(p.options.length).toBe(4);
  });

  test('seeAndSay has 4 options', () => {
    generateSightWord(1); // skip hearAndTap
    const p = generateSightWord(1); // seeAndSay
    expect(p.type).toBe('seeAndSay');
    expect(p.options.length).toBe(4);
  });

  test('fillBlank type includes a sentence with "___"', () => {
    generateSightWord(1); // hearAndTap
    generateSightWord(1); // seeAndSay
    const p = generateSightWord(1); // fillBlank
    expect(p.type).toBe('fillBlank');
    expect(p.sentence).toBeDefined();
    expect(p.sentence).toContain('___');
    expect(p.display).toContain('___');
  });

  test('fillBlank options contain correct answer', () => {
    generateSightWord(1); // hearAndTap
    generateSightWord(1); // seeAndSay
    const p = generateSightWord(1); // fillBlank
    expect(p.options).toContain(p.answer);
  });

  test('works for all levels 1-8', () => {
    for (let level = 1; level <= 8; level++) {
      resetExerciseRotation();
      const p = generateSightWord(level);
      expect(p.level).toBe(level);
      expect(p.options).toContain(p.answer);
    }
  });
});

describe('generatePhonics', () => {
  test('level 1-2 gives letterSound type', () => {
    for (let level = 1; level <= 2; level++) {
      for (let i = 0; i < 20; i++) {
        const p = generatePhonics(level);
        expect(p.type).toBe('letterSound');
      }
    }
  });

  test('level 3+ gives blending type', () => {
    for (let level = 3; level <= 4; level++) {
      for (let i = 0; i < 20; i++) {
        const p = generatePhonics(level);
        expect(p.type).toBe('blending');
      }
    }
  });

  test('blending display has " - " separated letters', () => {
    for (let i = 0; i < 20; i++) {
      const p = generatePhonics(3);
      expect(p.display).toContain(' - ');
      const letters = p.display.split(' - ');
      expect(letters.join('')).toBe(p.answer);
    }
  });

  test('letterSound answer is a single letter', () => {
    for (let i = 0; i < 20; i++) {
      const p = generatePhonics(1);
      expect(p.answer.length).toBe(1);
      expect(LETTER_SOUNDS[p.answer]).toBeDefined();
    }
  });

  test('options contain the correct answer', () => {
    for (let i = 0; i < 30; i++) {
      const p = generatePhonics(Math.floor(Math.random() * 4) + 1);
      expect(p.options).toContain(p.answer);
    }
  });

  test('options have 4 values', () => {
    for (let i = 0; i < 30; i++) {
      const p = generatePhonics(3);
      expect(p.options.length).toBe(4);
    }
  });
});

describe('LETTER_SOUNDS and CVC_WORDS data', () => {
  test('LETTER_SOUNDS has all 26 letters', () => {
    expect(Object.keys(LETTER_SOUNDS).length).toBe(26);
    for (let i = 0; i < 26; i++) {
      const letter = String.fromCharCode(97 + i);
      expect(LETTER_SOUNDS[letter]).toBeDefined();
    }
  });

  test('CVC_WORDS has at least 20 words', () => {
    expect(CVC_WORDS.length).toBeGreaterThanOrEqual(20);
  });

  test('all CVC_WORDS are lowercase', () => {
    for (const word of CVC_WORDS) {
      expect(word).toBe(word.toLowerCase());
    }
  });
});

describe('generateReadingProblem dispatcher', () => {
  test('dispatches sightWords correctly', () => {
    const p = generateReadingProblem('sightWords', 1);
    expect(['hearAndTap', 'seeAndSay', 'fillBlank']).toContain(p.type);
  });

  test('dispatches phonics correctly', () => {
    const p = generateReadingProblem('phonics', 1);
    expect(p.type).toBe('letterSound');
  });

  test('dispatches phonics level 3+ to blending', () => {
    const p = generateReadingProblem('phonics', 3);
    expect(p.type).toBe('blending');
  });
});
