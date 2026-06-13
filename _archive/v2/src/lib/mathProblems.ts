import type { MathProblem, MathSkill } from '@/types';

// === Utility Functions ===

/** Fisher-Yates shuffle (in-place) */
function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Random integer in [min, max] inclusive */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Check if addition requires carrying */
export function needsCarry(a: number, b: number): boolean {
  while (a > 0 || b > 0) {
    if ((a % 10) + (b % 10) >= 10) return true;
    a = Math.floor(a / 10);
    b = Math.floor(b / 10);
  }
  return false;
}

/** Check if subtraction requires borrowing */
export function needsBorrow(a: number, b: number): boolean {
  while (a > 0 || b > 0) {
    if ((a % 10) < (b % 10)) return true;
    a = Math.floor(a / 10);
    b = Math.floor(b / 10);
  }
  return false;
}

/** Generate unique distractors that differ from the correct answer */
function generateDistractors(answer: number, count: number, min: number, max: number): number[] {
  const distractors = new Set<number>();
  let attempts = 0;
  while (distractors.size < count && attempts < 100) {
    const offset = randInt(-5, 5);
    const candidate = answer + offset;
    if (candidate !== answer && candidate >= min && candidate <= max) {
      distractors.add(candidate);
    }
    attempts++;
  }
  // Fallback: fill with sequential values if we couldn't get enough
  let fallback = Math.max(min, answer - 10);
  while (distractors.size < count) {
    if (fallback !== answer && fallback >= min && fallback <= max) {
      distractors.add(fallback);
    }
    fallback++;
    if (fallback > max) fallback = min;
  }
  return [...distractors];
}

/** Build options array: correct answer + 3 distractors, shuffled */
function buildOptions(answer: number, min: number, max: number): number[] {
  const distractors = generateDistractors(answer, 3, min, max);
  return shuffle([answer, ...distractors]);
}

// === Addition / Subtraction Generator ===

export function generateAddSub(level: number): MathProblem {
  const isAddition = Math.random() < 0.5;

  let num1: number;
  let num2: number;

  switch (level) {
    case 1: {
      // Single digit (1-9)
      num1 = randInt(1, 9);
      num2 = randInt(1, 9);
      if (!isAddition && num1 < num2) [num1, num2] = [num2, num1];
      break;
    }
    case 2: {
      // Up to 20
      num1 = randInt(1, 20);
      num2 = randInt(1, 20);
      if (isAddition) {
        // Keep sum <= 20
        if (num1 + num2 > 20) {
          num2 = randInt(1, 20 - num1);
          if (num2 < 1) num2 = 1;
        }
      } else {
        if (num1 < num2) [num1, num2] = [num2, num1];
      }
      break;
    }
    case 3: {
      // Double digit, no carry/borrow
      for (let attempt = 0; attempt < 100; attempt++) {
        num1 = randInt(10, 99);
        num2 = randInt(10, 99);
        if (!isAddition && num1 < num2) [num1, num2] = [num2, num1];
        if (isAddition && !needsCarry(num1, num2)) break;
        if (!isAddition && !needsBorrow(num1, num2)) break;
      }
      num1 = num1!;
      num2 = num2!;
      // Final validation: if still has carry/borrow, force simple numbers
      if (isAddition && needsCarry(num1, num2)) {
        num1 = 21;
        num2 = 13;
      }
      if (!isAddition && needsBorrow(num1, num2)) {
        num1 = 47;
        num2 = 23;
      }
      break;
    }
    case 4: {
      // Double digit WITH carry/borrow
      for (let attempt = 0; attempt < 100; attempt++) {
        num1 = randInt(10, 99);
        num2 = randInt(10, 99);
        if (!isAddition && num1 < num2) [num1, num2] = [num2, num1];
        if (isAddition && needsCarry(num1, num2)) break;
        if (!isAddition && needsBorrow(num1, num2)) break;
      }
      num1 = num1!;
      num2 = num2!;
      // Final validation: if no carry/borrow, force it
      if (isAddition && !needsCarry(num1, num2)) {
        num1 = 37;
        num2 = 45;
      }
      if (!isAddition && !needsBorrow(num1, num2)) {
        num1 = 52;
        num2 = 37;
      }
      break;
    }
    case 5:
    default: {
      // Triple digit
      num1 = randInt(100, 999);
      num2 = randInt(100, 999);
      if (!isAddition && num1 < num2) [num1, num2] = [num2, num1];
      break;
    }
  }

  const answer = isAddition ? num1 + num2 : num1 - num2;
  const op = isAddition ? '+' : '-';
  const display = `${num1} ${op} ${num2}`;

  const scaffoldSteps = isAddition
    ? [
        `Start with ${num1}.`,
        `Count up ${num2} more.`,
        `${num1} ${op} ${num2} = ${answer}.`,
      ]
    : [
        `Start with ${num1}.`,
        `Take away ${num2}.`,
        `${num1} ${op} ${num2} = ${answer}.`,
      ];

  return {
    type: isAddition ? 'addition' : 'subtraction',
    display,
    num1,
    num2,
    answer,
    options: buildOptions(answer, Math.max(0, answer - 20), answer + 20),
    scaffoldSteps,
    level,
  };
}

// === Place Value Generator ===

const PLACE_NAMES: Record<number, string> = {
  0: 'ones',
  1: 'tens',
  2: 'hundreds',
};

export function generatePlaceValue(level: number): MathProblem {
  let num: number;
  let placeIndex: number;

  switch (level) {
    case 1: {
      // Two-digit, ones or tens
      num = randInt(10, 99);
      placeIndex = randInt(0, 1);
      break;
    }
    case 2: {
      // Three-digit number
      num = randInt(100, 999);
      placeIndex = randInt(0, 2);
      break;
    }
    case 3:
    default: {
      // Three-digit, focused on hundreds
      num = randInt(100, 999);
      placeIndex = 2;
      break;
    }
  }

  const numStr = num.toString();
  const digitFromRight = numStr.length - 1 - placeIndex;
  const answer = parseInt(numStr[digitFromRight], 10);
  const placeName = PLACE_NAMES[placeIndex] ?? 'ones';
  const display = `What digit is in the ${placeName} place of ${num}?`;

  const scaffoldSteps = [
    `The number is ${num}.`,
    `The ${placeName} place is the ${placeIndex === 0 ? 'rightmost' : placeIndex === 1 ? 'second from right' : 'third from right'} digit.`,
    `The digit in the ${placeName} place is ${answer}.`,
  ];

  return {
    type: 'placeValue',
    display,
    num1: num,
    num2: placeIndex,
    answer,
    options: buildOptions(answer, 0, 9),
    scaffoldSteps,
    level,
  };
}

// === Multiplication Generator ===

const SKIP_COUNT_BASES = [2, 5, 10];

export function generateMultiply(level: number): MathProblem {
  if (level <= 3) {
    // Skip counting
    const base = SKIP_COUNT_BASES[Math.min(level - 1, SKIP_COUNT_BASES.length - 1)];
    const count = randInt(2, 6);
    const answer = base * count;
    const display = `Count by ${base}s: ${Array.from({ length: count - 1 }, (_, i) => base * (i + 1)).join(', ')}, ?`;

    const scaffoldSteps = [
      `We are counting by ${base}s.`,
      `The sequence is: ${Array.from({ length: count }, (_, i) => base * (i + 1)).join(', ')}.`,
      `The next number is ${answer}.`,
    ];

    return {
      type: 'skipCounting',
      display,
      num1: base,
      num2: count,
      answer,
      options: buildOptions(answer, Math.max(0, answer - base * 3), answer + base * 3),
      scaffoldSteps,
      level,
    };
  }

  // Levels 4+: times tables
  const maxFactor = Math.min(level + 2, 12);
  const num1 = randInt(2, maxFactor);
  const num2 = randInt(2, maxFactor);
  const answer = num1 * num2;
  const display = `${num1} x ${num2}`;

  const scaffoldSteps = [
    `${num1} x ${num2} means ${num1} groups of ${num2}.`,
    `Count: ${Array.from({ length: num1 }, (_, i) => num2 * (i + 1)).join(', ')}.`,
    `${num1} x ${num2} = ${answer}.`,
  ];

  return {
    type: 'multiplication',
    display,
    num1,
    num2,
    answer,
    options: buildOptions(answer, Math.max(0, answer - 20), answer + 20),
    scaffoldSteps,
    level,
  };
}

// === Dispatcher ===

export function generateMathProblem(skill: MathSkill, level: number): MathProblem {
  switch (skill) {
    case 'addSub':
      return generateAddSub(level);
    case 'placeValue':
      return generatePlaceValue(level);
    case 'multiply':
      return generateMultiply(level);
  }
}
