"use client";

import { useState } from "react";
import { motion } from "motion/react";
import {
  ArrowCounterClockwiseIcon,
  MinusIcon,
  PlusIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { MathArrayConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { PlayerControls, Prompt, ProgressHint, SpeakerButton } from "../_shared/ActivityChrome";
import { RetryFeedback } from "../_shared/RetryFeedback";
import { useActivity } from "../_shared/useActivity";
import { useReducedMotion } from "../_shared/useReducedMotion";
import { useSpeakOnce } from "../_shared/useSpeakOnce";
import { useSpeech, type SpeechController } from "../_shared/useSpeech";
import { useWrongShake } from "../_shared/useWrongShake";
import {
  addCompleteRow,
  createAreaCells,
  createDealState,
  dealNextItem,
  factFamilyFor,
  filledAreaIndices,
  isAreaComplete,
  isEqualDealComplete,
  removeCompleteRow,
  resultChoices,
  revealNextRow,
  rowMajorTileIndices,
  skipCountSequence,
  toggleAreaCell,
  type DealState,
} from "./model";
import { expectedFor, schema, totalFor, type MathArrayResponse } from "./logic";

const ARRAY_GRID_COLUMNS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
  7: "grid-cols-7",
  8: "grid-cols-8",
  9: "grid-cols-9",
  10: "grid-cols-10",
  11: "grid-cols-11",
  12: "grid-cols-12",
};

export function arrayGridClass(cols: number): string {
  return ARRAY_GRID_COLUMNS[cols] ?? "grid-cols-1";
}

type CompleteArray = ActivityPlayerProps<MathArrayConfig, MathArrayResponse>["onComplete"];
type BuildConfig = Extract<MathArrayConfig, { mode: "build" }>;
type MultiplyConfig = Extract<MathArrayConfig, { mode: "multiply" }>;
type DivideConfig = Extract<MathArrayConfig, { mode: "divide" }>;
type AreaConfig = Extract<MathArrayConfig, { mode: "area" }>;

interface ModeProps<Config> {
  config: Config;
  onComplete: CompleteArray;
  reduced: boolean;
  speech: SpeechController;
}

export function MathArrayPlayer({
  config,
  onComplete,
}: ActivityPlayerProps<MathArrayConfig, MathArrayResponse>) {
  const parsed = useActivity(schema, config);
  const speech = useSpeech();
  const reduced = useReducedMotion();

  useSpeakOnce(speech.speak, parsed.instruction);

  let interaction;
  switch (parsed.mode) {
    case "build":
      interaction = (
        <BuildMode config={parsed} onComplete={onComplete} reduced={reduced} speech={speech} />
      );
      break;
    case "multiply":
      interaction = (
        <MultiplyMode
          config={parsed}
          onComplete={onComplete}
          reduced={reduced}
          speech={speech}
        />
      );
      break;
    case "divide":
      interaction = (
        <DivideMode config={parsed} onComplete={onComplete} reduced={reduced} speech={speech} />
      );
      break;
    case "area":
      interaction = (
        <AreaMode config={parsed} onComplete={onComplete} reduced={reduced} speech={speech} />
      );
      break;
  }

  return (
    <div className="grid gap-8">
      <Prompt speech={speech} instruction={parsed.instruction} />
      {interaction}
    </div>
  );
}

function BuildMode({ config, onComplete, reduced, speech }: ModeProps<BuildConfig>) {
  const [builtRows, setBuiltRows] = useState(0);
  const filledTiles = rowMajorTileIndices(builtRows, config.cols);

  function addRow() {
    const next = addCompleteRow(builtRows, config.rows);
    setBuiltRows(next);
    speech.speak(`${next} ${next === 1 ? "row" : "rows"}.`);
  }

  function removeRow() {
    const next = removeCompleteRow(builtRows);
    setBuiltRows(next);
    speech.speak(`${next} ${next === 1 ? "row" : "rows"}.`);
  }

  function finish() {
    const response: MathArrayResponse = { mode: "build", builtRows, attempts: 1 };
    onComplete(response);
  }

  return (
    <>
      <motion.div className="w-full overflow-x-auto pb-1" initial={false}>
        <div className="flex min-w-max justify-center">
          <TileGrid
            rows={config.rows}
            cols={config.cols}
            filled={new Set(filledTiles)}
            emoji={config.emoji}
            reduced={reduced}
            label={`Build ${config.rows} rows of ${config.cols}`}
          />
        </div>
      </motion.div>

      <div className="grid gap-1">
        <ProgressHint>{`${builtRows} of ${config.rows} rows`}</ProgressHint>
        <ProgressHint>{`${filledTiles.length} tiles in row-major order`}</ProgressHint>
      </div>

      <PlayerControls>
        <Button variant="soft" size="kid" onClick={removeRow} disabled={builtRows === 0}>
          <MinusIcon weight="bold" aria-hidden="true" />
          Remove a row
        </Button>
        <SpeakerButton speech={speech} text={config.instruction} label="Hear what to do again" />
        <Button variant="honey" size="kid" onClick={addRow} disabled={builtRows === config.rows}>
          <PlusIcon weight="bold" aria-hidden="true" />
          Add a row
        </Button>
        <Button
          variant="primary"
          size="kid"
          onClick={finish}
          disabled={builtRows !== config.rows}
        >
          I built it
        </Button>
      </PlayerControls>
    </>
  );
}

function MultiplyMode({ config, onComplete, reduced, speech }: ModeProps<MultiplyConfig>) {
  const shake = useWrongShake();
  const [revealedRows, setRevealedRows] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [correction, setCorrection] = useState<string | null>(null);
  const sequence = skipCountSequence(revealedRows, config.cols);
  const expected = expectedFor(config);
  const ready = revealedRows === config.rows;

  function revealRow(index: number) {
    if (shake.wrong || index !== revealedRows) return;
    const next = revealNextRow(revealedRows, config.rows);
    setRevealedRows(next);
    setCorrection(null);
    speech.speak(String(next * config.cols));
  }

  function reset() {
    setRevealedRows(0);
    setSelected(null);
    setCorrection(null);
  }

  function select(value: number) {
    setSelected(value);
    setCorrection(null);
  }

  function check() {
    if (selected === null) return;
    const attemptCount = Math.min(attempts + 1, 20);
    setAttempts(attemptCount);
    if (selected === expected) {
      onComplete({
        mode: "multiply",
        revealedRows,
        entered: selected,
        attempts: attemptCount,
      });
      return;
    }
    const message = "Keep your rows. Follow the skip count once more.";
    setCorrection(message);
    shake.trigger({ speak: () => speech.speak(message) });
  }

  return (
    <>
      <p className="text-center font-display text-2xl text-ink" aria-hidden="true">
        {config.rows} × {config.cols} = ?
      </p>

      <motion.div
        className="grid min-w-0 justify-items-center gap-4"
        {...shake.shakeProps(reduced)}
      >
        <div className="w-full overflow-x-auto pb-1" data-testid="multiply-array-scroll">
          <div
            role="group"
            aria-label={`${config.rows} rows of ${config.cols}`}
            className="mx-auto grid w-fit min-w-max gap-3"
          >
            {Array.from({ length: config.rows }, (_, rowIndex) => {
              const revealed = rowIndex < revealedRows;
              const isNext = rowIndex === revealedRows;
              return (
                <button
                  key={rowIndex}
                  type="button"
                  onClick={() => revealRow(rowIndex)}
                  disabled={!isNext || shake.wrong}
                  aria-label={
                    revealed
                      ? `Row ${rowIndex + 1} revealed, total ${(rowIndex + 1) * config.cols}`
                      : `Reveal row ${rowIndex + 1}`
                  }
                  className={cn(
                    "grid min-h-20 gap-1 rounded-2xl border-[3px] border-ink p-2 shadow-pop transition",
                    arrayGridClass(config.cols),
                    revealed ? "bg-accent" : "bg-paper-sunk",
                    isNext && "hover:-translate-y-0.5 active:translate-y-1 active:shadow-none",
                  )}
                >
                  {Array.from({ length: config.cols }, (_, colIndex) => (
                    <span
                      key={colIndex}
                      aria-hidden="true"
                      className={cn(
                        "grid size-14 place-items-center rounded-xl border-2 border-ink/25",
                        revealed ? "bg-paper-raised" : "border-dashed bg-paper-sunk",
                      )}
                    >
                      {revealed && <TileFill emoji={config.emoji} reduced={reduced} compact />}
                    </span>
                  ))}
                </button>
              );
            })}
          </div>
        </div>

        <ProgressHint>
          {sequence.length === 0 ? "Reveal the first row" : `Skip count: ${sequence.join(", ")}`}
        </ProgressHint>

        {ready && (
          <ResultChoices
            expected={expected}
            selected={selected}
            disabled={shake.wrong}
            onSelect={select}
          />
        )}
      </motion.div>

      <RetryFeedback message={correction} />

      <PlayerControls>
        <Button variant="soft" size="md" onClick={reset} disabled={revealedRows === 0 || shake.wrong}>
          <ArrowCounterClockwiseIcon weight="bold" aria-hidden="true" />
          Clear
        </Button>
        <SpeakerButton speech={speech} text={config.instruction} label="Hear what to do again" />
        <Button
          variant="primary"
          size="kid"
          onClick={check}
          disabled={!ready || selected === null || shake.wrong}
        >
          Check it
        </Button>
      </PlayerControls>
    </>
  );
}

function DivideMode({ config, onComplete, reduced, speech }: ModeProps<DivideConfig>) {
  const shake = useWrongShake();
  const [deal, setDeal] = useState<DealState>(() => createDealState(config.total, config.groups));
  const [selected, setSelected] = useState<number | null>(null);
  const [attempts, setAttempts] = useState(1);
  const [stage, setStage] = useState<"share" | "facts">("share");
  const [factResults, setFactResults] = useState<number[]>([]);
  const [correction, setCorrection] = useState<string | null>(null);
  const expected = expectedFor(config);
  const complete = isEqualDealComplete(deal);
  const factFamily = factFamilyFor(config.total, config.groups);
  const activeFact = factFamily[factResults.length];

  function dealOne() {
    if (shake.wrong || deal.pool.length === 0) return;
    const dealtCount = config.total - deal.pool.length;
    const group = (dealtCount % config.groups) + 1;
    setDeal((current) => dealNextItem(current));
    speech.speak(`One for group ${group}.`);
  }

  function reset() {
    setDeal(createDealState(config.total, config.groups));
    setSelected(null);
    setStage("share");
    setFactResults([]);
    setCorrection(null);
  }

  function select(value: number) {
    setSelected(value);
    setCorrection(null);
  }

  function check() {
    if (!complete || selected === null || shake.wrong) return;

    if (stage === "share") {
      if (selected === expected) {
        setStage("facts");
        setSelected(null);
        setCorrection(null);
        speech.speak("That is the equal share. Now build its four related facts.");
        return;
      }
      setAttempts((current) => Math.min(current + 1, 20));
      const message = "Keep the shares. Count one group again.";
      setCorrection(message);
      shake.trigger({ speak: () => speech.speak(message) });
      return;
    }

    if (!activeFact) return;
    if (selected !== activeFact.result) {
      setAttempts((current) => Math.min(current + 1, 20));
      const message = "Keep the fact. Use the same three numbers and try again.";
      setCorrection(message);
      shake.trigger({ speak: () => speech.speak(message) });
      return;
    }

    setCorrection(null);
    const completedResults = [...factResults, selected];
    if (completedResults.length === factFamily.length) {
      const [first, second, third, fourth] = completedResults;
      if (
        first === undefined ||
        second === undefined ||
        third === undefined ||
        fourth === undefined
      ) {
        return;
      }
      onComplete({
        mode: "divide",
        poolRemaining: deal.pool.length,
        groupCounts: deal.groups.map((group) => group.length),
        factResults: [first, second, third, fourth],
        attempts,
      });
      return;
    }

    setFactResults(completedResults);
    setSelected(null);
    const nextFact = factFamily[completedResults.length];
    if (nextFact) {
      speech.speak(`${nextFact.left} ${nextFact.operator} ${nextFact.right}`);
    }
  }

  return (
    <>
      <p className="text-center font-display text-2xl text-ink" aria-hidden="true">
        {config.total} ÷ {config.groups} = {stage === "facts" ? expected : "?"}
      </p>

      <motion.div className="grid gap-6" {...shake.shakeProps(reduced)}>
        <div className="grid justify-items-center gap-2">
          <p className="font-semibold text-ink">Source pool</p>
          <button
            type="button"
            onClick={dealOne}
            disabled={deal.pool.length === 0 || shake.wrong}
            aria-label={
              deal.pool.length === 0 ? "Source pool empty" : `Deal one item, ${deal.pool.length} left`
            }
            className={cn(
              "flex min-h-24 min-w-48 max-w-3xl flex-wrap items-center justify-center gap-2 rounded-2xl",
              "border-[3px] border-ink bg-honey p-4 shadow-pop transition",
              "hover:-translate-y-0.5 active:translate-y-1 active:shadow-none",
              "disabled:pointer-events-none disabled:opacity-60",
            )}
          >
            {deal.pool.length === 0 ? (
              <span className="font-semibold text-ink">All shared</span>
            ) : (
              deal.pool.map((item) => (
                <Token key={item} emoji={config.emoji} label={`Pool item ${item + 1}`} />
              ))
            )}
          </button>
        </div>

        <div className="flex flex-wrap justify-center gap-4">
          {deal.groups.map((items, groupIndex) => (
            <div
              key={groupIndex}
              role="group"
              aria-label={`Group ${groupIndex + 1}, ${items.length} ${items.length === 1 ? "item" : "items"}`}
              className="min-h-32 min-w-40 rounded-2xl border-[3px] border-ink bg-paper-raised p-3 shadow-pop"
            >
              <p className="mb-2 text-center font-semibold text-ink">Group {groupIndex + 1}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {items.map((item) => (
                  <Token key={item} emoji={config.emoji} label={`Shared item ${item + 1}`} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <ProgressHint>
          {deal.pool.length > 0
            ? `${deal.pool.length} ${deal.pool.length === 1 ? "item" : "items"} left to share`
            : "The shares are even—count one group"}
        </ProgressHint>

        {complete && stage === "share" && (
          <ResultChoices
            expected={expected}
            selected={selected}
            disabled={shake.wrong}
            onSelect={select}
          />
        )}

        {stage === "facts" && activeFact && (
          <section
            aria-labelledby="fact-family-heading"
            className="grid w-full max-w-2xl justify-items-center gap-4 rounded-3xl border-[3px] border-ink bg-paper-raised p-5 shadow-pop sm:p-7"
          >
            <div className="grid justify-items-center gap-1 text-center">
              <h2 id="fact-family-heading" className="font-display text-3xl text-ink">
                Build the fact family
              </h2>
              <p className="font-semibold text-ink-soft">
                Use {config.groups}, {expected}, and {config.total} in all four related facts.
              </p>
            </div>

            {factResults.length > 0 && (
              <ol aria-label="Completed facts" className="flex flex-wrap justify-center gap-2">
                {factResults.map((result, index) => {
                  const fact = factFamily[index];
                  if (!fact) return null;
                  return (
                    <li
                      key={`${fact.operator}-${index}`}
                      className="rounded-full border-2 border-ink bg-success px-4 py-2 font-display text-lg text-ink"
                    >
                      {fact.left} {fact.operator} {fact.right} = {result}
                    </li>
                  );
                })}
              </ol>
            )}

            <div aria-live="polite" className="grid justify-items-center gap-3">
              <ProgressHint>{`Fact ${factResults.length + 1} of ${factFamily.length}`}</ProgressHint>
              <p className="rounded-2xl border-[3px] border-ink bg-honey px-6 py-4 font-display text-4xl text-ink shadow-pop">
                {activeFact.left} {activeFact.operator} {activeFact.right} = ?
              </p>
            </div>

            <ResultChoices
              expected={activeFact.result}
              selected={selected}
              disabled={shake.wrong}
              label={`Choose the result for ${activeFact.left} ${activeFact.operator} ${activeFact.right}`}
              onSelect={select}
            />
          </section>
        )}
      </motion.div>

      <RetryFeedback message={correction} />

      <PlayerControls>
        <Button
          variant="soft"
          size="md"
          onClick={reset}
          disabled={
            (deal.pool.length === config.total && stage === "share") || shake.wrong
          }
        >
          <ArrowCounterClockwiseIcon weight="bold" aria-hidden="true" />
          Clear
        </Button>
        <SpeakerButton speech={speech} text={config.instruction} label="Hear what to do again" />
        <Button
          variant="primary"
          size="kid"
          onClick={check}
          disabled={
            !complete ||
            selected === null ||
            shake.wrong ||
            (stage === "facts" && !activeFact)
          }
        >
          {stage === "share" ? "Check share" : "Check fact"}
        </Button>
      </PlayerControls>
    </>
  );
}

function AreaMode({ config, onComplete, reduced, speech }: ModeProps<AreaConfig>) {
  const shake = useWrongShake();
  const [cells, setCells] = useState(() => createAreaCells(config.rows, config.cols));
  const [selected, setSelected] = useState<number | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [correction, setCorrection] = useState<string | null>(null);
  const filled = filledAreaIndices(cells);
  const expected = expectedFor(config);
  const complete = isAreaComplete(cells);

  function toggle(index: number) {
    if (shake.wrong) return;
    setCells((current) => toggleAreaCell(current, index));
    setCorrection(null);
  }

  function reset() {
    setCells(createAreaCells(config.rows, config.cols));
    setSelected(null);
    setCorrection(null);
  }

  function select(value: number) {
    setSelected(value);
    setCorrection(null);
  }

  function check() {
    if (!complete || selected === null) return;
    const attemptCount = Math.min(attempts + 1, 20);
    setAttempts(attemptCount);
    if (selected === expected) {
      onComplete({
        mode: "area",
        filledCells: filled,
        entered: selected,
        attempts: attemptCount,
      });
      return;
    }
    const message = "Keep the tiles. Count the unit squares again.";
    setCorrection(message);
    shake.trigger({ speak: () => speech.speak(message) });
  }

  return (
    <>
      <p className="text-center font-display text-2xl text-ink" aria-hidden="true">
        {config.rows} rows × {config.cols} columns = ? unit squares
      </p>

      <motion.div
        className="grid justify-items-center gap-4 overflow-x-auto pb-1"
        {...shake.shakeProps(reduced)}
      >
        <AreaGrid config={config} cells={cells} reduced={reduced} onToggle={toggle} />
        <ProgressHint>{`${filled.length} of ${totalFor(config)} unit squares filled`}</ProgressHint>
        {complete && (
          <ResultChoices
            expected={expected}
            selected={selected}
            disabled={shake.wrong}
            onSelect={select}
          />
        )}
      </motion.div>

      <RetryFeedback message={correction} />

      <PlayerControls>
        <Button variant="soft" size="md" onClick={reset} disabled={filled.length === 0 || shake.wrong}>
          <ArrowCounterClockwiseIcon weight="bold" aria-hidden="true" />
          Clear
        </Button>
        <SpeakerButton speech={speech} text={config.instruction} label="Hear what to do again" />
        <Button
          variant="primary"
          size="kid"
          onClick={check}
          disabled={!complete || selected === null || shake.wrong}
        >
          Check it
        </Button>
      </PlayerControls>
    </>
  );
}

function TileGrid({
  rows,
  cols,
  filled,
  emoji,
  reduced,
  label,
}: {
  rows: number;
  cols: number;
  filled: ReadonlySet<number>;
  emoji?: string;
  reduced: boolean;
  label: string;
}) {
  return (
    <div
      role="grid"
      aria-label={label}
      className={cn(
        "inline-grid gap-0.5 rounded-2xl border-[3px] border-ink bg-paper-raised p-0 shadow-pop sm:gap-1",
        arrayGridClass(cols),
      )}
    >
      {Array.from({ length: rows * cols }, (_, index) => {
        const isFilled = filled.has(index);
        return (
          <div
            key={index}
            role="gridcell"
            aria-label={isFilled ? `Tile ${index + 1}, filled` : `Tile ${index + 1}, empty`}
            className={cn(
              "grid size-16 place-items-center rounded-xl border-2",
              isFilled ? "border-ink bg-accent" : "border-dashed border-ink/25 bg-paper-sunk",
            )}
          >
            {isFilled && <TileFill emoji={emoji} reduced={reduced} />}
          </div>
        );
      })}
    </div>
  );
}

function AreaGrid({
  config,
  cells,
  reduced,
  onToggle,
}: {
  config: AreaConfig;
  cells: boolean[];
  reduced: boolean;
  onToggle: (index: number) => void;
}) {
  return (
    <div
      role="group"
      aria-label={`${config.rows} by ${config.cols} area grid`}
      className="inline-grid min-w-max gap-1 rounded-2xl border-[3px] border-ink bg-paper-raised p-3 shadow-pop"
      style={{ gridTemplateColumns: `3rem repeat(${config.cols}, 4rem)` }}
    >
      <span aria-hidden="true" />
      {Array.from({ length: config.cols }, (_, colIndex) => (
        <span key={`column-${colIndex}`} className="text-center font-semibold text-ink-soft">
          {colIndex + 1}
        </span>
      ))}
      {Array.from({ length: config.rows }, (_, rowIndex) => [
        <span
          key={`row-${rowIndex}`}
          className="grid place-items-center font-semibold text-ink-soft"
        >
          {rowIndex + 1}
        </span>,
        ...Array.from({ length: config.cols }, (_, colIndex) => {
          const index = rowIndex * config.cols + colIndex;
          const isFilled = cells[index] ?? false;
          return (
            <button
              key={`cell-${index}`}
              type="button"
              onClick={() => onToggle(index)}
              aria-pressed={isFilled}
              aria-label={`Row ${rowIndex + 1}, column ${colIndex + 1}, ${isFilled ? "filled" : "empty"} unit square`}
              className={cn(
                "grid size-16 place-items-center rounded-xl border-2 transition",
                isFilled
                  ? "border-ink bg-accent"
                  : "border-dashed border-ink/25 bg-paper-sunk hover:border-ink/50",
                "active:translate-y-0.5",
              )}
            >
              {isFilled && <TileFill emoji={config.emoji} reduced={reduced} compact />}
            </button>
          );
        }),
      ])}
    </div>
  );
}

function ResultChoices({
  expected,
  selected,
  disabled,
  label = "Choose the result",
  onSelect,
}: {
  expected: number;
  selected: number | null;
  disabled: boolean;
  label?: string;
  onSelect: (value: number) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap justify-center gap-3">
      {resultChoices(expected).map((choice) => (
        <button
          key={choice}
          type="button"
          onClick={() => onSelect(choice)}
          disabled={disabled}
          aria-pressed={selected === choice}
          aria-label={`Choose ${choice}`}
          className={cn(
            "grid size-24 place-items-center rounded-2xl border-[3px] border-ink font-display text-4xl text-ink shadow-pop",
            "transition hover:-translate-y-0.5 active:translate-y-1 active:shadow-none",
            selected === choice ? "bg-honey" : "bg-paper-raised",
          )}
        >
          {choice}
        </button>
      ))}
    </div>
  );
}

function Token({ emoji, label }: { emoji?: string; label: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      className="grid size-10 place-items-center rounded-full border-2 border-ink bg-paper-raised text-xl"
    >
      {emoji ?? <span className="size-5 rounded-full bg-accent-deep" aria-hidden="true" />}
    </span>
  );
}

function TileFill({
  emoji,
  reduced,
  compact = false,
}: {
  emoji?: string;
  reduced: boolean;
  compact?: boolean;
}) {
  if (emoji) {
    return (
      <span role="img" aria-hidden="true" className={compact ? "text-xl" : "text-2xl"}>
        {emoji}
      </span>
    );
  }
  return (
    <motion.span
      className={cn("rounded-full bg-accent-deep", compact ? "size-6" : "size-7 sm:size-8")}
      initial={reduced ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: reduced ? 0.001 : 0.24, ease: [0.16, 1, 0.3, 1] }}
    />
  );
}
