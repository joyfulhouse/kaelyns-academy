"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  CheckCircleIcon,
  MicrophoneIcon,
  SpeakerHighIcon,
  StopCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { OralReadingSentenceConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { cn } from "@/lib/cn";
import { useReducedMotion } from "../_shared/useReducedMotion";
import { useSpeech, type SpeechController } from "../_shared/useSpeech";
import type { OralReadingResponse } from "./logic";
import { ModeledAudioFallback, OralModelStep } from "./ModelStep";
import { OralSupportPanel } from "./OralSupportPanel";
import {
  MIC_CLASSES,
  VERIFY_TIMEOUT_MS,
  browserHasMicrophone,
  canRecordAnother,
  canStartOralAttempt,
  canSubmitRecording,
  createOralReadingRequestForm,
  isOpaqueVerificationId,
  isModelPlaybackLocked,
  needsAdultModelFallback,
  phaseAfterUnmatched,
  sentenceRecordingMs,
  shouldCompleteAfterObservation,
  subscribeStatic,
  supportedMimeType,
  stopModelAudioBeforeRecording,
  type OralReadingPhase,
  type VerificationResult,
} from "./recording";

type SettledWord = { state: "correct" | "unclear" };
type VisualWordState = SettledWord["state"] | "active" | "neutral";

interface SentenceRouteResult {
  result: "matched" | "unclear";
  words: SettledWord[];
  wcpm?: number;
  verificationId: string;
}

const WORD_BASE_CLASSES =
  "inline-flex min-h-16 items-center justify-center gap-1 rounded-xl border-[3px] px-3 py-2 " +
  "font-body text-2xl font-semibold leading-snug transition-colors duration-200 sm:text-3xl";

/** Static map so Tailwind can discover every child-safe word state. */
export const SENTENCE_WORD_CLASSES: Record<VisualWordState, string> = {
  active:
    "border-accent-deep bg-honey/25 text-ink ring-4 ring-honey/70 underline decoration-accent-deep decoration-[3px] underline-offset-8",
  correct: "border-success bg-success/35 text-ink",
  unclear:
    "border-honey-deep bg-honey/45 text-ink shadow-pop hover:-translate-y-0.5 active:translate-y-1 active:shadow-none",
  neutral: "border-line-strong bg-paper-sunk text-ink",
};

export const LISTEN_WORD_DWELL_MS = 380;
export const SETTLE_WORD_STAGGER_MS = 120;

/**
 * Even-paced modeled-read cursor. It models authored narration only; it is
 * deliberately not driven by the child's microphone input.
 */
export function startListenWordSweep(
  wordCount: number,
  reducedMotion: boolean,
  onActiveWord: (activeWord: number | null) => void,
): () => void {
  const totalWords = Math.max(0, Math.floor(wordCount));
  if (reducedMotion || totalWords === 0) {
    onActiveWord(null);
    return () => {};
  }

  let active = true;
  let activeWord = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  onActiveWord(activeWord);

  const advance = (): void => {
    activeWord += 1;
    if (activeWord >= totalWords) {
      active = false;
      timer = null;
      onActiveWord(null);
      return;
    }
    onActiveWord(activeWord);
    timer = setTimeout(advance, LISTEN_WORD_DWELL_MS);
  };
  timer = setTimeout(advance, LISTEN_WORD_DWELL_MS);

  return () => {
    if (!active) return;
    active = false;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    onActiveWord(null);
  };
}

/**
 * Replace the current karaoke sweep and return cleanup owned by this request.
 * A superseded speech promise may settle after its replacement has started; its
 * cleanup is deliberately unable to clear the replacement's active word.
 */
export function startLatestListenWordSweep(
  slot: { current: (() => void) | null },
  wordCount: number,
  reducedMotion: boolean,
  onActiveWord: (activeWord: number | null) => void,
): () => void {
  slot.current?.();

  let stopSweep = (): void => {};
  const stopOwnedSweep = (): void => {
    stopSweep();
    if (slot.current === stopOwnedSweep) slot.current = null;
  };
  slot.current = stopOwnedSweep;
  stopSweep = startListenWordSweep(wordCount, reducedMotion, (activeWord) => {
    if (slot.current === stopOwnedSweep) onActiveWord(activeWord);
  });
  return stopOwnedSweep;
}

/** Reveal derived word states in authored order, never as a red/error state. */
export function startSettleWordReveal(
  wordCount: number,
  reducedMotion: boolean,
  onRevealCount: (revealedWordCount: number) => void,
  onComplete: () => void,
): () => void {
  const totalWords = Math.max(0, Math.floor(wordCount));
  if (totalWords === 0) {
    onRevealCount(0);
    onComplete();
    return () => {};
  }

  if (reducedMotion) {
    onRevealCount(totalWords);
    onComplete();
    return () => {};
  }

  let active = true;
  let revealedWordCount = 1;
  let timer: ReturnType<typeof setTimeout> | null = null;
  onRevealCount(revealedWordCount);

  const advance = (): void => {
    revealedWordCount += 1;
    onRevealCount(revealedWordCount);
    if (revealedWordCount >= totalWords) {
      active = false;
      timer = null;
      onComplete();
      return;
    }
    timer = setTimeout(advance, SETTLE_WORD_STAGGER_MS);
  };

  if (totalWords === 1) {
    active = false;
    onComplete();
  } else {
    timer = setTimeout(advance, SETTLE_WORD_STAGGER_MS);
  }

  return () => {
    if (!active) return;
    active = false;
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
}

export function sentenceWordVisualState(
  index: number,
  activeWord: number | null,
  settled: SettledWord[] | undefined,
  revealedWordCount: number,
): VisualWordState {
  if (settled && index < revealedWordCount) return settled[index]?.state ?? "neutral";
  return index === activeWord ? "active" : "neutral";
}

export function splitPassageWords(passage: string): string[] {
  const trimmed = passage.trim();
  return trimmed ? trimmed.split(/\s+/) : [];
}

export function parseSentenceRouteResult(
  value: unknown,
  expectedWords: number,
): SentenceRouteResult | "unavailable" {
  if (!value || typeof value !== "object") return "unavailable";
  const candidate = value as {
    result?: unknown;
    words?: unknown;
    wcpm?: unknown;
    verificationId?: unknown;
  };
  if (candidate.result !== "matched" && candidate.result !== "unclear") return "unavailable";
  if (!isOpaqueVerificationId(candidate.verificationId)) return "unavailable";
  if (!Array.isArray(candidate.words) || candidate.words.length !== expectedWords) {
    return "unavailable";
  }
  const words: SettledWord[] = [];
  for (const entry of candidate.words) {
    if (!entry || typeof entry !== "object") return "unavailable";
    const state = (entry as { state?: unknown }).state;
    if (state !== "correct" && state !== "unclear") return "unavailable";
    words.push({ state });
  }
  if (candidate.result === "matched" && words.some(({ state }) => state !== "correct")) {
    return "unavailable";
  }
  if (
    candidate.wcpm !== undefined &&
    (typeof candidate.wcpm !== "number" ||
      !Number.isFinite(candidate.wcpm) ||
      candidate.wcpm < 0 ||
      candidate.wcpm > 300)
  ) {
    return "unavailable";
  }
  return candidate.wcpm === undefined
    ? { result: candidate.result, words, verificationId: candidate.verificationId }
    : {
        result: candidate.result,
        words,
        wcpm: candidate.wcpm,
        verificationId: candidate.verificationId,
      };
}

export function KaraokePassage({
  passage,
  activeWord,
  settled,
  revealedWordCount = 0,
  speech,
  playbackDisabled,
}: {
  passage: string;
  activeWord?: number | null;
  settled?: SettledWord[];
  revealedWordCount?: number;
  speech: SpeechController;
  playbackDisabled: boolean;
}) {
  return (
    <div
      className="flex flex-wrap justify-center gap-2 rounded-3xl border-[3px] border-ink bg-paper-raised px-5 py-8 shadow-pop"
      aria-label="Reading passage"
    >
      {splitPassageWords(passage).map((word, index) => {
        const state = sentenceWordVisualState(
          index,
          activeWord ?? null,
          settled,
          revealedWordCount,
        );
        if (state === "unclear") {
          return (
            <button
              key={`${index}-${word}`}
              type="button"
              data-word-state={state}
              aria-label={`Hear ${word}`}
              disabled={playbackDisabled}
              onClick={() => {
                if (playbackDisabled) return;
                void speech.speak(word);
              }}
              className={cn(
                WORD_BASE_CLASSES,
                SENTENCE_WORD_CLASSES[state],
                "disabled:pointer-events-none disabled:opacity-50",
              )}
            >
              {word}
              <SpeakerHighIcon className="size-6" weight="fill" aria-hidden="true" />
            </button>
          );
        }
        return (
          <span
            key={`${index}-${word}`}
            data-word-state={state}
            aria-label={`${word}, ${
              state === "correct"
                ? "read clearly"
                : state === "active"
                  ? "listen now"
                  : "upcoming"
            }`}
            className={cn(WORD_BASE_CLASSES, SENTENCE_WORD_CLASSES[state])}
          >
            {word}
            {state === "correct" && (
              <CheckCircleIcon className="size-6" weight="fill" aria-hidden="true" />
            )}
          </span>
        );
      })}
    </div>
  );
}

export function SentenceReader({
  config,
  onComplete,
  learnerContext,
}: ActivityPlayerProps<OralReadingSentenceConfig, OralReadingResponse>) {
  const speech = useSpeech();
  const reducedMotion = useReducedMotion();
  const passageWords = splitPassageWords(config.passage);
  const micSupported = useSyncExternalStore(subscribeStatic, browserHasMicrophone, () => false);
  const micAllowed = learnerContext?.oralReading === true;
  const [phase, setPhase] = useState<OralReadingPhase>("ready");
  const [results, setResults] = useState<VerificationResult[]>([]);
  const [modelStatus, setModelStatus] = useState<
    "idle" | "playing" | "completed" | "unavailable"
  >("idle");
  const [submitted, setSubmitted] = useState(0);
  const [feedback, setFeedback] = useState<SentenceRouteResult | null>(null);
  const [activeWord, setActiveWord] = useState<number | null>(null);
  const [revealedWordCount, setRevealedWordCount] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeRef = useRef(true);
  const listenSweepCancelRef = useRef<(() => void) | null>(null);
  const settleCancelRef = useRef<(() => void) | null>(null);
  const modelRequestRef = useRef(0);

  const cancelListenSweep = useCallback((): void => {
    listenSweepCancelRef.current?.();
    listenSweepCancelRef.current = null;
  }, []);

  const speakPassage = useCallback<SpeechController["speak"]>(
    (text, options) => {
      const stopOwnSweep = startLatestListenWordSweep(
        listenSweepCancelRef,
        passageWords.length,
        reducedMotion,
        (nextActiveWord) => {
          if (activeRef.current) setActiveWord(nextActiveWord);
        },
      );
      return speech.speak(text, options).then((outcome) => {
        stopOwnSweep();
        return outcome;
      });
    },
    [passageWords.length, reducedMotion, speech],
  );
  const karaokeSpeech = useMemo<SpeechController>(
    () => ({ ...speech, speak: speakPassage }),
    [speech, speakPassage],
  );
  const cancelSpeech = speech.cancel;

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      listenSweepCancelRef.current?.();
      settleCancelRef.current?.();
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
      const recorder = recorderRef.current;
      if (recorder?.state === "recording") recorder.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      cancelSpeech();
    };
  }, [cancelSpeech]);

  useEffect(() => {
    if (reducedMotion) cancelListenSweep();
  }, [cancelListenSweep, reducedMotion]);

  function response(
    resultValues: VerificationResult[],
    status: OralReadingResponse["status"],
    settled: SentenceRouteResult | null,
  ): OralReadingResponse {
    if (!settled || status === "participated-unverified") {
      return { attempts: resultValues.length, results: resultValues, status };
    }
    const correctCount = settled.words.filter(({ state }) => state === "correct").length;
    return {
      attempts: resultValues.length,
      results: resultValues,
      status,
      wcpm: settled.wcpm,
      perWord: settled.words,
      correctCount,
      totalWords: settled.words.length,
    };
  }

  function completeFallback(): void {
    const completed = response(results, "participated-unverified", feedback);
    onComplete(completed);
  }

  async function verify(blob: Blob, recordingFailed = false): Promise<void> {
    if (!canSubmitRecording(activeRef.current, blob.size, recordingFailed) || !learnerContext) {
      if (activeRef.current) setPhase("fallback");
      return;
    }

    const form = createOralReadingRequestForm(blob, learnerContext);
    if (!form) {
      setPhase("fallback");
      return;
    }

    setPhase("checking");
    setSubmitted((count) => count + 1);
    const controller = new AbortController();
    abortRef.current = controller;
    const deadline = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

    let routeResult: SentenceRouteResult | "unavailable" = "unavailable";
    try {
      const apiResponse = await fetch("/api/oral-reading", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      if (apiResponse.ok) {
        routeResult = parseSentenceRouteResult(await apiResponse.json(), passageWords.length);
      }
    } catch {
      routeResult = "unavailable";
    } finally {
      clearTimeout(deadline);
      abortRef.current = null;
    }

    if (!activeRef.current) return;
    if (routeResult === "unavailable") {
      setPhase("fallback");
      return;
    }

    const nextResults = [...results, routeResult.result];
    setResults(nextResults);
    const completed = {
      ...response(nextResults, "verified", routeResult),
      verificationId: routeResult.verificationId,
    };
    cancelListenSweep();
    settleCancelRef.current?.();
    setFeedback(routeResult);
    setRevealedWordCount(0);
    settleCancelRef.current = startSettleWordReveal(
      routeResult.words.length,
      reducedMotion,
      (nextRevealCount) => {
        if (activeRef.current) setRevealedWordCount(nextRevealCount);
      },
      () => {
        settleCancelRef.current = null;
        if (!activeRef.current) return;
        if (shouldCompleteAfterObservation(config.presentation, routeResult.result)) {
          onComplete(completed);
        } else {
          setPhase(phaseAfterUnmatched(submitted + 1));
        }
      },
    );
  }

  async function startListening(): Promise<void> {
    if (
      !micAllowed ||
      !micSupported ||
      !canStartOralAttempt(config.presentation, modelStatus === "completed") ||
      !canRecordAnother(submitted) ||
      (phase !== "ready" && phase !== "unclear" && phase !== "fallback")
    ) {
      return;
    }
    stopModelAudioBeforeRecording(speech.cancel, cancelListenSweep);
    setPhase("requesting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!activeRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const mimeType = supportedMimeType();
      if (!mimeType) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setPhase("fallback");
        return;
      }
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      const chunks: Blob[] = [];
      let recordingFailed = false;

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      });
      recorder.addEventListener(
        "stop",
        () => {
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = null;
          stream.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          recorderRef.current = null;
          void verify(new Blob(chunks, { type: recorder.mimeType }), recordingFailed);
        },
        { once: true },
      );
      recorder.addEventListener(
        "error",
        () => {
          recordingFailed = true;
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = null;
          stream.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          recorderRef.current = null;
          if (recorder.state === "recording") recorder.stop();
          if (activeRef.current) setPhase("fallback");
        },
        { once: true },
      );

      recorder.start();
      setPhase("listening");
      timerRef.current = setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, sentenceRecordingMs(passageWords.length));
    } catch {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      if (activeRef.current) setPhase("fallback");
    }
  }

  function stopListening(): void {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  }

  const fallbackMode = !micAllowed || !micSupported || phase === "fallback";
  const readyForAttempt = canStartOralAttempt(
    config.presentation,
    modelStatus === "completed",
  );
  const adultModelFallback =
    needsAdultModelFallback(config.presentation, speech.supported) ||
    (config.presentation === "listen-repeat" && modelStatus === "unavailable");

  function playModel(): void {
    if (isModelPlaybackLocked(phase)) return;
    const requestId = modelRequestRef.current + 1;
    modelRequestRef.current = requestId;
    setModelStatus("playing");
    void karaokeSpeech.speak(config.passage).then((outcome) => {
      if (!activeRef.current || modelRequestRef.current !== requestId) return;
      if (outcome === "completed") setModelStatus("completed");
      else if (outcome === "unavailable") setModelStatus("unavailable");
    });
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-7 text-center">
      <div className="grid gap-3">
        <p className="text-balance font-display text-xl text-ink sm:text-2xl">
          {config.instruction}
        </p>
        <KaraokePassage
          passage={config.passage}
          activeWord={activeWord}
          settled={feedback?.words}
          revealedWordCount={revealedWordCount}
          speech={speech}
          playbackDisabled={isModelPlaybackLocked(phase)}
        />
      </div>

      <OralModelStep
        presentation={config.presentation}
        speechSupported={speech.supported && modelStatus !== "unavailable"}
        modelStatus={modelStatus === "unavailable" ? "idle" : modelStatus}
        disabled={isModelPlaybackLocked(phase)}
        label="Listen to the sentence"
        onPlay={playModel}
      />

      {adultModelFallback ? (
        <ModeledAudioFallback onComplete={completeFallback} />
      ) : fallbackMode ? (
        <OralSupportPanel
          title="Read it to a grown-up."
          description="The microphone is optional. You can still finish this one."
          focusOnMount={phase === "fallback"}
          canRetry={micAllowed && micSupported && readyForAttempt && canRecordAnother(submitted)}
          onRetry={() => void startListening()}
          onComplete={completeFallback}
        />
      ) : phase === "unclear" ? (
        <OralSupportPanel
          title="Let's try the honey words once more"
          description="Tap a honey word to hear it, then read the sentence again."
          focusOnMount
          canRetry
          onRetry={() => void startListening()}
          onComplete={completeFallback}
        />
      ) : (
        <div className="grid place-items-center gap-4">
          <button
            type="button"
            onClick={phase === "listening" ? stopListening : () => void startListening()}
            disabled={!readyForAttempt || phase === "requesting" || phase === "checking"}
            aria-label={phase === "listening" ? "Stop listening" : "Read it aloud"}
            className={cn(
              "grid size-40 place-items-center rounded-full border-[4px] border-ink shadow-pop transition duration-200 ease-out",
              "hover:-translate-y-0.5 active:translate-y-1 active:shadow-none disabled:pointer-events-none",
              phase === "listening"
                ? MIC_CLASSES.listening
                : phase === "ready"
                  ? MIC_CLASSES.ready
                  : MIC_CLASSES.busy,
            )}
          >
            {phase === "listening" ? (
              <StopCircleIcon size={72} weight="fill" aria-hidden="true" />
            ) : (
              <MicrophoneIcon size={72} weight="fill" aria-hidden="true" />
            )}
          </button>
          <p className="font-display text-xl text-ink" role="status" aria-live="polite">
            {phase === "listening"
              ? "I'm listening"
              : phase === "checking"
                ? "Listening back…"
                : phase === "requesting"
                  ? "Getting the microphone…"
                  : !readyForAttempt
                    ? "Listen to the model first"
                    : config.presentation === "cold"
                      ? "Cold read: tap the microphone, then read"
                      : "Step 2: tap the microphone, then read"}
          </p>
        </div>
      )}
    </div>
  );
}
