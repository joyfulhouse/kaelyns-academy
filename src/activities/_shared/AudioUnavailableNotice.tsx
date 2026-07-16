"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/ssr";

/** Calm, retryable fallback for learning interactions whose content is audio-first. */
export function AudioUnavailableNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="status"
      className="mx-auto flex max-w-xl flex-wrap items-center justify-center gap-3 rounded-2xl border-2 border-honey-deep/40 bg-honey/15 px-5 py-4 text-center text-ink"
    >
      <p>The sound is resting. You can try it again when you&apos;re ready.</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper-raised px-4 py-2 font-display shadow-pop transition active:translate-y-1 active:shadow-none"
      >
        <ArrowClockwiseIcon size={20} weight="bold" aria-hidden="true" />
        Try sound again
      </button>
    </div>
  );
}
