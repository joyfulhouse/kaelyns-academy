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
import { generateReadingProblem } from '@/lib/readingProblems';
import { processAnswer, getEffectiveLevel, pickNextSkill } from '@/lib/engine';
import type { ReadingSkill } from '@/types';

const TOTAL_QUESTIONS = 10;
const RESULT_DELAY_MS = 1500;
const BONUS_STAR_THRESHOLD = 0.8;

export default function ReadingPage() {
  const { progress, updateSkill, addStar } = useProgress();
  const { messages, speaking, ask, speak } = useTutor();

  // Progress is guaranteed loaded (ProgressProvider gates children)
  const [{ skill: currentSkill, problem: currentProblem }, setCurrentState] = useState(() => {
    const skill = pickNextSkill('reading', progress.reading) as ReadingSkill;
    const level = getEffectiveLevel(progress.reading[skill]);
    return { skill, problem: generateReadingProblem(skill, level) };
  });
  const [questionNum, setQuestionNum] = useState(0);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [sessionDone, setSessionDone] = useState(false);

  // Greet once on mount, speak first hearAndTap word
  const greeted = useRef(false);
  useEffect(() => {
    if (greeted.current) return;
    greeted.current = true;
    void ask({ action: 'greet' });
    if (currentProblem.type === 'hearAndTap') {
      void speak(currentProblem.answer);
    }
  }, [ask, speak, currentProblem]);

  const loadProblem = useCallback(() => {
    const skill = pickNextSkill('reading', progress.reading) as ReadingSkill;
    const level = getEffectiveLevel(progress.reading[skill]);
    const problem = generateReadingProblem(skill, level);
    setCurrentState({ skill, problem });
    setShowResult(false);
    setAnswered(false);

    if (problem.type === 'hearAndTap') {
      void speak(problem.answer);
    }
  }, [progress.reading, speak]);

  const handleAnswer = useCallback(
    (answer: string | number) => {
      if (answered) return;
      setAnswered(true);

      const wasCorrect = String(answer) === currentProblem.answer;
      const result = processAnswer(currentSkill, progress.reading[currentSkill], wasCorrect);

      updateSkill('reading', currentSkill, result.progress);
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
        studentAnswer: String(answer),
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
          if (finalCorrect / TOTAL_QUESTIONS >= BONUS_STAR_THRESHOLD) {
            addStar();
          }
        } else {
          setQuestionNum(nextQ);
          loadProblem();
        }
      }, RESULT_DELAY_MS);
    },
    [
      answered,
      currentProblem,
      currentSkill,
      progress.reading,
      questionNum,
      sessionCorrect,
      updateSkill,
      addStar,
      ask,
      loadProblem,
    ],
  );

  const handleHint = useCallback(() => {
    void ask({
      action: 'hint',
      problem: currentProblem,
      currentLevel: currentProblem.level,
    });
  }, [ask, currentProblem]);

  const handleSpeakWord = useCallback(() => {
    void speak(currentProblem.display);
  }, [speak, currentProblem]);

  const handlePlayAgain = useCallback(() => {
    setQuestionNum(0);
    setSessionCorrect(0);
    setSessionDone(false);
    setShowResult(false);
    setAnswered(false);
    void ask({ action: 'greet' });
    loadProblem();
  }, [ask, loadProblem]);

  if (sessionDone) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-cream p-6">
        <div className="flex flex-col items-center gap-6 text-center">
          <span className="text-7xl" role="img" aria-label="Star">
            {'\u2B50'}
          </span>
          <h1 className="font-display text-4xl font-bold text-chocolate">
            Amazing!
          </h1>
          <p className="font-display text-2xl text-chocolate-muted">
            You got{' '}
            <span className="font-bold text-sage">{sessionCorrect}</span> out of{' '}
            <span className="font-bold">{TOTAL_QUESTIONS}</span> correct!
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
              className="bg-sage hover:bg-sage-dark text-white font-display text-xl font-bold py-4 px-8 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 shadow-medium"
            >
              Play Again
            </button>
            <Link
              href="/"
              className="bg-coral hover:bg-coral-dark text-white font-display text-xl font-bold py-4 px-8 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 shadow-medium text-center"
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
      <header className="flex items-center gap-3 px-4 py-3 bg-paper border-b-2 border-cream-dark">
        <Link
          href="/"
          className="flex items-center justify-center w-10 h-10 rounded-full bg-cream hover:bg-cream-dark transition-colors text-chocolate text-xl"
          aria-label="Back to home"
        >
          {'\u2190'}
        </Link>
        <div className="flex-1">
          <ProgressBar current={questionNum} total={TOTAL_QUESTIONS} label="Reading" />
        </div>
        <StarDisplay />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 pb-28">
        <Problem problem={currentProblem} />
        {currentProblem.type === 'seeAndSay' && !answered && (
          <button
            type="button"
            onClick={handleSpeakWord}
            className="flex items-center justify-center w-14 h-14 rounded-full bg-sky hover:bg-sky-dark text-white text-2xl transition-all duration-200 hover:scale-105 active:scale-95 shadow-medium"
            aria-label="Hear the word"
          >
            {'\uD83D\uDD0A'}
          </button>
        )}
        <AnswerButtons
          options={currentProblem.options}
          onAnswer={handleAnswer}
          disabled={answered}
          correctAnswer={currentProblem.answer}
          showResult={showResult}
        />
      </main>

      <Tutor messages={messages} speaking={speaking} onTap={handleHint} />
    </div>
  );
}
