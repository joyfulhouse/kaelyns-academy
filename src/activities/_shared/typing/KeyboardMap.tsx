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
  pinky: "bg-berry/20",
  ring: "bg-sky/20",
  middle: "bg-sprout/20",
  index: "bg-honey/30",
  thumb: "bg-coral/20",
};

/** Tint for a key with no finger assignment. */
export const NO_FINGER_TINT = "bg-paper-sunk";

const ROW_ORDER = ["top", "home", "bottom"] as const;

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
        "grid place-items-center rounded-xl text-lg font-semibold text-ink",
        char === " " ? "h-12 w-64" : "size-12",
        assignment ? FINGER_TINT[assignment.finger] : NO_FINGER_TINT,
        isTarget && "ring-4 ring-coral ring-offset-2 ring-offset-paper",
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
        "grid h-12 w-16 place-items-center rounded-xl text-2xl font-semibold text-ink",
        FINGER_TINT.pinky,
        isTarget && "ring-4 ring-coral ring-offset-2 ring-offset-paper",
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
    <div className="flex flex-col items-center gap-2" role="img" aria-label={containerLabel}>
      {ROW_ORDER.map((row) => (
        <div key={row} className="flex gap-2">
          {row === "bottom" && <ShiftKey side="left" target={target} />}
          {TYPING_ROWS[row].map((char) => (
            <Key key={char} char={char} target={target} />
          ))}
          {row === "bottom" && <ShiftKey side="right" target={target} />}
        </div>
      ))}
      <Key char=" " target={target} />
    </div>
  );
}
