"use client";

import { useCallback, useState } from "react";
import type { LangSymbolIntroConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { AudioUnavailableNotice } from "../_shared/AudioUnavailableNotice";
import { ProgressHint, SpeakerButton } from "../_shared/ActivityChrome";
import { ChoiceGrid } from "../_shared/ChoiceGrid";
import { localeForRole } from "../_shared/speechRouting";
import { useActivity } from "../_shared/useActivity";
import { useAudio } from "../_shared/useAudio";
import { useMultipleChoice } from "../_shared/useMultipleChoice";
import { useEffectOncePerKey } from "../_shared/useSpeakOnce";
import { schema, type LangSymbolIntroResponse } from "./logic";

/**
 * Meet a small set of symbols (see the glyph, tap to hear it), then a short,
 * forgiving check. Audio is hybrid + locale-aware via useAudio: a pre-recorded
 * clip plays when one exists for the symbol's id, otherwise the browser speaks
 * the `spoken` text in the right language.
 */
export function LangSymbolIntroPlayer({
  config,
  onComplete,
}: ActivityPlayerProps<LangSymbolIntroConfig, LangSymbolIntroResponse>) {
  const parsed = useActivity(schema, config);
  // Two voices: the target language for content (symbols, choices) and the
  // learner's base language for instructions — which are authored in English and
  // would be mangled if read with the target-language TTS voice.
  const target = useAudio(localeForRole(parsed.locale, "content"));
  const base = useAudio(localeForRole(parsed.locale, "instruction"));

  const [phase, setPhase] = useState<"learn" | "quiz">("learn");

  // Each helper cancels the other engine first so the two voices never overlap.
  const sayInstruction = useCallback(() => {
    target.cancel();
    base.play({ text: parsed.instruction });
  }, [target, base, parsed.instruction]);
  const playContent = useCallback(
    (opts: { audioKey?: string; text: string }) => {
      base.cancel();
      target.play(opts);
    },
    [base, target],
  );
  const stopAll = useCallback(() => {
    base.cancel();
    target.cancel();
  }, [base, target]);

  // Say the (base-language) instruction once when the activity opens.
  useEffectOncePerKey(sayInstruction);

  const { step, picked, choose } = useMultipleChoice({
    count: parsed.verify.length,
    voiceChoice: (i, itemIndex) => playContent({ text: parsed.verify[itemIndex].choices[i] }),
    onFinish: (answers) => {
      const response: LangSymbolIntroResponse = { verifyAnswers: answers };
      onComplete(response);
    },
  });

  if (phase === "learn") {
    return (
      <div className="grid gap-8">
        <div className="flex items-center justify-center gap-3">
          <SpeakerButton
            onSpeak={sayInstruction}
            label="Hear what to do"
            size="sm"
            shape="round"
            tone="honeySoft"
            press="soft"
          />
          <p className="text-center text-lg text-ink-soft">{parsed.instruction}</p>
        </div>

        {target.status === "unavailable" ? (
          <AudioUnavailableNotice onRetry={target.retry} />
        ) : null}

        <div className="mx-auto grid max-w-2xl grid-cols-2 gap-4 sm:grid-cols-3">
          {parsed.symbols.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => playContent({ audioKey: s.audioKey ?? s.id, text: s.spoken })}
              aria-label={`${s.symbol}, says ${s.romanization}`}
              className="grid min-h-32 place-items-center gap-1 rounded-2xl border-[3px] border-ink bg-paper-raised px-4 py-5 shadow-pop transition duration-200 ease-out hover:-translate-y-0.5 active:translate-y-1 active:shadow-none"
            >
              <span className="font-display text-5xl text-ink">{s.symbol}</span>
              <span className="text-base text-ink-soft">{s.romanization}</span>
              {s.example ? <span className="text-sm text-ink-soft">{s.example}</span> : null}
            </button>
          ))}
        </div>

        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => {
              stopAll();
              setPhase("quiz");
            }}
            className="min-h-24 rounded-full border-[3px] border-ink bg-success/25 px-8 py-4 font-display text-xl text-ink shadow-pop transition duration-200 ease-out hover:-translate-y-0.5 active:translate-y-1 active:shadow-none"
          >
            I&apos;m ready
          </button>
        </div>
      </div>
    );
  }

  const q = parsed.verify[step];

  return (
    <div className="grid gap-8">
      <p className="text-center font-display text-2xl text-ink">{q.prompt}</p>
      {target.status === "unavailable" ? (
        <AudioUnavailableNotice onRetry={target.retry} />
      ) : null}
      <ChoiceGrid choices={q.choices} answerIndex={q.answerIndex} picked={picked} onChoose={choose} />
      <ProgressHint>
        {step + 1} of {parsed.verify.length}
      </ProgressHint>
    </div>
  );
}
