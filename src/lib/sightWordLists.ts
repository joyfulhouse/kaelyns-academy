export interface SightWordLevel {
  level: number;
  name: string;
  words: string[];
}

export const SIGHT_WORD_LEVELS: SightWordLevel[] = [
  { level: 1, name: 'First Words', words: ['a', 'I', 'the', 'to', 'and', 'is', 'it', 'you', 'my', 'we'] },
  { level: 2, name: 'Color Words', words: ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'black', 'white', 'brown'] },
  { level: 3, name: 'Action Words', words: ['go', 'see', 'look', 'come', 'run', 'play', 'like', 'can', 'said', 'went'] },
  { level: 4, name: 'People Words', words: ['he', 'she', 'me', 'we', 'they', 'him', 'her', 'mom', 'dad', 'friend'] },
  { level: 5, name: 'Question Words', words: ['what', 'where', 'who', 'when', 'why', 'how', 'are', 'was', 'were', 'do'] },
  { level: 6, name: 'Everyday Words', words: ['up', 'down', 'in', 'out', 'on', 'off', 'big', 'little', 'good', 'day'] },
  { level: 7, name: 'More Words', words: ['this', 'that', 'here', 'there', 'all', 'some', 'one', 'two', 'three', 'no'] },
  { level: 8, name: 'Story Words', words: ['have', 'has', 'had', 'make', 'made', 'want', 'help', 'find', 'say', 'yes'] },
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
