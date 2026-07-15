"use client";

import { useRef, useState } from "react";
import type { SortCategoriesConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { PlayerControls, Prompt, ProgressHint, SpeakerButton } from "../_shared/ActivityChrome";
import { useActivity } from "../_shared/useActivity";
import { useSpeakOnce } from "../_shared/useSpeakOnce";
import { useSpeech } from "../_shared/useSpeech";
import { isCorrect, schema, type SortCategoriesResponse } from "./logic";
import {
  assignedBin,
  assignmentsComplete,
  initialItemOrder,
  placeItem,
  unplaceItem,
  type SortAssignment,
} from "./model";

const MAX_CHECKS = 20;

export function SortCategoriesPlayer({
  config,
  onComplete,
}: ActivityPlayerProps<SortCategoriesConfig, SortCategoriesResponse>) {
  const parsed = useActivity(schema, config);
  const speech = useSpeech();
  const itemRefs = useRef(new Map<number, HTMLButtonElement>());

  const [itemOrder] = useState(() => initialItemOrder(parsed));
  const [assignments, setAssignments] = useState<SortAssignment[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [reviewItems, setReviewItems] = useState<number[]>([]);
  const [announcement, setAnnouncement] = useState("Choose any item, then choose a group.");

  useSpeakOnce(speech.speak, parsed.instruction);

  function focusItem(itemIndex: number) {
    window.requestAnimationFrame(() => itemRefs.current.get(itemIndex)?.focus());
  }

  function selectItem(itemIndex: number) {
    const item = parsed.items[itemIndex];
    const binId = assignedBin(assignments, itemIndex);
    const bin = parsed.bins.find((candidate) => candidate.id === binId);
    setSelected((current) => (current === itemIndex ? null : itemIndex));
    setAnnouncement(
      selected === itemIndex
        ? `${item.label} is no longer selected.`
        : `${item.label} selected${bin ? ` from ${bin.label}` : ""}. Choose a group.`,
    );
  }

  function putSelectedIn(binId: string) {
    if (selected === null) return;
    const next = placeItem(assignments, selected, binId, parsed);
    const item = parsed.items[selected];
    const bin = parsed.bins.find((candidate) => candidate.id === binId);
    setAssignments(next);
    setReviewItems((current) => current.filter((itemIndex) => itemIndex !== selected));
    setSelected(null);
    setAnnouncement(`${item.label} is in ${bin?.label ?? "the group"}.`);
    focusItem(selected);
  }

  function returnSelectedToTray() {
    if (selected === null || assignedBin(assignments, selected) === null) return;
    const item = parsed.items[selected];
    setAssignments((current) => unplaceItem(current, selected));
    setReviewItems((current) => current.filter((itemIndex) => itemIndex !== selected));
    setSelected(null);
    setAnnouncement(`${item.label} returned to the sorting tray.`);
    focusItem(selected);
  }

  function checkWork() {
    if (!assignmentsComplete(parsed, assignments)) return;
    const nextAttempts = Math.min(attempts + 1, MAX_CHECKS);
    const response: SortCategoriesResponse = { attempts: nextAttempts, assignments };
    if (isCorrect(parsed, response)) {
      onComplete(response);
      return;
    }

    const needsReview = assignments
      .filter(
        (assignment) =>
          parsed.items[assignment.itemIndex]?.binId !== assignment.binId,
      )
      .map((assignment) => assignment.itemIndex);
    setAttempts(nextAttempts);
    setReviewItems(needsReview);
    setAnnouncement(
      `${needsReview.length === 1 ? "One item needs" : `${needsReview.length} items need`} another look. Your groups stayed right where you put them.`,
    );
    speech.speak("Some items need another look. You can move them.");
  }

  const complete = assignmentsComplete(parsed, assignments);
  const selectedBinId = selected === null ? null : assignedBin(assignments, selected);

  return (
    <div className="grid gap-7">
      <Prompt speech={speech} instruction={parsed.instruction} />

      <section
        aria-labelledby="sort-tray-title"
        className="grid gap-3 rounded-2xl border-[3px] border-ink/30 bg-paper-sunk p-4"
      >
        <h2 id="sort-tray-title" className="font-display text-lg text-ink">
          Sorting tray
        </h2>
        <ul aria-label="Items waiting to be sorted" className="flex min-h-24 flex-wrap gap-3">
          {itemOrder.map((itemIndex) => {
            if (assignedBin(assignments, itemIndex) !== null) return null;
            const item = parsed.items[itemIndex];
            const isSelected = selected === itemIndex;
            return (
              <li key={itemIndex}>
                <ItemButton
                  ref={(node) => {
                    if (node) itemRefs.current.set(itemIndex, node);
                    else itemRefs.current.delete(itemIndex);
                  }}
                  item={item}
                  label={`${item.label}, in the sorting tray`}
                  selected={isSelected}
                  needsReview={reviewItems.includes(itemIndex)}
                  onClick={() => selectItem(itemIndex)}
                />
              </li>
            );
          })}
          {assignments.length === parsed.items.length && (
            <li className="grid min-h-16 place-items-center text-sm text-ink-soft">
              Every item has a group. You can still move any one.
            </li>
          )}
        </ul>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        {parsed.bins.map((bin) => {
          const itemIndices = itemOrder.filter(
            (itemIndex) => assignedBin(assignments, itemIndex) === bin.id,
          );
          return (
            <section
              key={bin.id}
              aria-labelledby={`sort-bin-${bin.id}`}
              className="grid content-start gap-3 rounded-2xl border-[3px] border-ink bg-paper-raised p-4 shadow-pop"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 id={`sort-bin-${bin.id}`} className="flex items-center gap-2 font-display text-xl text-ink">
                  {bin.emoji && (
                    <span role="img" aria-hidden="true">
                      {bin.emoji}
                    </span>
                  )}
                  {bin.label}
                </h2>
                <span className="rounded-pill bg-paper-sunk px-3 py-1 text-sm font-semibold text-ink-soft">
                  {itemIndices.length}
                </span>
              </div>

              <Button
                variant={selected === null ? "soft" : "honey"}
                size="md"
                onClick={() => putSelectedIn(bin.id)}
                disabled={selected === null}
                aria-label={
                  selected === null
                    ? `Select an item before placing it in ${bin.label}`
                    : `Put ${parsed.items[selected].label} in ${bin.label}`
                }
                className="w-full border-2 border-dashed border-ink/30"
              >
                Put selected item here
              </Button>

              <ul aria-label={`${bin.label} group items`} className="grid min-h-24 gap-2">
                {itemIndices.map((itemIndex) => {
                  const item = parsed.items[itemIndex];
                  return (
                    <li key={itemIndex}>
                      <ItemButton
                        ref={(node) => {
                          if (node) itemRefs.current.set(itemIndex, node);
                          else itemRefs.current.delete(itemIndex);
                        }}
                        item={item}
                        label={`${item.label}, in ${bin.label}. Select to move or return it`}
                        selected={selected === itemIndex}
                        needsReview={reviewItems.includes(itemIndex)}
                        onClick={() => selectItem(itemIndex)}
                        compact
                      />
                    </li>
                  );
                })}
                {itemIndices.length === 0 && (
                  <li className="grid min-h-20 place-items-center rounded-xl border-2 border-dashed border-ink/20 text-sm text-ink-soft">
                    No items here yet
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>

      <ProgressHint>
        {assignments.length} of {parsed.items.length} sorted
      </ProgressHint>
      <p className="min-h-6 text-center text-sm font-semibold text-ink-soft" role="status" aria-live="polite">
        {announcement}
      </p>

      <PlayerControls>
        <SpeakerButton speech={speech} text={parsed.instruction} label="Hear what to do again" />
        {selectedBinId !== null && selected !== null && (
          <Button variant="soft" size="md" onClick={returnSelectedToTray}>
            Return {parsed.items[selected].label} to tray
          </Button>
        )}
        <Button variant="primary" size="kid" onClick={checkWork} disabled={!complete}>
          Check my groups
        </Button>
      </PlayerControls>
    </div>
  );
}

function ItemButton({
  ref,
  item,
  label,
  selected,
  needsReview,
  onClick,
  compact = false,
}: {
  ref: (node: HTMLButtonElement | null) => void;
  item: SortCategoriesConfig["items"][number];
  label: string;
  selected: boolean;
  needsReview: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={needsReview ? `${label}. Needs another look` : label}
      aria-pressed={selected}
      className={cn(
        "flex min-h-14 w-full flex-wrap items-center justify-center gap-2 rounded-xl border-[3px] border-ink bg-paper-raised px-4 py-3 text-ink shadow-pop",
        "transition duration-200 ease-out hover:-translate-y-0.5 active:translate-y-1 active:shadow-none",
        selected && "bg-honey ring-4 ring-honey/50",
        needsReview && "border-accent-deep bg-accent/12",
        compact ? "text-base" : "min-w-28 font-display text-lg",
      )}
    >
      {item.emoji && (
        <span className={compact ? "text-2xl" : "text-3xl"} role="img" aria-hidden="true">
          {item.emoji}
        </span>
      )}
      <span className="font-display">{item.label}</span>
      {needsReview ? (
        <span className="rounded-full border-2 border-accent-deep bg-paper-raised px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-accent-deep">
          Needs another look
        </span>
      ) : null}
    </button>
  );
}
