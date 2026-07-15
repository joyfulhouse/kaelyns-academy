"use client";

import { useMemo, useState } from "react";
import {
  ArrowCounterClockwiseIcon,
  ArrowRightIcon,
  CardsThreeIcon,
  MicrophoneStageIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { ReadingComprehensionConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { PlayerControls, ProgressHint, Prompt, SpeakerButton } from "../_shared/ActivityChrome";
import { shuffle } from "../_shared/shuffle";
import { useActivity } from "../_shared/useActivity";
import { useSpeakOnce } from "../_shared/useSpeakOnce";
import { useSpeech } from "../_shared/useSpeech";
import { splitPassageSentences } from "./model";
import { schema, type ReadingComprehensionResponse } from "./logic";

type Stage = "passage" | "questions" | "structured-retell" | "free-retell";

export function ReadingComprehensionPlayer({
  config,
  onComplete,
}: ActivityPlayerProps<ReadingComprehensionConfig, ReadingComprehensionResponse>) {
  const parsed = useActivity(schema, config);
  const speech = useSpeech();
  const sentences = useMemo(() => splitPassageSentences(parsed.passage), [parsed.passage]);

  const [stage, setStage] = useState<Stage>("passage");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [selectedSentence, setSelectedSentence] = useState<number | null>(null);
  const [selectedEvidenceChoice, setSelectedEvidenceChoice] = useState<number | null>(null);
  const [attempts, setAttempts] = useState(1);
  const [questionResults, setQuestionResults] = useState<
    ReadingComprehensionResponse["questionResults"]
  >([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  useSpeakOnce(speech.speak, parsed.instruction);

  const current = parsed.questions[questionIndex];

  function finishQuestions(results: ReadingComprehensionResponse["questionResults"]): void {
    setQuestionResults(results);
    if (parsed.structuredRetell) {
      setStage("structured-retell");
      speech.speak(parsed.structuredRetell.prompt);
    } else if (parsed.retellPrompt) {
      setStage("free-retell");
      speech.speak(parsed.retellPrompt);
    } else {
      onComplete({ questionResults: results });
    }
  }

  function continueFromPassage(): void {
    if (parsed.questions.length > 0) {
      setStage("questions");
    } else {
      finishQuestions([]);
    }
  }

  function resetQuestionState(): void {
    setSelectedAnswer(null);
    setSelectedSentence(null);
    setSelectedEvidenceChoice(null);
    setAttempts(1);
    setFeedback(null);
  }

  function checkQuestion(): void {
    if (!current || selectedAnswer === null) return;
    const answerCorrect = selectedAnswer === current.answerIndex;
    const evidenceCorrect = current.evidenceSentenceIndexes
      ? selectedSentence !== null && current.evidenceSentenceIndexes.includes(selectedSentence)
      : current.evidenceChoices
        ? selectedEvidenceChoice === current.evidenceChoices.answerIndex
        : true;

    if (!answerCorrect || !evidenceCorrect) {
      setAttempts((value) => Math.min(20, value + 1));
      const message = answerCorrect
        ? "Your answer fits. Look for a sentence that proves it."
        : "Keep your choices. Look back at the passage and try a different answer.";
      setFeedback(message);
      speech.speak(message);
      return;
    }

    const result: ReadingComprehensionResponse["questionResults"][number] = {
      questionIndex,
      choiceIndex: selectedAnswer,
      attempts,
      ...(selectedSentence === null ? {} : { evidenceSentenceIndex: selectedSentence }),
      ...(selectedEvidenceChoice === null ? {} : { evidenceChoiceIndex: selectedEvidenceChoice }),
    };
    const nextResults = [...questionResults, result];
    if (questionIndex === parsed.questions.length - 1) {
      finishQuestions(nextResults);
    } else {
      setQuestionResults(nextResults);
      setQuestionIndex((index) => index + 1);
      resetQuestionState();
    }
  }

  const evidenceRequired = Boolean(
    current?.evidenceSentenceIndexes || current?.evidenceChoices,
  );
  const readyToCheck =
    selectedAnswer !== null &&
    (!current?.evidenceSentenceIndexes || selectedSentence !== null) &&
    (!current?.evidenceChoices || selectedEvidenceChoice !== null);

  return (
    <div className="grid gap-8">
      <Prompt speech={speech} instruction={parsed.instruction} />

      {stage === "passage" && (
        <PassagePanel
          title={parsed.title}
          passage={parsed.passage}
          speech={speech}
          onContinue={continueFromPassage}
        />
      )}

      {stage === "questions" && current && (
        <div className="grid gap-6">
          {current.evidenceSentenceIndexes ? (
            <SentenceEvidencePanel
              sentences={sentences}
              selectedSentence={selectedSentence}
              onSelect={(index) => {
                setSelectedSentence(index);
                setFeedback(null);
              }}
            />
          ) : (
            <details className="rounded-2xl border-[3px] border-ink/15 bg-paper-raised px-5 py-3">
              <summary className="cursor-pointer select-none font-display text-lg text-ink-soft">
                Read the story again
              </summary>
              <p className="mt-3 whitespace-pre-line font-body text-lg leading-relaxed text-ink">
                {parsed.passage}
              </p>
            </details>
          )}

          <div className="flex items-center justify-center gap-3">
            <SpeakerButton speech={speech} text={current.prompt} label="Hear the question again" />
            <span className="text-sm text-ink-soft">
              Question {questionIndex + 1} of {parsed.questions.length}
            </span>
          </div>

          <p className="text-balance text-center font-display text-2xl leading-tight text-ink">
            {current.prompt}
          </p>

          <div className="grid gap-3 sm:grid-cols-2" aria-label="Answer choices">
            {current.choices.map((choice, choiceIndex) => (
              <ChoiceCard
                key={choiceIndex}
                label={choice}
                selected={selectedAnswer === choiceIndex}
                onClick={() => {
                  setSelectedAnswer(choiceIndex);
                  setFeedback(null);
                }}
              />
            ))}
          </div>

          {current.evidenceChoices && (
            <div className="grid gap-3 rounded-2xl border-[3px] border-ink/15 bg-paper-sunk p-4">
              <p className="text-center font-display text-xl text-ink">
                {current.evidenceChoices.prompt}
              </p>
              <div className="grid gap-3 sm:grid-cols-2" aria-label="Evidence choices">
                {current.evidenceChoices.choices.map((choice, choiceIndex) => (
                  <ChoiceCard
                    key={choiceIndex}
                    label={choice}
                    selected={selectedEvidenceChoice === choiceIndex}
                    onClick={() => {
                      setSelectedEvidenceChoice(choiceIndex);
                      setFeedback(null);
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="min-h-7 text-center" aria-live="polite" aria-atomic="true">
            {feedback && <p className="font-display text-lg text-ink">{feedback}</p>}
          </div>

          <PlayerControls>
            <Button variant="primary" size="kid" onClick={checkQuestion} disabled={!readyToCheck}>
              {evidenceRequired ? "Check answer and evidence" : "Check answer"}
            </Button>
          </PlayerControls>
        </div>
      )}

      {stage === "structured-retell" && parsed.structuredRetell && (
        <StructuredRetellPanel
          prompt={parsed.structuredRetell.prompt}
          events={parsed.structuredRetell.events}
          speech={speech}
          onComplete={(retell) => onComplete({ questionResults, retell })}
        />
      )}

      {stage === "free-retell" && parsed.retellPrompt && (
        <FreeRetellPanel
          prompt={parsed.retellPrompt}
          speech={speech}
          onContinue={() => onComplete({ questionResults })}
        />
      )}
    </div>
  );
}

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
          <SpeakerButton
            speech={speech}
            text={`${title ? `${title}. ` : ""}${passage}`}
            label="Read the story to me"
          />
        </div>
        <p className="max-w-[42ch] whitespace-pre-line font-body text-[1.75rem] leading-[1.7] text-ink">
          {passage}
        </p>
      </div>
      <div className="flex justify-center">
        <Button variant="primary" size="kid" onClick={onContinue}>
          Continue to questions
          <ArrowRightIcon weight="bold" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function SentenceEvidencePanel({
  sentences,
  selectedSentence,
  onSelect,
}: {
  sentences: string[];
  selectedSentence: number | null;
  onSelect: (index: number) => void;
}) {
  return (
    <section className="grid gap-3 rounded-2xl border-[3px] border-ink bg-paper-raised p-5 shadow-pop">
      <div className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl border-[3px] border-ink bg-honey">
          <CardsThreeIcon size={26} weight="bold" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-display text-xl text-ink">Choose a sentence that proves it</h2>
          <p className="text-sm text-ink-soft">Your answer and its clue work together.</p>
        </div>
      </div>
      <div className="grid gap-2" aria-label="Passage evidence sentences">
        {sentences.map((sentence, index) => (
          <button
            key={index}
            type="button"
            onClick={() => onSelect(index)}
            aria-pressed={selectedSentence === index}
            aria-label={`Evidence sentence ${index + 1}: ${sentence}`}
            className={cn(
              "min-h-14 rounded-xl border-[3px] border-ink px-4 py-3 text-left text-lg text-ink shadow-pop",
              "transition duration-150 hover:-translate-y-0.5 active:translate-y-1 active:shadow-none",
              selectedSentence === index ? "bg-honey" : "bg-paper-sunk",
            )}
          >
            <span className="mr-2 font-display text-sm text-ink-soft">{index + 1}</span>
            {sentence}
          </button>
        ))}
      </div>
    </section>
  );
}

function ChoiceCard({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex min-h-24 items-center rounded-2xl border-[3px] border-ink px-5 py-4 text-left",
        "font-display text-xl text-ink shadow-pop transition duration-150 ease-out",
        "hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-honey/60 active:translate-y-1 active:shadow-none",
        selected ? "bg-honey" : "bg-paper-raised",
      )}
    >
      {label}
    </button>
  );
}

function StructuredRetellPanel({
  prompt,
  events,
  speech,
  onComplete,
}: {
  prompt: string;
  events: { id: string; text: string }[];
  speech: ReturnType<typeof useSpeech>;
  onComplete: (retell: NonNullable<ReadingComprehensionResponse["retell"]>) => void;
}) {
  const palette = useMemo(
    () => shuffle(events, [...prompt].reduce((sum, character) => sum + character.charCodeAt(0), 0)),
    [events, prompt],
  );
  const [orderedEventIds, setOrderedEventIds] = useState<string[]>([]);
  const [attempts, setAttempts] = useState(1);
  const [feedback, setFeedback] = useState<string | null>(null);

  function addEvent(eventId: string): void {
    if (orderedEventIds.includes(eventId) || orderedEventIds.length >= events.length) return;
    setOrderedEventIds((previous) => [...previous, eventId]);
    setFeedback(null);
  }

  function removeEvent(eventId: string): void {
    setOrderedEventIds((previous) => previous.filter((id) => id !== eventId));
    setFeedback(null);
  }

  function checkOrder(): void {
    const correct = events.every((event, index) => orderedEventIds[index] === event.id);
    if (!correct) {
      setAttempts((value) => Math.min(20, value + 1));
      setFeedback("Keep your event order and try moving a card.");
      speech.speak("Keep your event order and try moving a card.");
      return;
    }
    onComplete({ eventIds: orderedEventIds, attempts });
  }

  return (
    <div className="grid gap-6">
      <ProgressHint>Nice reading. Now put the events in order.</ProgressHint>
      <div className="flex items-center justify-center gap-3">
        <SpeakerButton speech={speech} text={prompt} label="Hear the retell prompt again" />
        <h2 className="text-balance text-center font-display text-2xl text-ink">{prompt}</h2>
      </div>

      <ol
        aria-label="Your event order"
        className="grid min-h-28 gap-3 rounded-2xl border-[3px] border-dashed border-ink/30 bg-paper-sunk p-4"
      >
        {orderedEventIds.length === 0 && (
          <li className="grid min-h-14 place-items-center text-center text-ink-soft">
            Add the first event.
          </li>
        )}
        {orderedEventIds.map((eventId, index) => {
          const event = events.find((candidate) => candidate.id === eventId);
          if (!event) return null;
          return (
            <li key={eventId}>
              <button
                type="button"
                onClick={() => removeEvent(eventId)}
                onKeyDown={(keyEvent) => {
                  if (keyEvent.key === "Delete" || keyEvent.key === "Backspace") {
                    keyEvent.preventDefault();
                    removeEvent(eventId);
                  }
                }}
                aria-label={`Placed event ${event.text} at position ${index + 1}. Activate to return it`}
                className="flex min-h-14 w-full items-center gap-3 rounded-xl border-[3px] border-ink bg-honey px-4 py-3 text-left font-display text-lg text-ink shadow-pop"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-sm text-paper-raised">
                  {index + 1}
                </span>
                {event.text}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="grid gap-3 sm:grid-cols-2" aria-label="Event cards">
        {palette.map((event) => {
          const used = orderedEventIds.includes(event.id);
          return (
            <button
              key={event.id}
              type="button"
              onClick={() => addEvent(event.id)}
              disabled={used}
              aria-label={`Add event ${event.text}`}
              className="min-h-20 rounded-2xl border-[3px] border-ink bg-paper-raised px-4 py-4 text-left font-display text-lg text-ink shadow-pop transition hover:-translate-y-0.5 active:translate-y-1 active:shadow-none disabled:opacity-35"
            >
              {event.text}
            </button>
          );
        })}
      </div>

      <div className="min-h-7 text-center" aria-live="polite" aria-atomic="true">
        {feedback && <p className="font-display text-lg text-ink">{feedback}</p>}
      </div>

      <PlayerControls>
        <Button
          variant="soft"
          size="md"
          onClick={() => {
            setOrderedEventIds([]);
            setFeedback(null);
          }}
          disabled={orderedEventIds.length === 0}
          aria-label="Start event order over"
        >
          <ArrowCounterClockwiseIcon weight="bold" aria-hidden="true" />
          Start over
        </Button>
        <Button
          variant="primary"
          size="kid"
          onClick={checkOrder}
          disabled={orderedEventIds.length !== events.length}
        >
          Check event order
        </Button>
      </PlayerControls>
    </div>
  );
}

function FreeRetellPanel({
  prompt,
  speech,
  onContinue,
}: {
  prompt: string;
  speech: ReturnType<typeof useSpeech>;
  onContinue: () => void;
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
          Tell it out loud to someone near you. This invitation is not scored or recorded.
        </p>
      </div>
      <div className="flex justify-center">
        <Button variant="soft" size="kid" onClick={onContinue}>
          Continue
          <ArrowRightIcon weight="bold" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
