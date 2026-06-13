'use client';

import type { Problem } from '@/types';

interface ProblemProps {
  problem: Problem;
}

export default function Problem({ problem }: ProblemProps) {
  // Discriminate MathProblem vs ReadingProblem
  if ('num1' in problem) {
    // MathProblem: large centered text showing problem.display
    return (
      <div className="flex items-center justify-center py-8">
        <span className="font-display text-5xl text-chocolate font-bold tracking-wide md:text-6xl">
          {problem.display}
        </span>
      </div>
    );
  }

  // ReadingProblem
  const readingProblem = problem;

  if (readingProblem.type === 'fillBlank' && readingProblem.sentence) {
    // Fill in the blank: show the sentence
    return (
      <div className="flex items-center justify-center py-8 px-4">
        <p className="font-display text-2xl text-chocolate text-center leading-relaxed md:text-3xl">
          {readingProblem.sentence}
        </p>
      </div>
    );
  }

  if (readingProblem.type === 'blending') {
    // Blending: show separated letters (c . a . t)
    const letters = readingProblem.display.split('');
    return (
      <div className="flex items-center justify-center gap-3 py-8">
        {letters.map((letter, index) => (
          <span key={index} className="flex items-center gap-3">
            <span className="font-display text-5xl text-chocolate font-bold md:text-6xl">
              {letter}
            </span>
            {index < letters.length - 1 && (
              <span className="text-3xl text-chocolate-muted font-bold">{'\u00B7'}</span>
            )}
          </span>
        ))}
      </div>
    );
  }

  // Default reading: show the word large
  return (
    <div className="flex items-center justify-center py-8">
      <span className="font-display text-5xl text-chocolate font-bold tracking-wide md:text-6xl">
        {readingProblem.display}
      </span>
    </div>
  );
}
