"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LangSymbolIntroConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { cn } from "@/lib/cn";
import { Prompt } from "../_shared/ActivityChrome";
import { RewardOverlay } from "../_shared/RewardOverlay";
import { useSpeech } from "../_shared/useSpeech";
import { schema, score, type LangSymbolIntroResponse } from "./logic";

/**
 * Meet a small set of symbols (see the glyph, tap to hear it), then a short,
 * forgiving check. Audio is locale-aware via useSpeech; Wave-2 swaps in
 * pre-recorded clips through useAudio when an `audioKey` is present.
 */
export function LangSymbolIntroPlayer({
  config,
  onComplete,
}: ActivityPlayerProps<LangSymbolIntroConfig, LangSymbolIntroResponse>) {
  const parsed = useMemo(() => schema.parse(config), [config]);
  const speech = useSpeech(parsed.locale);

  const [phase, setPhase] = useState<"learn" | "quiz">("learn");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [done, setDone] = useState<LangSymbolIntroResponse | null>(null);

  const introRef = useRef(false);
  useEffect(() => {
    if (introRef.current) return;
    introRef.current = true;
    speech.speak(parsed.instruction);
  }, [parsed.instruction, speech]);

  if (done) {
    const result = score(parsed, done);
    return (
      <RewardOverlay
        stars={result.stars}
        message="You met some new symbols!"
        onContinue={() => onComplete(done, result)}
      />
    );
  }

  if (phase === "learn") {
    return (
      <div className="grid gap-8">
        <Prompt speech={speech} instruction={parsed.instruction} />
        <div className="mx-auto grid max-w-2xl grid-cols-2 gap-4 sm:grid-cols-3">
          {parsed.symbols.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => speech.speak(s.spoken)}
              aria-label={`${s.symbol}, says ${s.romanization}`}
              className="grid min-h-32 place-items-center gap-1 rounded-2xl border-[3px] border-ink bg-paper-raised px-4 py-5 shadow-pop transition duration-200 ease-out hover:-translate-y-0.5 active:translate-y-1 active:shadow-none"
            >
              <span className="font-display text-5xl text-ink">{s.symbol}</span>
              <span className="text-base text-ink-soft">{s.romanization}</span>
              {s.example ? (
                <span className="text-sm text-ink-soft">{s.example}</span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => {
              speech.cancel();
              setPhase("quiz");
            }}
            className="rounded-full border-[3px] border-ink bg-success/25 px-8 py-4 font-display text-xl text-ink shadow-pop transition duration-200 ease-out hover:-translate-y-0.5 active:translate-y-1 active:shadow-none"
          >
            I&apos;m ready
          </button>
        </div>
      </div>
    );
  }

  const q = parsed.verify[step];

  function choose(i: number) {
    if (picked !== null) return;
    setPicked(i);
    const nextAnswers = [...answers, i];
    speech.speak(q.choices[i]);
    window.setTimeout(() => {
      if (step + 1 >= parsed.verify.length) {
        setDone({ verifyAnswers: nextAnswers });
      } else {
        setAnswers(nextAnswers);
        setStep(step + 1);
        setPicked(null);
      }
    }, 650);
  }

  return (
    <div className="grid gap-8">
      <Prompt speech={speech} instruction={q.spokenPrompt ?? q.prompt} />
      <p className="text-center font-display text-2xl text-ink">{q.prompt}</p>
      <div className="mx-auto grid max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4">
        {q.choices.map((c, i) => {
          const isPicked = picked === i;
          const isAnswer = i === q.answerIndex;
          const reveal = picked !== null;
          return (
            <button
              key={`${c}-${i}`}
              type="button"
              onClick={() => choose(i)}
              disabled={reveal}
              aria-label={c}
              className={cn(
                "grid min-h-28 place-items-center rounded-2xl border-[3px] border-ink px-4 py-5 font-display text-4xl text-ink shadow-pop transition duration-200 ease-out",
                !reveal && "bg-paper-raised hover:-translate-y-0.5 active:translate-y-1 active:shadow-none",
                reveal && isAnswer && "bg-success/30",
                reveal && !isAnswer && "bg-paper-raised opacity-60",
                reveal && isPicked && !isAnswer && "opacity-100",
              )}
            >
              {c}
            </button>
          );
        })}
      </div>
      <p className="text-center text-sm text-ink-soft" aria-live="polite">
        {step + 1} of {parsed.verify.length}
      </p>
    </div>
  );
}
