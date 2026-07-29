import { BackspaceIcon } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";
import type { WordProgress } from "./wordType";

/**
 * Word-tile display shared by Word Write and Rocket Race — both show the
 * target word as tiles plus a colored buffer of what's been typed so far.
 * Race keeps this row visible throughout (the race is rate, not memory), so
 * lifting it here (rather than duplicating it) keeps the two Players' tile
 * markup byte-identical.
 */

const TILE_BASE =
  "grid size-14 place-items-center rounded-sm border-[3px] border-ink font-display text-2xl text-ink shadow-pop";
const TILE_TONE: Record<"correct" | "wrong", string> = {
  correct: "bg-honey",
  wrong: "bg-coral/55 line-through decoration-[3px]",
};

interface WordGroup {
  positions: number[];
}

function wordGroups(item: string): WordGroup[] {
  const groups: WordGroup[] = [];
  let positions: number[] = [];
  for (let position = 0; position < item.length; position++) {
    if (item[position] === " ") {
      if (positions.length > 0) groups.push({ positions });
      positions = [];
    } else {
      positions.push(position);
    }
  }
  if (positions.length > 0) groups.push({ positions });
  return groups;
}

function groupForPosition(groups: readonly WordGroup[], position: number): number {
  const exact = groups.findIndex((group) => group.positions.includes(position));
  if (exact >= 0) return exact;
  for (let groupIndex = groups.length - 1; groupIndex >= 0; groupIndex--) {
    if ((groups[groupIndex]?.positions.at(-1) ?? -1) < position) return groupIndex;
  }
  return 0;
}

/** The target tile artwork — hidden entirely in Player render; only shown in
 *  "see" mode, once a hear-mode round reveals, or always (Rocket Race).
 *  `aria-hidden` keeps individual glyphs from becoming noisy; each Player's
 *  live announcement provides the equivalent complete word when it is shown. */
export function ExpectedTiles({ item }: { item: string }) {
  const groups = wordGroups(item);
  return (
    <div
      aria-hidden="true"
      className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2"
    >
      {groups.map((group, groupIndex) => (
        <span
          key={groupIndex}
          data-expected-word-group="true"
          className="flex shrink-0 items-center gap-2"
        >
          {group.positions.map((position) => (
            <span
              key={position}
              data-expected-position={position}
              className={cn(TILE_BASE, "bg-paper-raised")}
            >
              {item[position]}
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}

/**
 * §8: `progress.typed` is client-only display feedback. Only `wordItemResult`
 * (expected-derived data) is ever reported — this row is decorative, never the
 * source of what gets sent to `onComplete`.
 */
export function BufferTiles({ item, progress }: { item: string; progress: WordProgress }) {
  const groups = wordGroups(item);
  const entriesByGroup = groups.map(
    () => [] as { entry: WordProgress["typed"][number]; position: number }[],
  );
  progress.typed.forEach((entry, position) => {
    if (item[position] === " " && entry.ok) return;
    const groupIndex = groupForPosition(groups, position);
    entriesByGroup[groupIndex]?.push({ entry, position });
  });
  const caretGroup = groupForPosition(groups, progress.typed.length);

  return (
    <div
      aria-hidden="true"
      className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2"
    >
      {groups.map((_, groupIndex) => (
        <span
          key={groupIndex}
          data-buffer-word-group="true"
          className="flex min-h-14 shrink-0 items-center gap-2"
        >
          {entriesByGroup[groupIndex]?.map(({ entry, position }) => (
            <span
              key={position}
              data-buffer-position={position}
              className={cn(TILE_BASE, TILE_TONE[entry.ok ? "correct" : "wrong"])}
            >
              {entry.char}
            </span>
          ))}
          {caretGroup === groupIndex ? (
            <span className="grid size-14 place-items-center rounded-sm border-[3px] border-dashed border-ink-soft bg-paper-sunk text-2xl text-ink-soft">
              |
            </span>
          ) : null}
        </span>
      ))}
      {progress.diverged ? (
        <span
          data-backspace-hint="true"
          className="flex min-h-14 items-center gap-2 rounded-xl border-[3px] border-ink bg-paper-raised px-3 font-display text-sm text-ink shadow-pop"
        >
          <BackspaceIcon size={24} weight="bold" />
          Backspace
        </span>
      ) : null}
    </div>
  );
}
