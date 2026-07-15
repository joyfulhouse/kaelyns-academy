"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { EraserIcon, MicrophoneIcon, StopIcon } from "@phosphor-icons/react/dist/ssr";
import type { JournalPromptConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { Prompt } from "../_shared/ActivityChrome";
import { useActivity } from "../_shared/useActivity";
import { useReducedMotion } from "../_shared/useReducedMotion";
import { useSpeakOnce } from "../_shared/useSpeakOnce";
import { useSpeech } from "../_shared/useSpeech";
import { schema, type JournalPromptResponse } from "./logic";
import {
  applyManualJournalText,
  contributedTextLength,
  createJournalTextState,
  firstBlankRange,
  insertJournalText,
  type JournalTextState,
  MAX_JOURNAL_MARKS,
  MAX_JOURNAL_TEXT_LENGTH,
  qualifiesForJournalCompletion,
  recognizedPhrase,
  usedDictation,
} from "./state";
import { useDictation } from "./useDictation";

type ParsedJournalConfig = ReturnType<typeof schema.parse>;
type ResponseMode = JournalPromptResponse["mode"];
type WritingMode = Extract<ResponseMode, "scribe" | "type">;

const CANVAS_W = 640;
const CANVAS_H = 380;
const INK = "oklch(0.26 0.02 60)";

export function JournalPromptPlayer({
  config,
  onComplete,
  learnerContext,
}: ActivityPlayerProps<JournalPromptConfig, JournalPromptResponse>) {
  const parsed = useActivity(schema, config);
  const speech = useSpeech();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // Per-character provenance stays in memory so frames remain scaffolds while
  // manual, word-bank, and dictated additions count as learner contribution.
  const [textState, setTextState] = useState<JournalTextState>(() =>
    createJournalTextState(),
  );
  const textStateRef = useRef(textState);
  const [markCount, setMarkCount] = useState(0);
  const [responseMode, setResponseMode] = useState<ResponseMode>(() =>
    parsed.mode === "draw" ? "draw" : initialWritingMode(parsed),
  );

  useSpeakOnce(speech.speak, parsed.prompt);

  const showCanvas = parsed.mode !== "compose" && parsed.drawing;
  const text = textState.text;
  const textLength = contributedTextLength(textState);
  const dictatedTextRemains = usedDictation(textState);
  const canFinish = qualifiesForJournalCompletion({
    markCount,
    textLength,
    usedDictation: dictatedTextRemains,
  });

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = CANVAS_W * dpr;
    canvas.height = CANVAS_H * dpr;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(dpr, dpr);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 6;
    context.strokeStyle = INK;
    context.fillStyle = INK;
  }, []);

  useEffect(() => {
    if (showCanvas) setupCanvas();
    const canvas = canvasRef.current;
    return () => {
      clearCanvasPixels(canvas);
      drawingRef.current = false;
      lastPointRef.current = null;
    };
  }, [setupCanvas, showCanvas]);

  function pointFromEvent(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((event.clientY - rect.top) / rect.height) * CANVAS_H,
    };
  }

  function startDraw(event: React.PointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const point = pointFromEvent(event);
    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    lastPointRef.current = point;

    // A down/up tap is a real visible mark, not a zero-length invisible path.
    context.beginPath();
    context.arc(point.x, point.y, 3, 0, Math.PI * 2);
    context.fill();
    setMarkCount((current) => Math.min(current + 1, MAX_JOURNAL_MARKS));
    setResponseMode("draw");
  }

  function moveDraw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const context = canvasRef.current?.getContext("2d");
    const lastPoint = lastPointRef.current;
    if (!context || !lastPoint) return;
    const point = pointFromEvent(event);
    context.beginPath();
    context.moveTo(lastPoint.x, lastPoint.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    lastPointRef.current = point;
  }

  function endDraw(event: React.PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = false;
    lastPointRef.current = null;
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }

  function clearDrawing() {
    clearCanvasPixels(canvasRef.current);
    drawingRef.current = false;
    lastPointRef.current = null;
    setMarkCount(0);
    setResponseMode(textLength > 0 ? "type" : initialResponseMode(parsed));
  }

  function commitTextState(next: JournalTextState, mode: WritingMode | "dictate") {
    textStateRef.current = next;
    setTextState(next);
    if (contributedTextLength(next) === 0) {
      setResponseMode(markCount > 0 ? "draw" : initialResponseMode(parsed));
      return;
    }
    setResponseMode(mode);
  }

  function changeText(next: string, mode: WritingMode | "dictate") {
    commitTextState(applyManualJournalText(textStateRef.current, next), mode);
  }

  function clearIdea() {
    const empty = createJournalTextState();
    textStateRef.current = empty;
    setTextState(empty);
    setResponseMode(markCount > 0 ? "draw" : initialResponseMode(parsed));
  }

  function finish() {
    if (!canFinish) return;
    const mode = textLength > 0 ? responseMode : "draw";
    const response: JournalPromptResponse = {
      markCount,
      textLength,
      usedDictation: dictatedTextRemains,
      mode,
      didDraw: markCount > 0,
    };

    // Child-created pixels and words are intentionally ephemeral.
    clearCanvasPixels(canvasRef.current);
    drawingRef.current = false;
    lastPointRef.current = null;
    const empty = createJournalTextState();
    textStateRef.current = empty;
    setTextState(empty);
    setMarkCount(0);
    onComplete(response);
  }

  if (parsed.mode === "compose") {
    return (
      <ComposeView
        config={parsed}
        textState={textState}
        getTextState={() => textStateRef.current}
        onChangeText={changeText}
        onCommitText={commitTextState}
        onClearText={clearIdea}
        speech={speech}
        micAllowed={learnerContext?.oralReading === true}
        canFinish={canFinish}
        onFinish={finish}
      />
    );
  }

  return (
    <div className="grid gap-6">
      <Prompt speech={speech} instruction={parsed.prompt} />

      {showCanvas && (
        <section aria-labelledby="journal-drawing-title" className="grid gap-2">
          <h2 id="journal-drawing-title" className="font-display text-lg text-ink">
            Your drawing
          </h2>
          <canvas
            ref={canvasRef}
            role="img"
            aria-label="Drawing area. Make marks with your finger, pointer, or stylus."
            className="aspect-[640/380] w-full touch-none rounded-2xl border-[3px] border-ink bg-paper-raised shadow-pop"
            style={{ maxWidth: CANVAS_W }}
            onPointerDown={startDraw}
            onPointerMove={moveDraw}
            onPointerUp={endDraw}
            onPointerCancel={endDraw}
            onPointerLeave={endDraw}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-ink-soft" aria-live="polite">
              {markCount === 0 ? "No marks yet" : `${markCount} ${markCount === 1 ? "mark" : "marks"}`}
            </p>
            <Button variant="soft" size="md" onClick={clearDrawing} disabled={markCount === 0}>
              <EraserIcon weight="bold" aria-hidden="true" />
              Clear drawing
            </Button>
          </div>
        </section>
      )}

      <section aria-labelledby="journal-words-title" className="grid gap-2">
        <h2 id="journal-words-title" className="text-sm font-medium text-ink-soft">
          {parsed.sentenceStarter ? "Finish the sentence" : "Add words if you want"}
        </h2>
        {parsed.sentenceStarter && (
          <p className="rounded-xl border-2 border-dashed border-ink/25 bg-paper-sunk px-4 py-3 font-display text-xl text-ink">
            {parsed.sentenceStarter}
          </p>
        )}
        <input
          id="journal-text"
          type="text"
          value={text}
          onChange={(event) => changeText(event.target.value, "type")}
          maxLength={MAX_JOURNAL_TEXT_LENGTH}
          autoComplete="off"
          aria-label={parsed.sentenceStarter ? `Your words after ${parsed.sentenceStarter}` : "Your words"}
          placeholder={parsed.sentenceStarter ? "Add your words…" : "Write one idea…"}
          className="min-h-16 rounded-xl border-[3px] border-ink bg-paper px-4 font-display text-2xl text-ink shadow-pop placeholder:text-ink-faint"
        />
        <div className="flex justify-end">
          <Button variant="soft" size="md" onClick={clearIdea} disabled={textLength === 0}>
            Clear words
          </Button>
        </div>
      </section>

      <div className="grid justify-items-center gap-2">
        <Button variant="primary" size="kid" onClick={finish} disabled={!canFinish}>
          I&apos;m done
        </Button>
        {!canFinish && (
          <p className="text-sm text-ink-soft" role="status">
            Make one mark or add a few words first.
          </p>
        )}
      </div>
    </div>
  );
}

function ComposeView({
  config,
  textState,
  getTextState,
  onChangeText,
  onCommitText,
  onClearText,
  speech,
  micAllowed,
  canFinish,
  onFinish,
}: {
  config: ParsedJournalConfig;
  textState: JournalTextState;
  getTextState: () => JournalTextState;
  onChangeText: (next: string, mode: WritingMode | "dictate") => void;
  onCommitText: (next: JournalTextState, mode: WritingMode | "dictate") => void;
  onClearText: () => void;
  speech: ReturnType<typeof useSpeech>;
  micAllowed: boolean;
  canFinish: boolean;
  onFinish: () => void;
}) {
  const text = textState.text;
  const reduced = useReducedMotion();
  const dictation = useDictation();
  const abortDictation = dictation.abort;
  const micAllowedRef = useRef(micAllowed);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const allowedWritingModes = config.allowModes.filter(isWritingMode);
  const [writingMode, setWritingMode] = useState<WritingMode>(() => initialWritingMode(config));
  const dictationConfigured = config.allowModes.includes("dictate");
  const allowsDictation = micAllowed && config.allowModes.includes("dictate");
  const calmFallback =
    dictationConfigured &&
    (!micAllowed || !dictation.supported || dictation.message !== null);
  const canUseTextSurface = allowedWritingModes.length > 0 || calmFallback;

  useEffect(() => {
    micAllowedRef.current = micAllowed;
    if (!micAllowed) abortDictation();
  }, [abortDictation, micAllowed]);

  function restoreSelection(selectionStart: number, selectionEnd: number) {
    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(selectionStart, selectionEnd);
    });
  }

  function insertChunk(chunk: string, preferBlank: boolean) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? text.length;
    const end = textarea?.selectionEnd ?? start;
    const result = insertJournalText(
      currentTextState(),
      chunk,
      start,
      end,
      "word-bank",
      preferBlank,
    );
    onCommitText(result.state, writingMode);
    restoreSelection(result.selectionStart, result.selectionEnd);
  }

  function insertFrame(frame: string) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? text.length;
    const end = textarea?.selectionEnd ?? start;
    const result = insertJournalText(
      currentTextState(),
      frame,
      start,
      end,
      "scaffold",
    );
    onCommitText(result.state, writingMode);
    const blank = firstBlankRange(result.state.text);
    restoreSelection(blank?.start ?? result.selectionStart, blank?.end ?? result.selectionEnd);
  }

  function toggleDictation() {
    if (dictation.listening) {
      dictation.stop();
      return;
    }
    dictation.start((rawPhrase) => {
      if (!micAllowedRef.current) return;
      const phrase = recognizedPhrase(rawPhrase);
      if (!phrase) return;
      const textarea = textareaRef.current;
      // Read from the live field, not the callback's old render, so recognition
      // can never overwrite words typed while the microphone was listening.
      const latestText = textarea?.value ?? text;
      const start = textarea?.selectionStart ?? latestText.length;
      const end = textarea?.selectionEnd ?? start;
      const current = currentTextState();
      const result = insertJournalText(current, phrase, start, end, "dictation");
      if (result.state.text === latestText) return;
      onCommitText(result.state, "dictate");
      restoreSelection(result.selectionStart, result.selectionEnd);
    });
  }

  function currentTextState(): JournalTextState {
    const current = getTextState();
    const liveText = textareaRef.current?.value;
    return liveText !== undefined && liveText !== current.text
      ? applyManualJournalText(current, liveText)
      : current;
  }

  function clearText() {
    dictation.stop();
    onClearText();
    restoreSelection(0, 0);
  }

  return (
    <div className="grid gap-6">
      <Prompt speech={speech} instruction={config.prompt} />

      {allowedWritingModes.length > 1 && (
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium text-ink-soft">Who will put the idea into words?</legend>
          <div className="flex flex-wrap gap-2">
            {allowedWritingModes.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setWritingMode(mode)}
                aria-pressed={writingMode === mode}
                className={cn(
                  "min-h-11 rounded-pill border-[3px] border-ink px-5 py-2 font-semibold text-ink shadow-pop",
                  writingMode === mode ? "bg-honey" : "bg-paper-raised",
                )}
              >
                {mode === "type" ? "I will type" : "A grown-up will write"}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {config.frames.length > 0 && (
        <section aria-labelledby="journal-frames-title" className="grid gap-2">
          <h2 id="journal-frames-title" className="text-sm font-medium text-ink-soft">
            Sentence starters you can use
          </h2>
          <ul className="grid gap-2">
            {config.frames.map((frame, index) => (
              <li key={`${frame}-${index}`}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertFrame(frame)}
                  className={cn(
                    "min-h-14 w-full rounded-2xl border-[3px] border-dashed border-ink/35 bg-paper-raised px-4 py-3 text-left",
                    "font-display text-xl text-ink transition duration-200 ease-out hover:border-ink/60 active:translate-y-px",
                  )}
                >
                  {frame}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {config.wordBank.length > 0 && (
        <section aria-labelledby="journal-word-bank-title" className="grid gap-2">
          <h2 id="journal-word-bank-title" className="text-sm font-medium text-ink-soft">
            Word bank
          </h2>
          <div className="flex flex-wrap gap-2">
            {config.wordBank.map((word, index) => (
              <button
                key={`${word}-${index}`}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertChunk(word, true)}
                aria-label={`Add ${word} at the caret or next blank`}
                className={cn(
                  "min-h-12 rounded-pill border-[3px] border-ink bg-honey px-5 py-2 font-display text-lg text-ink shadow-pop",
                  "transition duration-200 ease-out hover:-translate-y-0.5 active:translate-y-1 active:shadow-none",
                )}
              >
                {word}
              </button>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="journal-compose-title" className="grid gap-2">
        <h2 id="journal-compose-title" className="text-sm font-medium text-ink-soft">
          {writingMode === "type" ? "Write your idea" : "A grown-up can write your idea here"}
        </h2>
        <textarea
          id="journal-compose"
          ref={textareaRef}
          aria-labelledby="journal-compose-title"
          value={text}
          onChange={(event) => onChangeText(event.target.value, writingMode)}
          rows={5}
          maxLength={MAX_JOURNAL_TEXT_LENGTH}
          autoComplete="off"
          readOnly={!canUseTextSurface}
          placeholder="Start with one idea. Then add more."
          className="min-h-40 resize-y rounded-2xl border-[3px] border-ink bg-paper px-4 py-3 font-body text-xl leading-relaxed text-ink shadow-pop placeholder:text-ink-faint"
        />
        <div className="flex justify-end">
          <Button
            variant="soft"
            size="md"
            onClick={clearText}
            disabled={text.length === 0}
          >
            Clear idea
          </Button>
        </div>
      </section>

      {allowsDictation && (
        <section aria-labelledby="journal-dictation-title" className="grid justify-items-center gap-2">
          <h2 id="journal-dictation-title" className="sr-only">
            Talk to write
          </h2>
          {dictation.supported ? (
            <motion.button
              type="button"
              onClick={toggleDictation}
              aria-pressed={dictation.listening}
              aria-label={dictation.listening ? "Stop talking" : "Talk to write"}
              whileTap={reduced ? undefined : { scale: 0.96 }}
              className={cn(
                "grid size-20 place-items-center rounded-2xl border-[3px] border-ink shadow-pop transition duration-200 ease-out",
                dictation.listening ? "bg-coral text-on-accent" : "bg-honey text-ink",
                "hover:-translate-y-0.5 active:translate-y-1 active:shadow-none",
              )}
            >
              {dictation.listening ? (
                <StopIcon size={36} weight="fill" aria-hidden="true" />
              ) : (
                <MicrophoneIcon size={36} weight="fill" aria-hidden="true" />
              )}
            </motion.button>
          ) : null}
          <p className="text-center text-sm text-ink-soft" role="status" aria-live="polite">
            {dictation.message ??
              (dictation.supported
                ? dictation.listening
                  ? "Listening. Say your idea."
                  : "Talk to write"
                : "The microphone is not available here. You can type or ask a grown-up to write.")}
          </p>
        </section>
      )}

      {dictationConfigured && !micAllowed && (
        <p className="text-center text-sm text-ink-soft" role="status">
          Talk to write is off. You can type or ask a grown-up to write.
        </p>
      )}

      <div className="grid justify-items-center gap-2">
        <Button variant="primary" size="kid" onClick={onFinish} disabled={!canFinish}>
          I&apos;m done
        </Button>
        {!canFinish && (
          <p className="text-sm text-ink-soft" role="status">
            Add one idea before you finish.
          </p>
        )}
      </div>
    </div>
  );
}

function isWritingMode(mode: "scribe" | "type" | "dictate"): mode is WritingMode {
  return mode === "scribe" || mode === "type";
}

function initialWritingMode(config: ParsedJournalConfig): WritingMode {
  if (config.allowModes.includes("type")) return "type";
  if (config.allowModes.includes("scribe")) return "scribe";
  return "type";
}

function initialResponseMode(config: ParsedJournalConfig): ResponseMode {
  return config.mode === "draw" ? "draw" : initialWritingMode(config);
}

function clearCanvasPixels(canvas: HTMLCanvasElement | null) {
  const context = canvas?.getContext("2d");
  if (!canvas || !context) return;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.restore();
}
