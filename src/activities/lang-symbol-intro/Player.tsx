"use client";

import { useCallback, useState } from "react";
import type { LangSymbolIntroConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { cn } from "@/lib/cn";
import { AudioUnavailableNotice } from "../_shared/AudioUnavailableNotice";
import { ProgressHint, SpeakerButton } from "../_shared/ActivityChrome";
import { ChoiceGrid } from "../_shared/ChoiceGrid";
import { localeForRole } from "../_shared/speechRouting";
import { useActivity } from "../_shared/useActivity";
import { useAudio } from "../_shared/useAudio";
import { useEffectOncePerKey } from "../_shared/useSpeakOnce";
import { schema, type LangSymbolIntroResponse } from "./logic";
import {
  activateExample,
  activateSymbol,
  advanceSymbolBatch,
  advanceSymbolCheck,
  chooseSymbolAnswer,
  createSymbolIntroState,
  currentBatchReady,
  toggleSymbolHelp,
} from "./model";

/** Guided symbol exposure in small batches, followed by forgiving spoken checks. */
export function LangSymbolIntroPlayer({
  config,
  onComplete,
}: ActivityPlayerProps<LangSymbolIntroConfig, LangSymbolIntroResponse>) {
  const parsed = useActivity(schema, config);
  const target = useAudio(localeForRole(parsed.locale, "content"));
  const base = useAudio(localeForRole(parsed.locale, "instruction"));
  const [state, setState] = useState(() =>
    createSymbolIntroState(parsed.symbols.map((symbol) => symbol.id)),
  );
  const [pendingSymbolId, setPendingSymbolId] = useState<string | null>(null);

  const sayInstruction = useCallback(() => {
    target.stop();
    base.play({ text: parsed.instruction });
  }, [base, parsed.instruction, target]);

  const playTarget = useCallback(
    (
      request: { audioKey?: string; text: string },
      handlers?: { onReady?: () => void; onUnavailable?: () => void },
    ) => {
      base.stop();
      target.play(request, handlers);
    },
    [base, target],
  );

  const verification = parsed.verify[state.verifyStep];
  const speakVerification = useCallback(() => {
    if (state.phase !== "verify" || !verification) return;
    target.stop();
    base.play({ text: verification.spokenPrompt ?? verification.prompt });
  }, [base, state.phase, target, verification]);

  useEffectOncePerKey(sayInstruction);
  useEffectOncePerKey(speakVerification, `${state.phase}-${state.verifyStep}`, {
    essentialContentAudio: true,
  });

  const playSymbol = (symbolId: string, audioKey: string | undefined, spoken: string): void => {
    setPendingSymbolId(symbolId);
    playTarget(
      { audioKey: audioKey ?? symbolId, text: spoken },
      {
        onReady: () => {
          setState((current) => activateSymbol(current, symbolId));
          setPendingSymbolId(null);
        },
      },
    );
  };

  const playExample = (symbolId: string, spoken: string): void => {
    setPendingSymbolId(symbolId);
    playTarget(
      { text: spoken },
      {
        onReady: () => {
          setState((current) => activateExample(current, symbolId));
          setPendingSymbolId(null);
        },
      },
    );
  };

  const advanceBatch = (): void => {
    const next = advanceSymbolBatch(state);
    if (next === state) return;
    target.stop();
    base.stop();
    setPendingSymbolId(null);
    setState(next);
  };

  const choose = (choiceIndex: number): void => {
    if (!verification) return;
    setState((current) =>
      chooseSymbolAnswer(current, choiceIndex, verification.answerIndex),
    );
  };

  const advanceCheck = (): void => {
    const next = advanceSymbolCheck(state, parsed.verify.length);
    if (next === state) return;
    base.stop();
    if (next.completed) {
      const response: LangSymbolIntroResponse = {
        exposures: next.exposures,
        checks: next.checks,
      };
      onComplete(response);
      return;
    }
    setState(next);
  };

  if (state.phase === "learn") {
    const currentIds = state.batches[state.batchIndex] ?? [];
    const currentSymbols = parsed.symbols.filter((symbol) => currentIds.includes(symbol.id));
    const firstSymbolNumber = state.batches
      .slice(0, state.batchIndex)
      .reduce((total, batch) => total + batch.length, 1);
    const lastSymbolNumber = firstSymbolNumber + currentSymbols.length - 1;
    const ready = currentBatchReady(state);

    return (
      <div className="grid gap-7">
        <div className="flex items-center justify-center gap-3">
          <SpeakerButton
            onSpeak={sayInstruction}
            label="Hear what to do"
            size="sm"
            shape="round"
            tone="honeySoft"
            press="soft"
          />
          <p className="max-w-2xl text-balance text-center text-lg text-ink-soft">
            {parsed.instruction}
          </p>
        </div>

        {target.status === "unavailable" ? (
          <AudioUnavailableNotice onRetry={target.retry} />
        ) : null}

        <div className="flex flex-wrap items-center justify-center gap-3">
          <p className="font-display text-lg text-ink">
            Meet these {currentSymbols.length} {state.batchIndex === 0 ? "sounds" : "next sounds"}
          </p>
          <button
            type="button"
            onClick={() => setState(toggleSymbolHelp)}
            aria-pressed={state.helpVisible}
            className="min-h-11 rounded-full border-2 border-ink bg-honey/20 px-5 py-2 font-display text-ink transition active:translate-y-0.5"
          >
            {state.helpVisible ? "Hide sound help" : "Show sound help"}
          </button>
        </div>

        <div className="mx-auto grid w-full max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
          {currentSymbols.map((symbol) => {
            const exposure = state.exposures.find((entry) => entry.symbolId === symbol.id);
            const activated = exposure?.activated ?? false;
            const waiting = pendingSymbolId === symbol.id;
            const labelParts = [symbol.symbol, symbol.meaning];
            if (state.helpVisible) labelParts.push(symbol.romanization);

            return (
              <article
                key={symbol.id}
                className={cn(
                  "grid min-h-52 content-between gap-3 rounded-3xl border-[3px] border-ink bg-paper-raised p-3 shadow-pop transition",
                  activated && "bg-success/15 ring-4 ring-success/25",
                )}
              >
                <button
                  type="button"
                  onClick={() => playSymbol(symbol.id, symbol.audioKey, symbol.spoken)}
                  aria-pressed={activated}
                  aria-busy={waiting && target.status === "playing"}
                  aria-label={`${labelParts.filter(Boolean).join(", ")}. Hear this sound`}
                  className="grid min-h-28 place-items-center gap-1 rounded-2xl px-2 py-3 text-ink transition hover:bg-honey/15 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-honey-deep active:scale-[0.98]"
                >
                  <span className="font-display text-4xl leading-tight sm:text-5xl">
                    {symbol.symbol}
                  </span>
                  {symbol.meaning ? (
                    <span className="text-sm font-semibold text-ink-soft">{symbol.meaning}</span>
                  ) : null}
                  {state.helpVisible ? (
                    <span className="rounded-full bg-honey/25 px-3 py-1 text-sm text-ink-soft">
                      {symbol.romanization}
                    </span>
                  ) : null}
                </button>

                <p className="text-center text-sm font-semibold text-ink-soft" aria-live="polite">
                  {activated
                    ? exposure?.heardExample
                      ? "Example heard"
                      : "Sound heard"
                    : waiting && target.status === "playing"
                      ? "Listening…"
                      : "Tap to hear"}
                </p>

                {symbol.example ? (
                  <div className="grid gap-1 border-t-2 border-ink/10 pt-2 text-center">
                    <span className="text-sm text-ink-soft">
                      Example: <span className="font-semibold text-ink">{symbol.example}</span>
                    </span>
                    {symbol.exampleSpoken ? (
                      <button
                        type="button"
                        onClick={() => playExample(symbol.id, symbol.exampleSpoken ?? symbol.spoken)}
                        className="min-h-10 rounded-full bg-honey/20 px-3 py-1 text-sm font-semibold text-ink transition hover:bg-honey/35 active:translate-y-0.5"
                        aria-label={`Hear example ${symbol.example}`}
                      >
                        Hear example
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>

        <div className="grid place-items-center gap-3" aria-live="polite">
          <p className="text-center text-ink-soft">
            {ready ? "Every sound in this group is ready." : "Tap each card to hear its sound."}
          </p>
          <button
            type="button"
            onClick={advanceBatch}
            disabled={!ready}
            className="min-h-14 rounded-full border-[3px] border-ink bg-success/25 px-8 py-3 font-display text-xl text-ink shadow-pop transition enabled:hover:-translate-y-0.5 enabled:active:translate-y-1 enabled:active:shadow-none disabled:cursor-not-allowed disabled:opacity-45"
          >
            {state.batchIndex + 1 === state.batches.length ? "I’m ready" : "Meet next sounds"}
          </button>
        </div>

        <ProgressHint>
          Symbols {firstSymbolNumber}–{lastSymbolNumber} of {parsed.symbols.length}
        </ProgressHint>
      </div>
    );
  }

  if (!verification) return null;

  return (
    <div className="grid gap-7">
      <div className="flex items-center justify-center gap-4">
        <SpeakerButton
          onSpeak={speakVerification}
          label="Hear the question again"
          size="sm"
          shape="round"
          tone="honeySoft"
          press="soft"
        />
        <p className="max-w-2xl text-balance text-center font-display text-2xl text-ink">
          {verification.prompt}
        </p>
      </div>

      {base.status === "unavailable" ? (
        <AudioUnavailableNotice onRetry={base.retry} />
      ) : null}

      <ChoiceGrid
        choices={verification.choices}
        answerIndex={verification.answerIndex}
        picked={state.picked}
        onChoose={choose}
        revealAnswer={state.feedback === "correct"}
        disabled={state.feedback === "correct"}
      />

      <div className="grid min-h-20 place-items-center gap-3 text-center" aria-live="polite">
        {state.feedback === "try-again" ? (
          <p className="text-lg text-ink">Look and listen once more, then choose again.</p>
        ) : null}
        {state.feedback === "correct" ? (
          <>
            <p className="font-display text-xl text-ink">That’s the one!</p>
            <button
              type="button"
              onClick={advanceCheck}
              className="min-h-12 rounded-full border-[3px] border-ink bg-success/30 px-6 py-2 font-display text-lg text-ink shadow-pop transition active:translate-y-1 active:shadow-none"
            >
              {state.verifyStep + 1 === parsed.verify.length ? "Finish" : "Next question"}
            </button>
          </>
        ) : null}
      </div>

      <ProgressHint>
        Check {state.verifyStep + 1} of {parsed.verify.length}
      </ProgressHint>
    </div>
  );
}
