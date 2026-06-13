import type { ReactNode } from "react";
import { CircleDashedIcon, CircleHalfIcon, CheckCircleIcon } from "@phosphor-icons/react/dist/ssr";
import type { PillTone } from "@/components/ui/Pill";
import type { SkillOutcome } from "@/content";

/**
 * Presentation for a skill outcome. Color is never the only signal: each state
 * pairs a tint with a distinct icon + word (DESIGN.md §1/§7). "not_yet" reads
 * as neutral, never as failure (PRODUCT.md: no red Xs).
 */
interface OutcomeDisplay {
  label: string;
  tone: PillTone;
  icon: ReactNode;
}

const OUTCOME: Record<SkillOutcome, OutcomeDisplay> = {
  solid: {
    label: "Solid",
    tone: "success",
    icon: <CheckCircleIcon weight="fill" className="size-4 text-success" />,
  },
  emerging: {
    label: "Emerging",
    tone: "ready",
    icon: <CircleHalfIcon weight="fill" className="size-4 text-honey-deep" />,
  },
  not_yet: {
    label: "Not yet",
    tone: "neutral",
    icon: <CircleDashedIcon weight="regular" className="size-4 text-ink-faint" />,
  },
};

export function outcomeDisplay(outcome: SkillOutcome): OutcomeDisplay {
  return OUTCOME[outcome];
}

/** Maps an outcome to a 0..1 progress weight for domain rings (solid=1, emerging=0.5). */
export function outcomeWeight(outcome: SkillOutcome): number {
  if (outcome === "solid") return 1;
  if (outcome === "emerging") return 0.5;
  return 0;
}
