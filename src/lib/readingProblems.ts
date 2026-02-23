import type { ReadingProblem, ReadingSkill } from '@/types';
import { getWordsForLevel, getWordsUpToLevel } from '@/lib/sightWordLists';

// === Utility Functions ===

/** Fisher-Yates shuffle (returns new array) */
function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Pick a random element from an array */
function pickRandom<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

// === Phonics Data ===

export const LETTER_SOUNDS: Record<string, string> = {
  a: '/a/ as in apple',
  b: '/b/ as in ball',
  c: '/k/ as in cat',
  d: '/d/ as in dog',
  e: '/e/ as in egg',
  f: '/f/ as in fish',
  g: '/g/ as in goat',
  h: '/h/ as in hat',
  i: '/i/ as in igloo',
  j: '/j/ as in jam',
  k: '/k/ as in kite',
  l: '/l/ as in lion',
  m: '/m/ as in moon',
  n: '/n/ as in nest',
  o: '/o/ as in octopus',
  p: '/p/ as in pig',
  q: '/kw/ as in queen',
  r: '/r/ as in rain',
  s: '/s/ as in sun',
  t: '/t/ as in tree',
  u: '/u/ as in umbrella',
  v: '/v/ as in van',
  w: '/w/ as in water',
  x: '/ks/ as in fox',
  y: '/y/ as in yellow',
  z: '/z/ as in zebra',
};

export const CVC_WORDS: string[] = [
  'cat', 'bat', 'hat', 'mat', 'rat', 'sat',
  'dog', 'hog', 'log', 'fog',
  'sun', 'bun', 'fun', 'run', 'gun',
  'pen', 'hen', 'ten', 'men', 'den',
  'pig', 'big', 'dig', 'wig', 'fig',
  'cup', 'pup', 'cut', 'hut', 'nut',
  'bed', 'red', 'led', 'fed',
  'top', 'hop', 'mop', 'pop',
  'van', 'can', 'fan', 'man', 'pan', 'tan',
  'net', 'set', 'wet', 'get', 'pet', 'yet',
];

// === Fill-in-the-Blank Templates ===

interface FillBlankTemplate {
  sentence: string;
  answer: string;
  distractors: string[];
}

const FILL_BLANK_TEMPLATES: Record<number, FillBlankTemplate[]> = {
  1: [
    { sentence: 'I see ___ dog.', answer: 'a', distractors: ['is', 'it'] },
    { sentence: '___ like to play.', answer: 'I', distractors: ['a', 'it'] },
    { sentence: 'It ___ a cat.', answer: 'is', distractors: ['I', 'the'] },
    { sentence: '___ sun is up.', answer: 'The', distractors: ['A', 'Is'] },
    { sentence: 'You and ___ are friends.', answer: 'I', distractors: ['a', 'is'] },
  ],
  2: [
    { sentence: 'The sky is ___.', answer: 'blue', distractors: ['run', 'big'] },
    { sentence: 'I see a ___ apple.', answer: 'red', distractors: ['go', 'my'] },
    { sentence: 'The sun is ___.', answer: 'yellow', distractors: ['green', 'run'] },
    { sentence: 'Grass is ___.', answer: 'green', distractors: ['pink', 'see'] },
    { sentence: 'The ___ cat sat down.', answer: 'black', distractors: ['red', 'up'] },
  ],
  3: [
    { sentence: 'I ___ a bird.', answer: 'see', distractors: ['go', 'red'] },
    { sentence: 'We ___ to play.', answer: 'like', distractors: ['see', 'run'] },
    { sentence: '___ at the dog!', answer: 'Look', distractors: ['Run', 'Go'] },
    { sentence: 'She ___ to the park.', answer: 'went', distractors: ['said', 'can'] },
    { sentence: 'I ___ run fast.', answer: 'can', distractors: ['see', 'go'] },
  ],
  4: [
    { sentence: '___ is my mom.', answer: 'She', distractors: ['He', 'We'] },
    { sentence: 'Give it to ___.', answer: 'me', distractors: ['he', 'we'] },
    { sentence: 'My ___ is nice.', answer: 'dad', distractors: ['he', 'she'] },
    { sentence: '___ are going home.', answer: 'They', distractors: ['Him', 'Her'] },
    { sentence: 'I see ___ over there.', answer: 'him', distractors: ['she', 'we'] },
  ],
  5: [
    { sentence: '___ is your name?', answer: 'What', distractors: ['How', 'Are'] },
    { sentence: '___ do you live?', answer: 'Where', distractors: ['What', 'Who'] },
    { sentence: '___ are you today?', answer: 'How', distractors: ['Who', 'When'] },
    { sentence: '___ is at the door?', answer: 'Who', distractors: ['What', 'Why'] },
    { sentence: '___ you ready?', answer: 'Are', distractors: ['Were', 'Was'] },
  ],
};

// === Sight Word Generator ===

type SightWordExerciseType = 'hearAndTap' | 'seeAndSay' | 'fillBlank';
const SIGHT_WORD_EXERCISE_TYPES: SightWordExerciseType[] = ['hearAndTap', 'seeAndSay', 'fillBlank'];
let exerciseRotation = 0;

export function generateSightWord(level: number): ReadingProblem {
  const exerciseType = SIGHT_WORD_EXERCISE_TYPES[exerciseRotation % SIGHT_WORD_EXERCISE_TYPES.length];
  exerciseRotation++;

  const clampedLevel = Math.min(Math.max(level, 1), 8);

  switch (exerciseType) {
    case 'hearAndTap': {
      return generateHearAndTap(clampedLevel);
    }
    case 'seeAndSay': {
      return generateSeeAndSay(clampedLevel);
    }
    case 'fillBlank': {
      return generateFillBlank(clampedLevel);
    }
  }
}

function generateHearAndTap(level: number): ReadingProblem {
  const words = getWordsForLevel(level);
  const targetWord = pickRandom(words);
  const allWords = getWordsUpToLevel(level);
  const distractors = shuffle(allWords.filter((w) => w !== targetWord)).slice(0, 3);

  // Ensure we have enough distractors
  while (distractors.length < 3) {
    const fallback = pickRandom(CVC_WORDS);
    if (fallback !== targetWord && !distractors.includes(fallback)) {
      distractors.push(fallback);
    }
  }

  return {
    type: 'hearAndTap',
    display: `Tap the word: "${targetWord}"`,
    answer: targetWord,
    options: shuffle([targetWord, ...distractors.slice(0, 3)]),
    level,
  };
}

function generateSeeAndSay(level: number): ReadingProblem {
  const words = getWordsForLevel(level);
  const targetWord = pickRandom(words);
  const allWords = getWordsUpToLevel(level);
  const distractors = shuffle(allWords.filter((w) => w !== targetWord)).slice(0, 3);

  while (distractors.length < 3) {
    const fallback = pickRandom(CVC_WORDS);
    if (fallback !== targetWord && !distractors.includes(fallback)) {
      distractors.push(fallback);
    }
  }

  return {
    type: 'seeAndSay',
    display: targetWord,
    answer: targetWord,
    options: shuffle([targetWord, ...distractors.slice(0, 3)]),
    level,
  };
}

function generateFillBlank(level: number): ReadingProblem {
  // Use templates for levels that have them, otherwise fall back to closest level
  const templateLevel = Math.min(Math.max(level, 1), 5);
  const templates = FILL_BLANK_TEMPLATES[templateLevel];
  const template = pickRandom(templates);

  return {
    type: 'fillBlank',
    display: template.sentence,
    answer: template.answer,
    options: shuffle([template.answer, ...template.distractors]),
    sentence: template.sentence,
    level,
  };
}

// === Phonics Generator ===

export function generatePhonics(level: number): ReadingProblem {
  if (level <= 2) {
    return generateLetterSound(level);
  }
  return generateBlending(level);
}

function generateLetterSound(level: number): ReadingProblem {
  const letters = Object.keys(LETTER_SOUNDS);
  // Level 1: first 13 letters (a-m), Level 2: all 26
  const available = level === 1 ? letters.slice(0, 13) : letters;
  const targetLetter = pickRandom(available);
  const sound = LETTER_SOUNDS[targetLetter];
  const distractors = shuffle(available.filter((l) => l !== targetLetter)).slice(0, 3);

  return {
    type: 'letterSound',
    display: sound,
    answer: targetLetter,
    options: shuffle([targetLetter, ...distractors]),
    level,
  };
}

function generateBlending(level: number): ReadingProblem {
  // Higher levels use harder CVC words
  const wordPool = level <= 3 ? CVC_WORDS.slice(0, 20) : CVC_WORDS;
  const targetWord = pickRandom(wordPool);
  const letters = targetWord.split('');
  const display = letters.join(' - ');
  const distractors = shuffle(wordPool.filter((w) => w !== targetWord)).slice(0, 3);

  return {
    type: 'blending',
    display,
    answer: targetWord,
    options: shuffle([targetWord, ...distractors]),
    level,
  };
}

// === Dispatcher ===

export function generateReadingProblem(skill: ReadingSkill, level: number): ReadingProblem {
  switch (skill) {
    case 'sightWords':
      return generateSightWord(level);
    case 'phonics':
      return generatePhonics(level);
  }
}

/** Reset exercise rotation (useful for testing) */
export function resetExerciseRotation(): void {
  exerciseRotation = 0;
}
