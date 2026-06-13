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
  // Level 1: SIPPS 1-10 words (see, I, the, you, can, me, and, we, on, is, yes, are, no, he)
  1: [
    { sentence: 'I ___ a cat.', answer: 'see', distractors: ['is', 'on', 'no'] },
    { sentence: '___ can run fast.', answer: 'I', distractors: ['me', 'on', 'no'] },
    { sentence: '___ is on the mat.', answer: 'He', distractors: ['We', 'No', 'On'] },
    { sentence: 'You ___ me are pals.', answer: 'and', distractors: ['is', 'on', 'no'] },
    { sentence: '___ you see me?', answer: 'Can', distractors: ['Are', 'Is', 'On'] },
  ],
  // Level 2: SIPPS 11-20 words (she, get, to, was, go, down, saw, my, where, here, they, little, put, what)
  2: [
    { sentence: '___ went to the park.', answer: 'She', distractors: ['My', 'Go', 'Put'] },
    { sentence: 'I ___ a big dog.', answer: 'saw', distractors: ['was', 'go', 'get'] },
    { sentence: 'Come ___ and sit.', answer: 'here', distractors: ['they', 'what', 'down'] },
    { sentence: 'The ___ cat is cute.', answer: 'little', distractors: ['where', 'what', 'down'] },
    { sentence: '___ is your name?', answer: 'What', distractors: ['Where', 'Go', 'My'] },
  ],
  // Level 3: SIPPS 21-30 words (do, like, have, home, said, her, of, out, name, some, come, make, say)
  3: [
    { sentence: 'I ___ to play.', answer: 'like', distractors: ['said', 'come', 'make'] },
    { sentence: 'We ___ a big dog.', answer: 'have', distractors: ['come', 'make', 'say'] },
    { sentence: 'He ___ it was fun.', answer: 'said', distractors: ['like', 'have', 'make'] },
    { sentence: '___ play with me!', answer: 'Come', distractors: ['Make', 'Say', 'Do'] },
    { sentence: 'I can ___ a cake.', answer: 'make', distractors: ['say', 'do', 'come'] },
  ],
  // Level 4: SIPPS 31-55 words (be, look, there, over, want, water, from, for, find, people, again, your, very, could, would, one, two, good, every)
  4: [
    { sentence: '___ at the bird!', answer: 'Look', distractors: ['Find', 'Want', 'From'] },
    { sentence: 'I ___ to play.', answer: 'want', distractors: ['look', 'find', 'from'] },
    { sentence: 'Can you ___ my hat?', answer: 'find', distractors: ['want', 'look', 'over'] },
    { sentence: 'That was ___ good!', answer: 'very', distractors: ['your', 'from', 'over'] },
    { sentence: 'I ___ like some cake.', answer: 'would', distractors: ['could', 'every', 'again'] },
  ],
  // Level 5: Dolch Pre-Primer (a, big, blue, funny, help, in, it, jump, not, play, red, run, up)
  5: [
    { sentence: 'I see ___ big dog.', answer: 'a', distractors: ['it', 'up', 'in'] },
    { sentence: 'The frog can ___.', answer: 'jump', distractors: ['help', 'play', 'run'] },
    { sentence: 'The clown is ___.', answer: 'funny', distractors: ['big', 'red', 'blue'] },
    { sentence: 'Can you ___ me?', answer: 'help', distractors: ['run', 'play', 'jump'] },
    { sentence: 'It is ___ the box.', answer: 'in', distractors: ['up', 'big', 'not'] },
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
