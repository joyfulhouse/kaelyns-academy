"use client";

import { useState } from "react";
import { motion } from "motion/react";
import {
  ArrowCounterClockwiseIcon,
  BackspaceIcon,
  ArrowsLeftRightIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { MathTenframeConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { PlayerControls, Prompt, ProgressHint, SpeakerButton } from "../_shared/ActivityChrome";
import { useActivity } from "../_shared/useActivity";
import { useReducedMotion } from "../_shared/useReducedMotion";
import { useSpeakOnce } from "../_shared/useSpeakOnce";
import { useSpeech } from "../_shared/useSpeech";
import { useWrongShake } from "../_shared/useWrongShake";
import {
  canTradeFirstFrame,
  createTenframeState,
  occupiedCellIndices,
  representedTotal,
  toggleCounter,
  tradeFirstFrame,
  undoTenframeState,
  type CounterCell,
  type TenframeState,
} from "./model";
import {
  goalFor,
  isCorrect,
  schema,
  type MathTenframeResponse,
} from "./logic";

const CELLS_PER_FRAME = 10;
export const TEN_FRAME_GRID_CLASS = "grid-cols-5";

export function MathTenframePlayer({
  config,
  onComplete,
}: ActivityPlayerProps<MathTenframeConfig, MathTenframeResponse>) {
  const parsed = useActivity(schema, config);
  const speech = useSpeech();
  const reduced = useReducedMotion();
  const shake = useWrongShake();
  const [state, setState] = useState<TenframeState>(() => createTenframeState(parsed));
  const [history, setHistory] = useState<TenframeState[]>([]);
  const [attempts, setAttempts] = useState(0);

  useSpeakOnce(speech.speak, parsed.instruction);

  const total = representedTotal(state);
  const goal = goalFor(parsed);
  const canTrade = parsed.mode === "make-ten" && canTradeFirstFrame(state);
  const hasWork =
    state.placements.length > 0 || state.removals.length > 0 || state.tenTokens > 0;
  const canCheck = parsed.mode !== "make-ten" || state.tenTokens === 1;
  const suggestedCell = suggestedCellFor(parsed, state);

  function commit(next: TenframeState) {
    if (next === state) return;
    setHistory((current) => [...current, state].slice(-20));
    setState(next);
  }

  function toggleCell(index: number) {
    if (shake.wrong) return;
    const next = toggleCounter(parsed, state, index);
    if (next === state) return;
    commit(next);
    speech.speak(String(representedTotal(next)));
  }

  function undo() {
    if (shake.wrong) return;
    const undone = undoTenframeState(history, state);
    setHistory(undone.history);
    setState(undone.state);
    speech.speak(`Back to ${representedTotal(undone.state)}.`);
  }

  function clear() {
    if (shake.wrong || !hasWork) return;
    commit(createTenframeState(parsed));
    speech.speak("Start again from the given counters.");
  }

  function trade() {
    if (!canTrade || shake.wrong) return;
    const next = tradeFirstFrame(state);
    commit(next);
    speech.speak("Ten ones traded for one ten.");
  }

  function check() {
    if (!canCheck) return;
    const attemptCount = Math.min(attempts + 1, 20);
    setAttempts(attemptCount);
    const response = responseFor(parsed, state, attemptCount);
    if (isCorrect(parsed, response)) {
      onComplete(response);
      return;
    }

    shake.trigger({
      speak: () =>
        speech.speak(
          total > goal
            ? "Keep your counters. There are a few too many."
            : "Keep your counters. Try a few more.",
        ),
    });
  }

  return (
    <div className="grid gap-8">
      <Prompt speech={speech} instruction={parsed.instruction} />

      <OperationEquation config={parsed} />

      <motion.div
        className="grid justify-items-center gap-5 overflow-x-auto pb-1"
        {...shake.shakeProps(reduced)}
      >
        {state.tenTokens === 1 && (
          <div
            role="img"
            aria-label="One ten token"
            className="grid min-h-24 min-w-32 place-items-center rounded-2xl border-[3px] border-ink bg-honey px-6 font-display text-4xl text-ink shadow-pop"
          >
            10
          </div>
        )}

        <div className="flex min-w-max flex-wrap items-center justify-center gap-6">
          {Array.from({ length: parsed.frames }, (_, frame) =>
            parsed.mode === "make-ten" && frame === 0 && state.tenTokens === 1 ? (
              <TradedFrame key={frame} />
            ) : (
              <TenFrame
                key={frame}
                config={parsed}
                frame={frame}
                state={state}
                suggestedCell={suggestedCell}
                reduced={reduced}
                disabled={shake.wrong}
                onToggle={toggleCell}
              />
            ),
          )}
        </div>

        <ProgressHint>{progressText(parsed, state, total, goal)}</ProgressHint>
      </motion.div>

      <PlayerControls>
        <Button variant="soft" size="md" onClick={undo} disabled={history.length === 0 || shake.wrong}>
          <BackspaceIcon weight="bold" aria-hidden="true" />
          Undo
        </Button>
        <Button variant="soft" size="md" onClick={clear} disabled={!hasWork || shake.wrong}>
          <ArrowCounterClockwiseIcon weight="bold" aria-hidden="true" />
          Start over
        </Button>
        <SpeakerButton speech={speech} text={parsed.instruction} label="Hear what to do again" />
        {parsed.mode === "make-ten" && (
          <Button variant="honey" size="kid" onClick={trade} disabled={!canTrade || shake.wrong}>
            <ArrowsLeftRightIcon weight="bold" aria-hidden="true" />
            Trade for a ten
          </Button>
        )}
        <Button
          variant="primary"
          size="kid"
          onClick={check}
          disabled={!canCheck || shake.wrong}
        >
          Check it
        </Button>
      </PlayerControls>
    </div>
  );
}

function TenFrame({
  config,
  frame,
  state,
  suggestedCell,
  reduced,
  disabled,
  onToggle,
}: {
  config: MathTenframeConfig;
  frame: number;
  state: TenframeState;
  suggestedCell: number | null;
  reduced: boolean;
  disabled: boolean;
  onToggle: (index: number) => void;
}) {
  const offset = frame * CELLS_PER_FRAME;
  const frameCells = state.cells.slice(offset, offset + CELLS_PER_FRAME);
  const frameCount = frameCells.filter((cell) => cell !== null).length;

  return (
    <div
      role="group"
      aria-label={`Frame ${frame + 1}, ${frameCount} ${frameCount === 1 ? "counter" : "counters"}`}
      className={cn(
        "grid gap-0.5 rounded-2xl border-[3px] border-ink bg-paper-raised p-0 shadow-pop sm:gap-1",
        TEN_FRAME_GRID_CLASS,
      )}
    >
      {frameCells.map((cell, cellIndex) => {
        const index = offset + cellIndex;
        const next = toggleCounter(config, state, index);
        const permitted = next !== state;
        const isSuggested = suggestedCell === index;
        return (
          <button
            key={cellIndex}
            type="button"
            onClick={() => onToggle(index)}
            disabled={!permitted || disabled}
            aria-label={cellLabel(config, state, index, cell, permitted)}
            aria-pressed={cell !== null}
            className={cn(
              "grid size-16 place-items-center rounded-full border-2 transition duration-200 ease-out",
              cell === "preset"
                ? "border-ink bg-honey"
                : cell === "added"
                  ? "border-ink bg-accent"
                  : "border-dashed border-ink/25 bg-paper-sunk",
              permitted && "hover:border-ink/50 active:translate-y-0.5",
              isSuggested && "ring-4 ring-honey-deep/50 ring-offset-2 ring-offset-paper",
              "disabled:opacity-70",
            )}
          >
            {cell !== null && <CounterDot kind={cell} reduced={reduced} />}
          </button>
        );
      })}
    </div>
  );
}

function CounterDot({ kind, reduced }: { kind: Exclude<CounterCell, null>; reduced: boolean }) {
  return (
    <motion.span
      className={cn(
        "size-7 rounded-full sm:size-9",
        kind === "preset" ? "bg-honey-deep" : "bg-accent-deep",
      )}
      initial={reduced ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: reduced ? 0.001 : 0.24, ease: [0.16, 1, 0.3, 1] }}
    />
  );
}

function TradedFrame() {
  return (
    <div
      role="img"
      aria-label="First frame traded for one ten token"
      className="grid h-36 w-80 place-items-center rounded-2xl border-[3px] border-dashed border-ink/35 bg-paper-sunk px-5 text-center font-semibold text-ink-soft"
    >
      First frame traded
    </div>
  );
}

function OperationEquation({ config }: { config: MathTenframeConfig }) {
  if (config.mode === "represent") return null;
  const symbol = config.mode === "subtract" ? "−" : "+";
  const operand = config.mode === "subtract" ? config.subtrahend : config.addend;
  return (
    <p className="text-center font-display text-2xl text-ink" aria-hidden="true">
      {config.target} {symbol} {operand} = ?
    </p>
  );
}

function suggestedCellFor(config: MathTenframeConfig, state: TenframeState): number | null {
  if (config.mode === "subtract") {
    for (let index = config.target - 1; index >= 0; index -= 1) {
      if (state.cells[index] !== null) return index;
    }
    return null;
  }

  const start = config.mode === "make-ten" && state.tenTokens === 1 ? 10 : 0;
  const end = config.mode === "make-ten" && state.tenTokens === 0 ? 10 : state.cells.length;
  for (let index = start; index < end; index += 1) {
    if (state.cells[index] === null && toggleCounter(config, state, index) !== state) return index;
  }
  return null;
}

function cellLabel(
  config: MathTenframeConfig,
  state: TenframeState,
  index: number,
  cell: CounterCell,
  permitted: boolean,
): string {
  const number = index + 1;
  if (!permitted) {
    if (cell === "preset") return `Cell ${number}, starting counter`;
    if (config.mode === "make-ten" && state.tenTokens === 0 && index >= 10) {
      return `Cell ${number}, available after trading a full frame`;
    }
    return `Cell ${number}, unavailable`;
  }
  if (cell === "added") return `Cell ${number}, added counter, tap to remove`;
  if (cell === "preset") return `Cell ${number}, counter, tap to remove`;
  if (config.mode === "subtract") return `Cell ${number}, removed counter, tap to restore`;
  return `Cell ${number}, empty, tap to add`;
}

function progressText(
  config: MathTenframeConfig,
  state: TenframeState,
  total: number,
  goal: number,
): string {
  switch (config.mode) {
    case "represent":
      return `${total} counters shown. Goal: ${goal}.`;
    case "add":
      return `${state.placements.length} of ${config.addend} counters added. ${total} in all.`;
    case "subtract":
      return `${state.removals.length} of ${config.subtrahend} counters removed. ${total} left.`;
    case "make-ten":
      if (state.tenTokens === 1) {
        return `One ten and ${occupiedCellIndices(state).length} ones. ${state.placements.length} of ${config.addend} added.`;
      }
      if (canTradeFirstFrame(state)) return "The first frame is full. Trade it for one ten.";
      return `${state.cells.slice(0, 10).filter((cell) => cell !== null).length} of 10 in the first frame.`;
  }
}

function responseFor(
  config: MathTenframeConfig,
  state: TenframeState,
  attempts: number,
): MathTenframeResponse {
  const occupiedCells = occupiedCellIndices(state);
  switch (config.mode) {
    case "represent":
      return { mode: "represent", occupiedCells, placements: state.placements, attempts };
    case "add":
      return { mode: "add", occupiedCells, placements: state.placements, attempts };
    case "subtract":
      return { mode: "subtract", occupiedCells, removals: state.removals, attempts };
    case "make-ten":
      return {
        mode: "make-ten",
        occupiedCells,
        placements: state.placements,
        tenTokens: state.tenTokens,
        tradeAtPlacement: state.tradeAtPlacement,
        attempts,
      };
  }
}
