"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  MicrophoneIcon,
  StopCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import type {
  OralReadingConfig,
  OralReadingWordConfig,
} from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { cn } from "@/lib/cn";
import { useActivity } from "../_shared/useActivity";
import { useSpeech } from "../_shared/useSpeech";
import { schema, type OralReadingResponse } from "./logic";
import { ModeledAudioFallback, OralModelStep } from "./ModelStep";
import { OralSupportPanel } from "./OralSupportPanel";
import { SentenceReader } from "./SentenceReader";
import {
  MAX_RECORDING_MS,
  MIC_CLASSES,
  VERIFY_TIMEOUT_MS,
  browserHasMicrophone,
  canRecordAnother,
  canStartOralAttempt,
  canSubmitRecording,
  createOralReadingRequestForm,
  isModelPlaybackLocked,
  parseWordRouteResult,
  phaseAfterUnmatched,
  needsAdultModelFallback,
  shouldCompleteAfterObservation,
  subscribeStatic,
  supportedMimeType,
  stopModelAudioBeforeRecording,
  type OralReadingPhase,
  type VerifiedWordRouteResult,
  type VerificationResult,
} from "./recording";

export function OralReadingPlayer({
  config,
  onComplete,
  learnerContext,
}: ActivityPlayerProps<OralReadingConfig, OralReadingResponse>) {
  const parsed = useActivity(schema, config);
  if (parsed.mode === "sentence") {
    return (
      <SentenceReader
        config={parsed}
        onComplete={onComplete}
        learnerContext={learnerContext}
      />
    );
  }

  return (
    <WordReadingPlayer
      config={parsed}
      onComplete={onComplete}
      learnerContext={learnerContext}
    />
  );
}

function WordReadingPlayer({
  config: parsed,
  onComplete,
  learnerContext,
}: ActivityPlayerProps<OralReadingWordConfig, OralReadingResponse>) {
  const speech = useSpeech();
  const micSupported = useSyncExternalStore(subscribeStatic, browserHasMicrophone, () => false);
  const micAllowed = learnerContext?.oralReading === true;
  const [phase, setPhase] = useState<OralReadingPhase>("ready");
  const [results, setResults] = useState<VerificationResult[]>([]);
  const [modelStatus, setModelStatus] = useState<
    "idle" | "playing" | "completed" | "unavailable"
  >("idle");
  // Counts every UPLOADED recording, including ones whose verification came
  // back "unavailable" — the attempt cap bounds recordings and STT calls, so
  // gateway failures must not grant extra tries around it.
  const [submitted, setSubmitted] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const modelRequestRef = useRef(0);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
      const recorder = recorderRef.current;
      if (recorder?.state === "recording") recorder.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const fallbackMode = !micAllowed || !micSupported || phase === "fallback";
  const readyForAttempt = canStartOralAttempt(
    parsed.presentation,
    modelStatus === "completed",
  );
  const adultModelFallback =
    needsAdultModelFallback(parsed.presentation, speech.supported) ||
    (parsed.presentation === "listen-repeat" && modelStatus === "unavailable");

  function response(status: OralReadingResponse["status"]): OralReadingResponse {
    return { attempts: results.length, results, status };
  }

  function completeFallback(): void {
    const completed = response("participated-unverified");
    onComplete(completed);
  }

  function playModel(): void {
    if (isModelPlaybackLocked(phase)) return;
    const requestId = modelRequestRef.current + 1;
    modelRequestRef.current = requestId;
    setModelStatus("playing");
    void speech.speak(parsed.target).then((outcome) => {
      if (!activeRef.current || modelRequestRef.current !== requestId) return;
      if (outcome === "completed") setModelStatus("completed");
      else if (outcome === "unavailable") setModelStatus("unavailable");
    });
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

    let routeResult: VerifiedWordRouteResult | "unavailable" = "unavailable";
    try {
      const apiResponse = await fetch("/api/oral-reading", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      if (apiResponse.ok) routeResult = parseWordRouteResult(await apiResponse.json());
    } catch {
      // Timeout, unmount abort, or network failure — all resolve to
      // "unavailable" and (when still mounted) the grown-up fallback below.
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
    if (shouldCompleteAfterObservation(parsed.presentation, routeResult.result)) {
      onComplete({
        attempts: nextResults.length,
        results: nextResults,
        status: "verified",
        verificationId: routeResult.verificationId,
      });
    } else {
      // `submitted` is read pre-increment here because this closure captured
      // it before setSubmitted queued the +1 for this upload.
      setPhase(phaseAfterUnmatched(submitted + 1));
    }
  }

  async function startListening(): Promise<void> {
    if (
      !micAllowed ||
      !micSupported ||
      !readyForAttempt ||
      !canRecordAnother(submitted) ||
      (phase !== "ready" && phase !== "unclear" && phase !== "fallback")
    ) {
      return;
    }
    stopModelAudioBeforeRecording(speech.cancel);
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
      }, MAX_RECORDING_MS);
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

  return (
    <div className="mx-auto grid max-w-2xl gap-8 text-center">
      <div className="grid gap-3">
        <p className="text-balance font-display text-xl text-ink sm:text-2xl">
          {parsed.instruction}
        </p>
        <div className="rounded-3xl border-[3px] border-ink bg-paper-raised px-6 py-10 shadow-pop">
          <p className="font-display text-5xl leading-tight text-ink sm:text-7xl">{parsed.target}</p>
        </div>
      </div>

      <OralModelStep
        presentation={parsed.presentation}
        speechSupported={speech.supported && modelStatus !== "unavailable"}
        modelStatus={modelStatus === "unavailable" ? "idle" : modelStatus}
        disabled={isModelPlaybackLocked(phase)}
        label={`Listen to the word ${parsed.target}`}
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
          title="I couldn't quite hear that"
          description="Listen again, try once more, or ask a grown-up to listen."
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
                    : parsed.presentation === "cold"
                      ? "Cold read: tap the microphone, then read"
                      : "Step 2: tap the microphone, then read"}
          </p>
        </div>
      )}
    </div>
  );
}
