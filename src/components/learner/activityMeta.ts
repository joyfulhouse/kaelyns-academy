import {
  BookOpenTextIcon,
  ClockIcon,
  CoinIcon,
  DotsNineIcon,
  GridFourIcon,
  HandTapIcon,
  ListNumbersIcon,
  MicrophoneIcon,
  NotePencilIcon,
  PuzzlePieceIcon,
  RulerIcon,
  SpeakerHighIcon,
  SquareHalfIcon,
  StackIcon,
  TranslateIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { ActivityKind } from "@/content";

/**
 * Per-kind icon + short kid-facing label. The child reads the *icon* first, so
 * each activity kind has a distinct, friendly glyph; the word is secondary.
 */
export const ACTIVITY_META: Record<ActivityKind, { icon: Icon; label: string }> = {
  "phonics-wordbuild": { icon: PuzzlePieceIcon, label: "Build a word" },
  "sightword-game": { icon: HandTapIcon, label: "Word hunt" },
  "math-tenframe": { icon: GridFourIcon, label: "Count it" },
  "journal-prompt": { icon: NotePencilIcon, label: "Draw & tell" },
  "reading-comprehension": { icon: BookOpenTextIcon, label: "Read & think" },
  "math-array": { icon: DotsNineIcon, label: "Make an array" },
  "math-fraction-bar": { icon: SquareHalfIcon, label: "Make equal parts" },
  "lang-symbol-intro": { icon: TranslateIcon, label: "Meet the symbols" },
  "lang-listen-match": { icon: SpeakerHighIcon, label: "Listen & find" },
  "math-clock": { icon: ClockIcon, label: "Tell the time" },
  "math-money": { icon: CoinIcon, label: "Count money" },
  "math-measure": { icon: RulerIcon, label: "Measure & compare" },
  "sort-categories": { icon: StackIcon, label: "Sort" },
  "seq-order": { icon: ListNumbersIcon, label: "Order" },
  "oral-reading": { icon: MicrophoneIcon, label: "Read it out loud" },
};
