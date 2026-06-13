import { describe, test, expect } from 'bun:test';
import {
  generateAddSub,
  generatePlaceValue,
  generateMultiply,
  generateMathProblem,
  needsCarry,
  needsBorrow,
} from './mathProblems';

describe('needsCarry / needsBorrow helpers', () => {
  test('needsCarry detects carrying', () => {
    expect(needsCarry(17, 25)).toBe(true);  // 7+5=12 >= 10
    expect(needsCarry(21, 13)).toBe(false);  // 1+3=4, 2+1=3
    expect(needsCarry(99, 1)).toBe(true);
  });

  test('needsBorrow detects borrowing', () => {
    expect(needsBorrow(52, 37)).toBe(true);  // 2 < 7
    expect(needsBorrow(47, 23)).toBe(false);  // 7 >= 3, 4 >= 2
    expect(needsBorrow(30, 11)).toBe(true);  // 0 < 1
  });
});

describe('generateAddSub', () => {
  test('level 1 produces single-digit operands', () => {
    for (let i = 0; i < 50; i++) {
      const p = generateAddSub(1);
      expect(p.num1).toBeGreaterThanOrEqual(1);
      expect(p.num1).toBeLessThanOrEqual(9);
      expect(p.num2).toBeGreaterThanOrEqual(1);
      expect(p.num2).toBeLessThanOrEqual(9);
      expect(p.level).toBe(1);
    }
  });

  test('answer is always mathematically correct', () => {
    for (let i = 0; i < 100; i++) {
      const p = generateAddSub(randLevel());
      if (p.type === 'addition') {
        expect(p.answer).toBe(p.num1 + p.num2);
      } else {
        expect(p.answer).toBe(p.num1 - p.num2);
      }
    }
  });

  test('subtraction never produces negative answers', () => {
    for (let i = 0; i < 100; i++) {
      const p = generateAddSub(randLevel());
      if (p.type === 'subtraction') {
        expect(p.answer).toBeGreaterThanOrEqual(0);
        expect(p.num1).toBeGreaterThanOrEqual(p.num2);
      }
    }
  });

  test('options always contain the correct answer', () => {
    for (let i = 0; i < 50; i++) {
      const p = generateAddSub(randLevel());
      expect(p.options).toContain(p.answer);
    }
  });

  test('options have 4 unique values', () => {
    for (let i = 0; i < 50; i++) {
      const p = generateAddSub(randLevel());
      expect(p.options.length).toBe(4);
      expect(new Set(p.options).size).toBe(4);
    }
  });

  test('level 3 does not require carry or borrow', () => {
    for (let i = 0; i < 50; i++) {
      const p = generateAddSub(3);
      if (p.type === 'addition') {
        expect(needsCarry(p.num1, p.num2)).toBe(false);
      } else {
        expect(needsBorrow(p.num1, p.num2)).toBe(false);
      }
    }
  });

  test('level 4 requires carry or borrow', () => {
    for (let i = 0; i < 50; i++) {
      const p = generateAddSub(4);
      if (p.type === 'addition') {
        expect(needsCarry(p.num1, p.num2)).toBe(true);
      } else {
        expect(needsBorrow(p.num1, p.num2)).toBe(true);
      }
    }
  });

  test('level 5 produces triple-digit operands', () => {
    for (let i = 0; i < 50; i++) {
      const p = generateAddSub(5);
      expect(p.num1).toBeGreaterThanOrEqual(100);
      expect(p.num2).toBeGreaterThanOrEqual(100);
    }
  });

  test('has scaffoldSteps', () => {
    const p = generateAddSub(1);
    expect(p.scaffoldSteps).toBeDefined();
    expect(p.scaffoldSteps!.length).toBeGreaterThanOrEqual(2);
  });
});

describe('generatePlaceValue', () => {
  test('answer matches the correct digit', () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePlaceValue(1);
      const numStr = p.num1.toString();
      // num2 is the place index (0=ones, 1=tens, 2=hundreds)
      const digitFromRight = numStr.length - 1 - p.num2;
      const expected = parseInt(numStr[digitFromRight], 10);
      expect(p.answer).toBe(expected);
    }
  });

  test('options contain the correct answer', () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePlaceValue(2);
      expect(p.options).toContain(p.answer);
    }
  });

  test('options have 4 unique values', () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePlaceValue(1);
      expect(p.options.length).toBe(4);
      expect(new Set(p.options).size).toBe(4);
    }
  });

  test('level 1 uses two-digit numbers', () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePlaceValue(1);
      expect(p.num1).toBeGreaterThanOrEqual(10);
      expect(p.num1).toBeLessThanOrEqual(99);
    }
  });

  test('level 2+ uses three-digit numbers', () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePlaceValue(2);
      expect(p.num1).toBeGreaterThanOrEqual(100);
      expect(p.num1).toBeLessThanOrEqual(999);
    }
  });

  test('display includes place name', () => {
    const p = generatePlaceValue(1);
    expect(p.display).toMatch(/ones|tens|hundreds/);
  });

  test('has scaffoldSteps', () => {
    const p = generatePlaceValue(1);
    expect(p.scaffoldSteps).toBeDefined();
    expect(p.scaffoldSteps!.length).toBeGreaterThanOrEqual(2);
  });
});

describe('generateMultiply', () => {
  test('level 1-3 gives skipCounting type', () => {
    for (let level = 1; level <= 3; level++) {
      for (let i = 0; i < 20; i++) {
        const p = generateMultiply(level);
        expect(p.type).toBe('skipCounting');
      }
    }
  });

  test('level 4+ gives multiplication type', () => {
    for (let level = 4; level <= 6; level++) {
      for (let i = 0; i < 20; i++) {
        const p = generateMultiply(level);
        expect(p.type).toBe('multiplication');
      }
    }
  });

  test('answer is always correct', () => {
    for (let i = 0; i < 50; i++) {
      const p = generateMultiply(5);
      expect(p.answer).toBe(p.num1 * p.num2);
    }
  });

  test('options contain the correct answer', () => {
    for (let i = 0; i < 50; i++) {
      const p = generateMultiply(4);
      expect(p.options).toContain(p.answer);
    }
  });

  test('options have 4 unique values', () => {
    for (let i = 0; i < 50; i++) {
      const p = generateMultiply(4);
      expect(p.options.length).toBe(4);
      expect(new Set(p.options).size).toBe(4);
    }
  });

  test('has scaffoldSteps', () => {
    const p = generateMultiply(4);
    expect(p.scaffoldSteps).toBeDefined();
    expect(p.scaffoldSteps!.length).toBeGreaterThanOrEqual(2);
  });
});

describe('generateMathProblem dispatcher', () => {
  test('dispatches addSub correctly', () => {
    const p = generateMathProblem('addSub', 1);
    expect(p.type === 'addition' || p.type === 'subtraction').toBe(true);
  });

  test('dispatches placeValue correctly', () => {
    const p = generateMathProblem('placeValue', 1);
    expect(p.type).toBe('placeValue');
  });

  test('dispatches multiply correctly', () => {
    const p = generateMathProblem('multiply', 1);
    expect(p.type).toBe('skipCounting');
  });
});

function randLevel(): number {
  return Math.floor(Math.random() * 5) + 1;
}
