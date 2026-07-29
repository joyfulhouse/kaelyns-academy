import { cn } from "@/lib/cn";
import {
  KEY_FINGERS,
  TYPING_ROWS,
  isCapitalKey,
  type Finger,
  type Hand,
} from "./keys";

/**
 * A picture of the keyboard, not an input. Each key is tinted by the finger
 * that owns it, so the child learns finger assignment by looking rather than by
 * being told. The target key is marked by tint AND a ring AND a label, never by
 * colour alone (DESIGN.md accessibility floor).
 *
 * Static class maps only — Tailwind's JIT cannot see constructed strings.
 */
export const FINGER_TINT: Record<Finger, string> = {
  pinky: "bg-key-pinky/55",
  ring: "bg-key-ring/55",
  middle: "bg-key-middle/55",
  index: "bg-key-index/55",
  thumb: "bg-key-thumb/55",
};

/** Tint for a key with no finger assignment. */
export const NO_FINGER_TINT = "bg-paper-sunk";

const ROW_ORDER = ["top", "home", "bottom"] as const;
const ROW_PADDING: Record<(typeof ROW_ORDER)[number], string> = {
  top: "pl-0",
  home: "pl-3",
  bottom: "pl-6",
};
const FINGER_LEGEND: readonly { finger: Finger; label: string }[] = [
  { finger: "pinky", label: "pinky" },
  { finger: "ring", label: "ring" },
  { finger: "middle", label: "tall" },
  { finger: "index", label: "pointer" },
  { finger: "thumb", label: "thumb" },
];

function fingerOf(key: string) {
  return KEY_FINGERS[key.toLowerCase()];
}

function keyLabel(key: string): string {
  const assignment = fingerOf(key);
  const hand = assignment?.hand === "left" ? "left" : "right";
  const finger = assignment?.finger ?? "index";
  if (key === " ") return `Press the space bar, ${hand} ${finger}`;
  const fingerLabel = finger === "index" ? "pointer finger" : `${finger} finger`;
  if (isCapitalKey(key)) {
    return `Hold shift, then press ${key}, ${hand} ${fingerLabel}`;
  }
  return `Press ${key.toUpperCase()}, ${hand} ${fingerLabel}`;
}

function Key({ char, target }: { char: string; target: string | null }) {
  const isTarget = target !== null && target.toLowerCase() === char.toLowerCase();
  const assignment = fingerOf(char);
  return (
    <span
      data-key={char}
      data-target={isTarget ? "true" : undefined}
      className={cn(
        "typing-key grid place-items-center rounded-sm border-2 border-ink font-semibold text-ink shadow-pop",
        char === " " && "typing-key-space",
        assignment ? FINGER_TINT[assignment.finger] : NO_FINGER_TINT,
        isTarget &&
          "typing-key-target ring-4 ring-coral ring-offset-2 ring-offset-paper",
      )}
    >
      {char === " " ? "" : char}
    </span>
  );
}

/**
 * Shift is visual guidance for a chord, never a standalone teachable target.
 * Keep these two keys outside KEY_FINGERS so its bidirectional board/scoring
 * contract continues to cover only characters that can appear in content.
 */
function ShiftKey({ side, target }: { side: Hand; target: string | null }) {
  const targetAssignment = target === null ? undefined : fingerOf(target);
  const isTarget =
    target !== null &&
    isCapitalKey(target) &&
    targetAssignment !== undefined &&
    targetAssignment.hand !== side;
  const code = side === "left" ? "ShiftLeft" : "ShiftRight";

  return (
    <span
      data-key={code}
      data-target={isTarget ? "true" : undefined}
      className={cn(
        "typing-key typing-key-shift grid place-items-center rounded-sm border-2 border-ink font-semibold text-ink shadow-pop",
        FINGER_TINT.pinky,
        isTarget &&
          "typing-key-target ring-4 ring-coral ring-offset-2 ring-offset-paper",
      )}
    >
      ⇧
    </span>
  );
}

export function KeyboardMap({ target }: { target: string | null }) {
  const containerLabel =
    target === null ? "Keyboard" : `Keyboard. ${keyLabel(target)}.`;

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="typing-keyboard flex w-fit max-w-full flex-col items-start gap-2"
        role="img"
        aria-label={containerLabel}
      >
        {ROW_ORDER.map((row) => (
          <div
            key={row}
            data-row={row}
            className={cn("typing-keyboard-row flex", ROW_PADDING[row])}
          >
            {row === "bottom" && <ShiftKey side="left" target={target} />}
            {TYPING_ROWS[row].map((char) => (
              <Key key={char} char={char} target={target} />
            ))}
            {row === "bottom" && <ShiftKey side="right" target={target} />}
          </div>
        ))}
        <span className="self-center">
          <Key char=" " target={target} />
        </span>
      </div>
      <ul
        className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm font-medium text-ink"
        aria-label="Finger color guide"
      >
        {FINGER_LEGEND.map(({ finger, label }) => (
          <li key={finger} data-finger={label} className="flex items-center gap-2">
            <span
              className={cn(
                "size-4 rounded-[3px] border-[1.5px] border-ink",
                FINGER_TINT[finger],
              )}
              aria-hidden="true"
            />
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}
