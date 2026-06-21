"use client";

import { SpeakerHighIcon } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";
import type { SpeechController } from "./useSpeech";

/**
 * A round, kid-sized "read it to me" button. Audio is an enhancement, so when
 * speech is unsupported it simply does not render (the prompt text remains).
 */
export function SpeakerButton({
  speech,
  text,
  tts,
  label = "Hear it again",
  className,
}: {
  speech: SpeechController;
  text: string;
  /** Optional phoneme override sent to the neural voice (see withPhonemes). */
  tts?: string;
  label?: string;
  className?: string;
}) {
  if (!speech.supported) return null;
  return (
    <button
      type="button"
      onClick={() => speech.speak(text, tts ? { tts } : undefined)}
      aria-label={label}
      className={cn(
        "grid size-16 shrink-0 place-items-center rounded-2xl border-[3px] border-ink bg-honey text-ink shadow-pop",
        "transition duration-200 ease-out hover:-translate-y-0.5 active:translate-y-1 active:shadow-none",
        className,
      )}
    >
      <SpeakerHighIcon size={28} weight="fill" aria-hidden="true" />
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
