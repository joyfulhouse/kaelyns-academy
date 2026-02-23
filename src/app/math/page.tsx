'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useProgress } from '@/hooks/useProgress';
import { useTutor } from '@/hooks/useTutor';
import Problem from '@/components/Problem';
import AnswerButtons from '@/components/AnswerButtons';
import ProgressBar from '@/components/ProgressBar';
import Tutor from '@/components/Tutor';
import StarDisplay from '@/components/StarDisplay';
import { generateMathProblem } from '@/lib/mathProblems';
import { processAnswer, getEffectiveLevel, pickNextSkill } from '@/lib/engine';
import type { MathProblem, MathSkill } from '@/types';

const TOTAL_QUESTIONS = 10;
const RESULT_DELAY_MS = 1500;
const BONUS_STAR_THRESHOLD = 0.8;

export default function MathPage() {
  const { progress, updateSkill, addStar } = useProgress();
  const { messages, speaking, ask } = useTutor();

  const [currentProblem, setCurrentProblem] = useState<MathProblem | null>(null);
  const [currentSkill, setCurrentSkill] = useState<MathSkill>('addSub');
  const [questionNum, setQuestionNum] = useState(0);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [sessionDone, setSessionDone] = useState(false);
  const initialized = useRef(false);

  const nextProblem = useCallback(() => {
    const skill = pickNextSkill('math', progress.math) as MathSkill;
    const level = getEffectiveLevel(progress.math[skill]);
    const problem = generateMathProblem(skill, level);
    setCurrentSkill(skill);
    setCurrentProblem(problem);
    setShowResult(false);
    setAnswered(false);
  }, [progress.math]);

  // Greet and generate first problem on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void ask({ action: 'greet' });
    // Use a small delay so progress is loaded before picking skill
    const timer = setTimeout(() => {
      const skill = pickNextSkill('math', progress.math) as MathSkill;
      const level = getEffectiveLevel(progress.math[skill]);
      const problem = generateMathProblem(skill, level);
      setCurrentSkill(skill);
      setCurrentProblem(problem);
    }, 100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAnswer = useCallback(
    (answer: string | number) => {
      if (answered || !currentProblem) return;
      setAnswered(true);

      const wasCorrect = Number(answer) === currentProblem.answer;
      const result = processAnswer(currentSkill, progress.math[currentSkill], wasCorrect);

      updateSkill('math', currentSkill, result.progress);
      if (result.earnedStar) {
        addStar();
      }

      setShowResult(true);
      if (wasCorrect) {
        setSessionCorrect((prev) => prev + 1);
      }

      void ask({
        action: wasCorrect ? 'correct' : 'scaffold',
        problem: currentProblem,
        studentAnswer: Number(answer),
        wasCorrect,
        currentLevel: result.progress.level,
        recentStreak: result.progress.consecutiveCorrect,
      });

      const nextQ = questionNum + 1;
      setTimeout(() => {
        if (nextQ >= TOTAL_QUESTIONS) {
          setSessionDone(true);
          const finalCorrect = wasCorrect ? sessionCorrect + 1 : sessionCorrect;
          void ask({
            action: 'summarize',
            sessionStats: { correct: finalCorrect, total: TOTAL_QUESTIONS },
          });
          // Bonus star for 80%+ accuracy
          if (finalCorrect / TOTAL_QUESTIONS >= BONUS_STAR_THRESHOLD) {
            addStar();
          }
        } else {
          setQuestionNum(nextQ);
          nextProblem();
        }
      }, RESULT_DELAY_MS);
    },
    [
      answered,
      currentProblem,
      currentSkill,
      progress.math,
      questionNum,
      sessionCorrect,
      updateSkill,
      addStar,
      ask,
      nextProblem,
    ],
  );

  const handleHint = useCallback(() => {
    if (!currentProblem) return;
    void ask({
      action: 'hint',
      problem: currentProblem,
      currentLevel: currentProblem.level,
    });
  }, [ask, currentProblem]);

  const handlePlayAgain = useCallback(() => {
    setQuestionNum(0);
    setSessionCorrect(0);
    setSessionDone(false);
    setShowResult(false);
    setAnswered(false);
    void ask({ action: 'greet' });
    nextProblem();
  }, [ask, nextProblem]);

  // Session done screen
  if (sessionDone) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-cream p-6">
        <div className="flex flex-col items-center gap-6 text-center">
          <span className="text-7xl" role="img" aria-label="Star">
            {'\u2B50'}
          </span>
          <h1 className="font-display text-4xl font-bold text-chocolate">
            Great Job!
          </h1>
          <p className="font-display text-2xl text-chocolate-muted">
            You got{' '}
            <span className="font-bold text-coral">{sessionCorrect}</span> out
            of <span className="font-bold">{TOTAL_QUESTIONS}</span> correct!
          </p>
          {sessionCorrect / TOTAL_QUESTIONS >= BONUS_STAR_THRESHOLD && (
            <p className="font-display text-lg text-sage-dark font-semibold">
              Bonus star earned!
            </p>
          )}
          <div className="flex flex-col gap-3 w-full max-w-xs mt-4">
            <button
              type="button"
              onClick={handlePlayAgain}
              className="bg-coral hover:bg-coral-dark text-white font-display text-xl font-bold py-4 px-8 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 shadow-medium"
            >
              Play Again
            </button>
            <Link
              href="/"
              className="bg-sage hover:bg-sage-dark text-white font-display text-xl font-bold py-4 px-8 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 shadow-medium text-center"
            >
              Home
            </Link>
          </div>
        </div>
        <div className="fixed bottom-4 left-4 right-4 z-50 max-w-lg mx-auto">
          <Tutor messages={messages} speaking={speaking} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      {/* Top bar */}
      <header className="flex items-center gap-3 px-4 py-3 bg-paper border-b-2 border-cream-dark">
        <Link
          href="/"
          className="flex items-center justify-center w-10 h-10 rounded-full bg-cream hover:bg-cream-dark transition-colors text-chocolate text-xl"
          aria-label="Back to home"
        >
          {'\u2190'}
        </Link>
        <div className="flex-1">
          <ProgressBar current={questionNum} total={TOTAL_QUESTIONS} label="Math" />
        </div>
        <StarDisplay />
      </header>

      {/* Center: problem + answers */}
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 pb-28">
        {currentProblem ? (
          <>
            <Problem problem={currentProblem} />
            <AnswerButtons
              options={currentProblem.options}
              onAnswer={handleAnswer}
              disabled={answered}
              correctAnswer={currentProblem.answer}
              showResult={showResult}
            />
          </>
        ) : (
          <p className="font-display text-xl text-chocolate-muted">
            Loading...
          </p>
        )}
      </main>

      {/* Bottom: Tutor */}
      <Tutor messages={messages} speaking={speaking} onTap={handleHint} />
    </div>
  );
}
