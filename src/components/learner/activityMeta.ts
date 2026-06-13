import {
  GridFourIcon,
  HandTapIcon,
  NotePencilIcon,
  PuzzlePieceIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { ActivityKind } from "@/content";

/** The program this learner surface renders (single pilot program for v3). */
export const PROGRAM_SLUG = "summer-k-to-grade1";

/**
 * Per-kind icon + short kid-facing label. The child reads the *icon* first, so
 * each activity kind has a distinct, friendly glyph; the word is secondary.
 */
export const ACTIVITY_META: Record<ActivityKind, { icon: Icon; label: string }> = {
  "phonics-wordbuild": { icon: PuzzlePieceIcon, label: "Build a word" },
  "sightword-game": { icon: HandTapIcon, label: "Word hunt" },
  "math-tenframe": { icon: GridFourIcon, label: "Count it" },
  "journal-prompt": { icon: NotePencilIcon, label: "Draw & tell" },
};
