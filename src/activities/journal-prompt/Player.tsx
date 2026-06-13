"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EraserIcon } from "@phosphor-icons/react/dist/ssr";
import type { JournalPromptConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { Button } from "@/components/ui/Button";
import { Prompt } from "../_shared/ActivityChrome";
import { RewardOverlay } from "../_shared/RewardOverlay";
import { useSpeech } from "../_shared/useSpeech";
import { schema, score, type JournalPromptResponse } from "./logic";

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

  useEffect(() => {
    if (parsed.drawing) setupCanvas();
  }, [parsed.drawing, setupCanvas]);

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
      drawingDataUrl:
        parsed.drawing && didDraw ? canvasRef.current?.toDataURL("image/png") : undefined,
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

  return (
    <div className="grid gap-6">
      <Prompt speech={speech} instruction={parsed.prompt} />

      {parsed.drawing && (
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
          className="min-h-16 rounded-xl border-[3px] border-ink bg-paper px-4 font-display text-2xl text-ink shadow-pop outline-none"
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
