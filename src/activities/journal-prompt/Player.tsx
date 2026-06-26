"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { EraserIcon, MicrophoneIcon, StopIcon } from "@phosphor-icons/react/dist/ssr";
import type { JournalPromptConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Prompt, SpeakerButton } from "../_shared/ActivityChrome";
import { RewardOverlay } from "../_shared/RewardOverlay";
import { useReducedMotion } from "../_shared/useReducedMotion";
import { useSpeech } from "../_shared/useSpeech";
import { useDictation } from "./useDictation";
import { schema, score, type JournalPromptResponse } from "./logic";

/** The post-parse config: zod defaults (frames, wordBank, allowModes, mode) are
 *  all resolved, so they are never undefined inside the Player. */
type ParsedJournalConfig = ReturnType<typeof schema.parse>;

const CANVAS_W = 640;
const CANVAS_H = 380;
const INK = "oklch(0.26 0.02 60)"; // matches --ink; canvas can't read CSS vars directly

export function JournalPromptPlayer({
  config,
  onComplete,
}: ActivityPlayerProps<JournalPromptConfig, JournalPromptResponse>) {
  const parsed = useMemo(() => schema.parse(config), [config]);
  const speech = useSpeech();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const didDrawRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [text, setText] = useState(parsed.sentenceStarter ?? "");
  const [done, setDone] = useState<JournalPromptResponse | null>(null);

  const spokenRef = useRef(false);
  useEffect(() => {
    if (spokenRef.current) return;
    spokenRef.current = true;
    speech.speak(parsed.prompt);
  }, [parsed.prompt, speech]);

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    canvas.width = CANVAS_W * dpr;
    canvas.height = CANVAS_H * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 6;
    ctx.strokeStyle = INK;
  }, []);

  // Draw-mode canvas only. Compose mode never mounts the canvas.
  const showCanvas = parsed.mode !== "compose" && parsed.drawing;
  useEffect(() => {
    if (showCanvas) setupCanvas();
  }, [showCanvas, setupCanvas]);

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
    canvasRef.current?.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    lastRef.current = pointFromEvent(event);
  }

  function moveDraw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    const last = lastRef.current;
    if (!ctx || !last) return;
    const point = pointFromEvent(event);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastRef.current = point;
    didDrawRef.current = true;
  }

  function endDraw(event: React.PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = false;
    lastRef.current = null;
    canvasRef.current?.releasePointerCapture(event.pointerId);
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    didDrawRef.current = false;
  }

  // Build the response in the event handler (refs are safe here, not in render).
  function finish() {
    const trimmed = text.trim();
    const starter = (parsed.sentenceStarter ?? "").trim();
    const wroteSomething = trimmed.length > 0 && trimmed !== starter;
    const didDraw = didDrawRef.current;
    setDone({
      text: wroteSomething ? trimmed : "",
      didDraw,
      drawingDataUrl: showCanvas && didDraw ? canvasRef.current?.toDataURL("image/png") : undefined,
    });
  }

  if (done) {
    return (
      <RewardOverlay
        stars={3}
        message="You made something today."
        onContinue={() => onComplete(done, score(parsed, done))}
        continueLabel="All done"
      />
    );
  }

  // Compose mode: the writing bridge (type, scribe, dictate) — no canvas.
  if (parsed.mode === "compose") {
    return (
      <ComposeView
        config={parsed}
        text={text}
        onChangeText={setText}
        speech={speech}
        onFinish={finish}
      />
    );
  }

  // Draw mode (default): unchanged behavior — doodle + finish a sentence.
  return (
    <div className="grid gap-6">
      <Prompt speech={speech} instruction={parsed.prompt} />

      {showCanvas && (
        <div className="grid gap-2">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label="Drawing area. Use your finger or mouse to draw."
            className="aspect-[640/380] w-full touch-none rounded-2xl border-[3px] border-ink bg-paper-raised shadow-pop"
            style={{ maxWidth: CANVAS_W }}
            onPointerDown={startDraw}
            onPointerMove={moveDraw}
            onPointerUp={endDraw}
            onPointerLeave={endDraw}
          />
          <div className="flex justify-end">
            <Button variant="soft" size="sm" onClick={clearCanvas}>
              <EraserIcon weight="bold" aria-hidden="true" />
              Clear drawing
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-2">
        <label htmlFor="journal-text" className="text-sm font-medium text-ink-soft">
          {parsed.sentenceStarter ? "Finish the sentence" : "Write about it"}
        </label>
        <input
          id="journal-text"
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          autoComplete="off"
          className="min-h-16 rounded-xl border-[3px] border-ink bg-paper px-4 font-display text-2xl text-ink shadow-pop"
        />
      </div>

      <div className="flex justify-center">
        <Button variant="primary" size="kid" onClick={finish}>
          I&apos;m done
        </Button>
      </div>
    </div>
  );
}

/** Compose mode: prompt + optional sentence frames + a tappable word bank + a
 *  generous typing surface, plus a dictate button when recognition exists. The
 *  whole point is low transcription tax: ideas first, never graded. */
function ComposeView({
  config,
  text,
  onChangeText,
  speech,
  onFinish,
}: {
  config: ParsedJournalConfig;
  text: string;
  onChangeText: (next: string) => void;
  speech: ReturnType<typeof useSpeech>;
  onFinish: () => void;
}) {
  const reduced = useReducedMotion();
  const dictation = useDictation();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const modes = config.allowModes ?? ["type"];
  // "type" or "scribe" both surface the textarea (scribe = a grown-up types what
  // the child says). dictate adds the mic when the browser supports it.
  const canType = modes.includes("type") || modes.includes("scribe");
  const showDictate = modes.includes("dictate") && dictation.supported;

  // Append a chunk (word-bank tap or dictated phrase) with sensible spacing.
  const append = useCallback(
    (chunk: string) => {
      onChangeText(joinText(text, chunk));
      // Keep focus in the textarea so typing can continue immediately.
      window.requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [text, onChangeText],
  );

  function toggleDictation() {
    if (dictation.listening) {
      dictation.stop();
    } else {
      dictation.start((phrase) => onChangeText(joinText(text, phrase)));
    }
  }

  return (
    <div className="grid gap-6">
      <Prompt speech={speech} instruction={config.prompt} />

      {config.frames.length > 0 && (
        <div className="grid gap-2">
          <p className="text-sm font-medium text-ink-soft">Sentence starters you can use</p>
          <ul className="grid gap-2">
            {config.frames.map((frame, i) => (
              <li key={i} className="flex items-center gap-3">
                <SpeakerButton speech={speech} text={frame} label="Hear this sentence starter" />
                <button
                  type="button"
                  onClick={() => append(frame)}
                  className={cn(
                    "flex-1 rounded-2xl border-[3px] border-dashed border-ink/35 bg-paper-raised px-4 py-3 text-left",
                    "font-display text-xl text-ink transition duration-200 ease-out hover:border-ink/60 active:translate-y-px",
                  )}
                >
                  {frame}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {config.wordBank.length > 0 && (
        <div className="grid gap-2">
          <p className="text-sm font-medium text-ink-soft">Word bank (tap to add)</p>
          <div className="flex flex-wrap gap-2">
            {config.wordBank.map((word, i) => (
              <button
                key={`${word}-${i}`}
                type="button"
                onClick={() => append(word)}
                aria-label={`Add the word ${word}`}
                className={cn(
                  "min-h-12 rounded-pill border-[3px] border-ink bg-honey px-4 py-2 font-display text-lg text-ink shadow-pop",
                  "transition duration-200 ease-out hover:-translate-y-0.5 active:translate-y-1 active:shadow-none",
                )}
              >
                {word}
              </button>
            ))}
          </div>
        </div>
      )}

      {canType && (
        <div className="grid gap-2">
          <label htmlFor="journal-compose" className="text-sm font-medium text-ink-soft">
            {modes.includes("type") ? "Write your idea" : "A grown-up can write your idea here"}
          </label>
          <textarea
            id="journal-compose"
            ref={textareaRef}
            value={text}
            onChange={(event) => onChangeText(event.target.value)}
            rows={5}
            autoComplete="off"
            placeholder="Start with one idea. Then add more."
            className="min-h-40 resize-y rounded-2xl border-[3px] border-ink bg-paper px-4 py-3 font-body text-xl leading-relaxed text-ink shadow-pop placeholder:text-ink-faint"
          />
        </div>
      )}

      {showDictate && (
        <div className="flex flex-col items-center gap-2">
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
          <p className="text-sm text-ink-soft" aria-live="polite">
            {dictation.listening ? "Listening, say your idea" : "Talk to write"}
          </p>
        </div>
      )}

      <div className="flex justify-center">
        <Button variant="primary" size="kid" onClick={onFinish}>
          I&apos;m done
        </Button>
      </div>
    </div>
  );
}

/** Join existing text with a new chunk: trims, adds a single separating space,
 *  and avoids a leading space when the surface is empty. */
function joinText(existing: string, chunk: string): string {
  const left = existing.replace(/\s+$/, "");
  const right = chunk.trim();
  if (!right) return existing;
  if (!left) return right;
  return `${left} ${right}`;
}
