export interface SightWordLevel {
  level: number;
  name: string;
  words: string[];
}

/**
 * Combined SIPPS Beginning + Dolch sight words, organized by difficulty.
 * Levels 1-4 follow the SIPPS Beginning lesson sequence.
 * Levels 5-8 add Dolch words not already covered by SIPPS.
 */
export const SIGHT_WORD_LEVELS: SightWordLevel[] = [
  // SIPPS Beginning Lessons 1-10
  {
    level: 1,
    name: 'SIPPS 1-10',
    words: ['see', 'I', 'the', 'you', 'can', 'me', 'and', 'we', 'on', 'is', 'yes', 'are', 'no', 'he'],
  },
  // SIPPS Beginning Lessons 11-20
  {
    level: 2,
    name: 'SIPPS 11-20',
    words: ['she', 'get', 'to', 'was', 'go', 'down', 'saw', 'my', 'where', 'here', 'they', 'little', 'put', 'what'],
  },
  // SIPPS Beginning Lessons 21-30
  {
    level: 3,
    name: 'SIPPS 21-30',
    words: ['do', 'like', 'have', 'home', 'said', 'her', 'of', 'out', 'name', 'some', 'come', 'make', 'say'],
  },
  // SIPPS Beginning Lessons 31-55
  {
    level: 4,
    name: 'SIPPS 31-55',
    words: ['be', 'look', 'there', 'over', 'want', 'water', 'from', 'for', 'find', 'people', 'again', 'your', 'very', 'could', 'would', 'one', 'two', 'good', 'every'],
  },
  // Dolch Pre-Primer (words not already in SIPPS levels above)
  {
    level: 5,
    name: 'Dolch Pre-Primer',
    words: ['a', 'big', 'blue', 'funny', 'help', 'in', 'it', 'jump', 'not', 'play', 'red', 'run', 'up'],
  },
  // Dolch Primer (words not already covered)
  {
    level: 6,
    name: 'Dolch Primer',
    words: ['all', 'am', 'at', 'ate', 'did', 'eat', 'four', 'into', 'new', 'please', 'ran', 'ride', 'so', 'soon', 'this', 'under', 'well', 'went', 'white', 'who'],
  },
  // Dolch First Grade (words not already covered)
  {
    level: 7,
    name: 'Dolch First Grade',
    words: ['after', 'an', 'ask', 'by', 'fly', 'give', 'had', 'has', 'him', 'how', 'just', 'know', 'let', 'live', 'may', 'old', 'open', 'take', 'them', 'then', 'think', 'walk', 'when'],
  },
  // Dolch Second Grade (words not already covered)
  {
    level: 8,
    name: 'Dolch Second Grade',
    words: ['always', 'around', 'because', 'before', 'best', 'both', 'buy', 'call', 'cold', 'fast', 'first', 'green', 'its', 'made', 'many', 'off', 'or', 'pull', 'read', 'sleep', 'tell', 'upon', 'which', 'why', 'work'],
  },
];

export function getWordsForLevel(level: number): string[] {
  return SIGHT_WORD_LEVELS.find((l) => l.level === level)?.words ?? [];
}

export function getWordsUpToLevel(level: number): string[] {
  return SIGHT_WORD_LEVELS.filter((l) => l.level <= level).flatMap((l) => l.words);
}

export function getRandomWords(count: number, level: number): string[] {
  const words = getWordsForLevel(level);
  const shuffled = [...words].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export const TOTAL_LEVELS = SIGHT_WORD_LEVELS.length;
