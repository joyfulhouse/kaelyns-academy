"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { browserHasMicrophone, supportedMimeType } from "@/activities/oral-reading/recording";
import {
  createJournalDictationForm,
  type DictationIdentity,
  JOURNAL_DICTATION_ENDPOINT,
  MAX_DICTATION_MS,
  parseDictationResponse,
} from "./dictation";

/**
 * The dictation half of the writing bridge (compose mode): the child speaks and
 * we transcribe the recording.
 *
 * §8 (child-data): the audio is captured with `MediaRecorder` and POSTed to the
 * same-origin, LiteLLM-backed {@link JOURNAL_DICTATION_ENDPOINT}. It is NEVER
 * routed through the browser Web Speech API, which streams open-ended child
 * speech to a browser vendor's cloud (Google/Apple) outside the gateway. When
 * the browser cannot record (no `MediaRecorder`/`getUserMedia`) or the activity
 * lacks an authored route identity, the hook reports `supported: false` and the
 * caller hides the affordance entirely — dictation is an enhancement, never
 * required.
 *
 * Lifecycle safety: every take carries a monotonic token. Any teardown —
 * `abort()` (consent revocation), a superseding `start()`, or unmount — bumps
 * the token AND aborts the in-flight upload, and every asynchronous
 * continuation (getUserMedia resolve, recorder stop, fetch result, state
 * updates) is discarded unless it still owns the current token. This is what
 * guarantees a pending permission grant can never start a hidden recording, and
 * a revoked take can never keep uploading a child's audio.
 */

export interface Dictation {
  /** True only when this browser can record AND the activity is authored (gateable). */
  supported: boolean;
  /** True while the mic is capturing or the take is being transcribed. */
  listening: boolean;
  /** Calm, child-facing fallback when recording or transcription cannot proceed. */
  message: string | null;
  /** Start a take; `onText` receives the transcribed phrase once it returns. */
  start: (onText: (text: string) => void) => void;
  /** Stop capturing now and transcribe what was said. */
  stop: () => void;
  /** Cancel the take without transcribing (for live consent revocation). */
  abort: () => void;
}

const MIC_BREAK_MESSAGE =
  "The microphone needs a break. Your words are safe, and you can keep typing.";
const NO_MIC_MESSAGE =
  "The microphone is not available here. You can type or ask a grown-up to write.";
// A generous ceiling on the transcription round-trip so a hung upload can never
// hold the mic-busy state (or a child's audio in flight) open indefinitely.
const TRANSCRIBE_TIMEOUT_MS = 20_000;

function subscribeStatic(): () => void {
  return () => {};
}

/** Recording support is static within a page (same pattern as useSpeech). */
function isRecordingSupported(identity: DictationIdentity | undefined): boolean {
  if (!identity?.unitKey || !identity.activityId) return false;
  return browserHasMicrophone();
}

export function useDictation(identity?: DictationIdentity): Dictation {
  const supported = useSyncExternalStore(
    subscribeStatic,
    () => isRecordingSupported(identity),
    () => false,
  );
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  // Latest identity for the async take, synced in an effect (never during render).
  const identityRef = useRef(identity);
  useEffect(() => {
    identityRef.current = identity;
  }, [identity]);
  // Monotonic take token: bumping it invalidates every earlier take's async work.
  const takeRef = useRef(0);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** End the current take: invalidate it, cancel any upload, free the mic. */
  const abort = useCallback(() => {
    takeRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // The take may already have ended between tap and abort.
      }
    }
    releaseStream();
    setListening(false);
  }, [releaseStream]);

  // Layout effect (not passive): tear down synchronously on unmount so no
  // recording/upload or `onText` insertion survives past the component.
  useLayoutEffect(() => abort, [abort]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      try {
        recorder.stop();
      } catch {
        // Already stopped between tap and stop; the stop handler still runs.
      }
    }
  }, []);

  const start = useCallback(
    (onText: (text: string) => void) => {
      const currentIdentity = identityRef.current;
      if (!isRecordingSupported(currentIdentity) || !currentIdentity) {
        setMessage(NO_MIC_MESSAGE);
        return;
      }
      const mimeType = supportedMimeType();
      if (!mimeType) {
        setMessage(NO_MIC_MESSAGE);
        return;
      }
      // Supersede any earlier take: invalidate it, cancel its upload, and stop
      // its recorder/microphone before starting a new one.
      takeRef.current += 1;
      const take = takeRef.current;
      controllerRef.current?.abort();
      controllerRef.current = null;
      const priorRecorder = recorderRef.current;
      if (priorRecorder && priorRecorder.state !== "inactive") {
        try {
          priorRecorder.stop();
        } catch {
          // Already ended between takes.
        }
      }
      releaseStream();
      const isCurrent = () => take === takeRef.current;
      setMessage(null);

      void (async () => {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
          if (isCurrent()) {
            setMessage(MIC_BREAK_MESSAGE);
            setListening(false);
          }
          return;
        }
        // Aborted / superseded / unmounted while the permission prompt was open:
        // drop the stream without ever recording. This closes the "hidden
        // recording after teardown" hole.
        if (!isCurrent()) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const mediaStream = stream;
        streamRef.current = mediaStream;
        // Take-local auto-stop timer handle, cleared only by THIS take's cleanup.
        let localTimer: ReturnType<typeof setTimeout> | null = null;

        // Cleanup scoped to THIS take's stream/recorder/timer (by identity), so a
        // late handler from a superseded take can never free — or cancel the
        // auto-stop timer of — a newer take's recording.
        const finishTake = (recorder: MediaRecorder | null): void => {
          if (localTimer) {
            clearTimeout(localTimer);
            if (timerRef.current === localTimer) timerRef.current = null;
            localTimer = null;
          }
          mediaStream.getTracks().forEach((track) => track.stop());
          if (recorder && recorderRef.current === recorder) recorderRef.current = null;
          if (streamRef.current === mediaStream) streamRef.current = null;
        };

        let recorder: MediaRecorder;
        try {
          recorder = new MediaRecorder(mediaStream, { mimeType });
        } catch {
          finishTake(null);
          if (isCurrent()) {
            setMessage(MIC_BREAK_MESSAGE);
            setListening(false);
          }
          return;
        }
        recorderRef.current = recorder;
        const chunks: Blob[] = [];

        recorder.addEventListener("dataavailable", (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        });
        recorder.addEventListener(
          "stop",
          () => {
            const blob = new Blob(chunks, { type: recorder.mimeType });
            finishTake(recorder);
            if (!isCurrent()) return;
            setListening(false);
            if (blob.size === 0) return;
            void transcribe(blob, currentIdentity, onText, setMessage, isCurrent, controllerRef);
          },
          { once: true },
        );
        recorder.addEventListener(
          "error",
          () => {
            const own = isCurrent();
            // Invalidate this take so its own queued `stop` event can never
            // transcribe partial audio from a recorder that just failed.
            if (own) takeRef.current += 1;
            finishTake(recorder);
            if (own) {
              setListening(false);
              setMessage(MIC_BREAK_MESSAGE);
            }
          },
          { once: true },
        );

        try {
          recorder.start();
        } catch {
          finishTake(recorder);
          if (isCurrent()) {
            setMessage(MIC_BREAK_MESSAGE);
            setListening(false);
          }
          return;
        }
        setListening(true);
        localTimer = setTimeout(() => {
          if (recorder.state === "recording") recorder.stop();
        }, MAX_DICTATION_MS);
        timerRef.current = localTimer;
      })();
    },
    [releaseStream],
  );

  return { supported, listening, message, start, stop, abort };
}

/**
 * POST one recorded take to the LiteLLM-backed route and hand the bounded
 * transcript to the caller. The upload is bound to an `AbortController` (shared
 * via `controllerRef`) so `abort()`/supersession/unmount cancel the child-audio
 * upload in flight, and a hard timeout stops a hung request from holding it
 * open. Every continuation re-checks the take token; raw audio is never
 * retained here (the caller freed the stream before this runs).
 */
async function transcribe(
  blob: Blob,
  identity: DictationIdentity,
  onText: (text: string) => void,
  setMessage: (message: string | null) => void,
  isCurrent: () => boolean,
  controllerRef: { current: AbortController | null },
): Promise<void> {
  const form = createJournalDictationForm(blob, identity);
  if (!form) return;
  const controller = new AbortController();
  controllerRef.current = controller;
  const timeout = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);
  try {
    const response = await fetch(JOURNAL_DICTATION_ENDPOINT, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    if (!isCurrent()) return;
    if (!response.ok) {
      setMessage(MIC_BREAK_MESSAGE);
      return;
    }
    const text = parseDictationResponse(await response.json());
    if (isCurrent() && text) onText(text);
  } catch {
    // An abort (consent revocation / supersession / unmount) lands here too —
    // stay silent unless this is still the live take failing on its own.
    if (isCurrent()) setMessage(MIC_BREAK_MESSAGE);
  } finally {
    clearTimeout(timeout);
    if (controllerRef.current === controller) controllerRef.current = null;
  }
}
