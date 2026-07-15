"use client";

import { useEffect, useRef } from "react";
import { CheckCircleIcon, MicrophoneIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { PlayerControls } from "../_shared/ActivityChrome";

export function OralSupportPanel({
  title,
  description,
  focusOnMount,
  canRetry,
  onRetry,
  onComplete,
}: {
  title: string;
  description: string;
  focusOnMount: boolean;
  canRetry: boolean;
  onRetry: () => void;
  onComplete: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus({ preventScroll: true });
  }, [focusOnMount]);

  return (
    <section className="grid gap-4 rounded-3xl border-[3px] border-ink bg-honey/30 p-6">
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-2xl text-ink outline-none focus-visible:ring-4 focus-visible:ring-honey-deep"
      >
        {title}
      </h2>
      <p className="text-ink-soft">{description}</p>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {title} {description}
      </p>
      <PlayerControls>
        {canRetry ? (
          <Button size="kid" variant="honey" onClick={onRetry}>
            <MicrophoneIcon size={34} weight="fill" aria-hidden="true" />
            Try again
          </Button>
        ) : null}
        <Button size="kid" variant="honey" onClick={onComplete}>
          <CheckCircleIcon size={30} weight="fill" aria-hidden="true" />
          A grown-up listened - I read it
        </Button>
        <Button size="kid" variant="soft" onClick={onComplete}>
          Keep going
        </Button>
      </PlayerControls>
    </section>
  );
}
