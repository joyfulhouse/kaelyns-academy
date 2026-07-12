"use client";

import type { ReactNode } from "react";
import { SpeakerHighIcon } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";
import type { SpeechController } from "./useSpeech";

type SpeakerSize = "sm" | "md" | "lg";
type SpeakerShape = "square" | "round";
type SpeakerTone = "honey" | "honeySoft" | "success";
type SpeakerPress = "pop" | "soft";

// Static class maps (JIT-safe — no constructed class strings) for the speaker's
// look. The defaults reproduce the original kid-sized honey button exactly; the
// other variants let the audio Players reuse this instead of hand-rolling their
// circular speaker/play buttons.
const SIZE_BOX: Record<SpeakerSize, string> = { sm: "size-20", md: "size-24", lg: "size-28" };
const SIZE_ICON: Record<SpeakerSize, number> = { sm: 32, md: 40, lg: 56 };
const SHAPE_CLASS: Record<SpeakerShape, string> = { square: "rounded-2xl", round: "rounded-full" };
const TONE_CLASS: Record<SpeakerTone, string> = {
  honey: "bg-honey",
  honeySoft: "bg-honey/30",
  success: "bg-success/25",
};
const PRESS_CLASS: Record<SpeakerPress, string> = {
  pop: "transition duration-200 ease-out hover:-translate-y-0.5 active:translate-y-1 active:shadow-none",
  soft: "transition active:translate-y-0.5 active:shadow-none",
};

interface SpeakerVisual {
  label?: string;
  className?: string;
  size?: SpeakerSize;
  shape?: SpeakerShape;
  tone?: SpeakerTone;
  press?: SpeakerPress;
}

/**
 * The speaker accepts EITHER a full `SpeechController` (the common case — it hides
 * itself when speech is unsupported) OR a bare `onSpeak` handler so the audio
 * Players (which drive a hybrid clip/TTS engine via `useAudio`, not `useSpeech`)
 * can reuse it. The `onSpeak` form always renders, since a pre-recorded clip can
 * play even when browser TTS is missing.
 */
type SpeakerButtonProps = SpeakerVisual &
  (
    | { speech: SpeechController; text: string; tts?: string; onSpeak?: never }
    | { onSpeak: () => void; speech?: never; text?: never; tts?: never }
  );

/**
 * A round (or rounded), kid-sized "read it to me" button. Audio is an enhancement
 * (the prompt text always stays visible), so in the `speech` form it simply does
 * not render when speech is unsupported.
 */
export function SpeakerButton(props: SpeakerButtonProps) {
  const {
    label = "Hear it again",
    className,
    size = "md",
    shape = "square",
    tone = "honey",
    press = "pop",
  } = props;

  let onClick: () => void;
  if ("onSpeak" in props && props.onSpeak) {
    onClick = props.onSpeak;
  } else if ("speech" in props && props.speech) {
    if (!props.speech.supported) return null;
    const { speech, text, tts } = props;
    onClick = () => speech.speak(text, tts ? { tts } : undefined);
  } else {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "grid shrink-0 place-items-center border-[3px] border-ink text-ink shadow-pop",
        SIZE_BOX[size],
        SHAPE_CLASS[shape],
        TONE_CLASS[tone],
        PRESS_CLASS[press],
        className,
      )}
    >
      <SpeakerHighIcon size={SIZE_ICON[size]} weight="fill" aria-hidden="true" />
    </button>
  );
}

/**
 * The spoken prompt header: large display text plus a speaker button, auto-read
 * once on mount. Minimal chrome — the prompt *is* the screen (PRODUCT.md §1).
 */
export function Prompt({
  speech,
  instruction,
  className,
}: {
  speech: SpeechController;
  instruction: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-center gap-4", className)}>
      <SpeakerButton speech={speech} text={instruction} />
      <p className="text-balance font-display text-2xl leading-tight text-ink sm:text-3xl">
        {instruction}
      </p>
    </div>
  );
}

/**
 * The centered, wrapping row of action buttons (clear / check / done …) under a
 * Player's main surface. Extracted so every Player shares one control-row layout.
 */
export function PlayerControls({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-3", className)}>
      {children}
    </div>
  );
}

/**
 * The small, polite status line (progress / running count) under a Player's
 * surface. `aria-live="polite"` announces updates without stealing focus.
 */
export function ProgressHint({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("text-center text-sm text-ink-soft", className)} aria-live="polite">
      {children}
    </p>
  );
}
