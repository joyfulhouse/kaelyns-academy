"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowRightIcon, CheckCircleIcon, MicrophoneStageIcon } from "@phosphor-icons/react/dist/ssr";
import type { ReadingComprehensionConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Prompt, SpeakerButton } from "../_shared/ActivityChrome";
import { RewardOverlay } from "../_shared/RewardOverlay";
import { useReducedMotion } from "../_shared/useReducedMotion";
import { useSpeech } from "../_shared/useSpeech";
import { schema, score, type ReadingComprehensionResponse } from "./logic";

/** Stages: read the passage → answer each question → optional retell → reward. */
type Stage = "passage" | "questions" | "retell";

export function ReadingComprehensionPlayer({
  config,
  onComplete,
}: ActivityPlayerProps<ReadingComprehensionConfig, ReadingComprehensionResponse>) {
  const parsed = useMemo(() => schema.parse(config), [config]);
  const speech = useSpeech();
  const reduced = useReducedMotion();

  const [stage, setStage] = useState<Stage>("passage");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [missedThisQuestion, setMissedThisQuestion] = useState(false);
  const [firstTry, setFirstTry] = useState<boolean[]>([]);
  const [done, setDone] = useState<ReadingComprehensionResponse | null>(null);

  // Speak the instruction once when the activity opens.
  const spokenRef = useRef(false);
  useEffect(() => {
    if (spokenRef.current) return;
    spokenRef.current = true;
    speech.speak(parsed.instruction);
  }, [parsed.instruction, speech]);

  // Clear the advance timer on unmount so leaving mid-reveal can't record an
  // attempt or set state for a screen the child has already left.
  const timerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const current = parsed.questions[questionIndex];

  if (done) {
    const result = score(parsed, done);
    return (
      <RewardOverlay
        stars={result.stars}
        message="You read it and thought it through."
        onContinue={() => onComplete(done, result)}
      />
    );
  }

  function recordAndAdvance(record: boolean[]) {
    const isLast = questionIndex === parsed.questions.length - 1;
    if (isLast) {
      if (parsed.retellPrompt) {
        setFirstTry(record);
        setStage("retell");
        speech.speak(parsed.retellPrompt);
      } else {
        setDone({ firstTry: record, retold: false });
      }
    } else {
      setFirstTry(record);
      setQuestionIndex((i) => i + 1);
      setPicked(null);
      setMissedThisQuestion(false);
    }
  }

  function choose(choiceIndex: number) {
    if (!current || picked !== null) return;
    const correct = choiceIndex === current.answerIndex;
    if (correct) {
      setPicked(choiceIndex);
      const record = [...firstTry];
      record[questionIndex] = !missedThisQuestion;
      speech.speak("That's it.");
      // Let the green check land, then move on.
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => recordAndAdvance(record), 750);
    } else {
      // Forgiving: no wrong-mark. Gently nudge back to the passage and let them
      // re-read and try a different card.
      setMissedThisQuestion(true);
      speech.speak("Good thinking. Look again and pick another one.");
    }
  }

  return (
    <div className="grid gap-8">
      <Prompt speech={speech} instruction={parsed.instruction} />

      {stage === "passage" && (
        <PassagePanel
          title={parsed.title}
          passage={parsed.passage}
          speech={speech}
          onContinue={() => setStage("questions")}
        />
      )}

      {stage === "questions" && current && (
        <div className="grid gap-6">
          {/* The passage stays a tap away so re-reading is always invited. */}
          <details className="rounded-2xl border-[3px] border-ink/15 bg-paper-raised px-5 py-3">
            <summary className="cursor-pointer select-none font-display text-lg text-ink-soft">
              Read the story again
            </summary>
            <p className="mt-3 whitespace-pre-line font-body text-lg leading-relaxed text-ink">
              {parsed.passage}
            </p>
          </details>

          <div className="flex items-center justify-center gap-3">
            <SpeakerButton
              speech={speech}
              text={current.prompt}
              label="Hear the question again"
            />
            <span className="text-sm text-ink-soft">
              Question {questionIndex + 1} of {parsed.questions.length}
            </span>
          </div>

          <p className="text-balance text-center font-display text-2xl leading-tight text-ink">
            {current.prompt}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {current.choices.map((choice, choiceIndex) => {
              const isChosen = picked === choiceIndex;
              return (
                <ChoiceCard
                  key={choiceIndex}
                  label={choice}
                  chosen={isChosen}
                  locked={picked !== null}
                  reduced={reduced}
                  onClick={() => choose(choiceIndex)}
                />
              );
            })}
          </div>

          <p className="min-h-6 text-center text-sm text-ink-soft" aria-live="polite">
            {picked !== null
              ? "Nice reading."
              : missedThisQuestion
                ? "Look at the story again, then pick another one."
                : ""}
          </p>
        </div>
      )}

      {stage === "retell" && parsed.retellPrompt && (
        <RetellPanel
          prompt={parsed.retellPrompt}
          speech={speech}
          onDone={() => setDone({ firstTry, retold: true })}
        />
      )}
    </div>
  );
}

/** The reading surface: title + a generously typed passage with a read-to-me
 *  button, then a single "I read it" button to move on. */
function PassagePanel({
  title,
  passage,
  speech,
  onContinue,
}: {
  title?: string;
  passage: string;
  speech: ReturnType<typeof useSpeech>;
  onContinue: () => void;
}) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-3 rounded-2xl border-[3px] border-ink bg-paper-raised p-6 shadow-pop">
        <div className="flex items-start justify-between gap-4">
          {title ? (
            <h2 className="font-display text-2xl text-ink sm:text-3xl">{title}</h2>
          ) : (
            <span aria-hidden="true" />
          )}
          <SpeakerButton speech={speech} text={`${title ? `${title}. ` : ""}${passage}`} label="Read the story to me" />
        </div>
        <p className="max-w-[60ch] whitespace-pre-line font-body text-xl leading-relaxed text-ink">
          {passage}
        </p>
      </div>
      <div className="flex justify-center">
        <Button variant="primary" size="kid" onClick={onContinue}>
          I read it
          <ArrowRightIcon weight="bold" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

/** A big tappable answer card. Chosen = honey fill + check; never a red wrong-mark. */
function ChoiceCard({
  label,
  chosen,
  locked,
  reduced,
  onClick,
}: {
  label: string;
  chosen: boolean;
  locked: boolean;
  reduced: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={locked}
      aria-pressed={chosen}
      whileTap={reduced || locked ? undefined : { scale: 0.97 }}
      className={cn(
        "flex min-h-16 items-center justify-between gap-3 rounded-2xl border-[3px] border-ink px-5 py-4 text-left",
        "font-display text-xl text-ink shadow-pop transition duration-200 ease-out",
        chosen ? "bg-honey" : "bg-paper-raised",
        locked
          ? "disabled:opacity-100"
          : "hover:-translate-y-0.5 active:translate-y-1 active:shadow-none",
      )}
    >
      <span>{label}</span>
      {chosen && (
        <motion.span
          initial={reduced ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: reduced ? 0.001 : 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="text-success"
        >
          <CheckCircleIcon size={32} weight="fill" aria-hidden="true" />
        </motion.span>
      )}
    </motion.button>
  );
}

/** The optional retell moment: a "say it out loud" prompt. Nothing is recorded
 *  or graded — it is a speaking bridge, so the only action is "I told it". */
function RetellPanel({
  prompt,
  speech,
  onDone,
}: {
  prompt: string;
  speech: ReturnType<typeof useSpeech>;
  onDone: () => void;
}) {
  return (
    <div className="grid gap-5 text-center">
      <div className="grid justify-items-center gap-4 rounded-2xl border-[3px] border-ink bg-paper-raised p-6 shadow-pop">
        <span className="grid size-16 place-items-center rounded-2xl border-[3px] border-ink bg-honey text-ink">
          <MicrophoneStageIcon size={32} weight="fill" aria-hidden="true" />
        </span>
        <div className="flex items-center justify-center gap-3">
          <SpeakerButton speech={speech} text={prompt} label="Hear it again" />
          <p className="text-balance font-display text-2xl leading-tight text-ink">{prompt}</p>
        </div>
        <p className="max-w-[48ch] text-base text-ink-soft">
          Tell it out loud to someone near you. No need to write it down.
        </p>
      </div>
      <div className="flex justify-center">
        <Button variant="primary" size="kid" onClick={onDone}>
          I told it
          <ArrowRightIcon weight="bold" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
