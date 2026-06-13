"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { Stars } from "@/components/ui/Stars";
import { Mascot } from "@/components/art/Mascot";
import { useReducedMotion } from "./useReducedMotion";

const SPARKLE_POSITIONS = [
  { x: -60, y: -40 },
  { x: 64, y: -32 },
  { x: -44, y: 36 },
  { x: 52, y: 44 },
  { x: 0, y: -72 },
] as const;

/**
 * The earned-reward moment shown when an activity completes: Mascot cheering,
 * a star-pop (scale .6→1 + fade, ease-out, NO bounce — DESIGN.md §4), a one-shot
 * sparkle burst, and a "keep going" button. Reduced-motion collapses all
 * movement to instant opacity. An aria-live region announces the stars.
 */
export function RewardOverlay({
  stars,
  message,
  onContinue,
  continueLabel = "Keep going",
}: {
  stars: 0 | 1 | 2 | 3;
  message: string;
  onContinue: () => void;
  continueLabel?: string;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className="grid place-items-center gap-6 py-8 text-center"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0.001 : 0.24, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="relative grid place-items-center">
        <motion.div
          initial={reduced ? { opacity: 0 } : { scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: reduced ? 0.001 : 0.42, ease: [0.16, 1, 0.3, 1] }}
        >
          <Mascot mood="cheer" size={132} />
        </motion.div>

        {!reduced && (
          <AnimatePresence>
            {SPARKLE_POSITIONS.map((pos, i) => (
              <motion.span
                key={i}
                aria-hidden="true"
                className="pointer-events-none absolute text-honey"
                initial={{ scale: 0.2, opacity: 0, x: 0, y: 0 }}
                animate={{ scale: 1, opacity: [0, 1, 0], x: pos.x, y: pos.y }}
                transition={{ duration: 0.7, delay: 0.1 + i * 0.04, ease: [0.16, 1, 0.3, 1] }}
              >
                <SparkleGlyph />
              </motion.span>
            ))}
          </AnimatePresence>
        )}
      </div>

      <motion.div
        initial={reduced ? { opacity: 0 } : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: reduced ? 0.001 : 0.42, delay: reduced ? 0 : 0.12, ease: [0.16, 1, 0.3, 1] }}
      >
        <Stars value={stars} size="lg" />
      </motion.div>

      <p className="max-w-sm font-display text-2xl text-ink" aria-hidden="true">
        {message}
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {message} You earned {stars} {stars === 1 ? "star" : "stars"}.
      </p>

      <Button size="kid" variant="primary" onClick={onContinue}>
        {continueLabel}
        <ArrowRightIcon weight="bold" aria-hidden="true" />
      </Button>
    </motion.div>
  );
}

/** Small four-point sparkle used in the reward burst. */
function SparkleGlyph() {
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 1l2.4 7.6L22 11l-7.6 2.4L12 21l-2.4-7.6L2 11l7.6-2.4L12 1z"
        fill="var(--color-honey)"
        stroke="var(--color-ink)"
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
    </svg>
  );
}
