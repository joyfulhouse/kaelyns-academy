import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type PillTone = "neutral" | "ready" | "stretch" | "accent" | "success";

const TONE: Record<PillTone, string> = {
  neutral: "bg-paper-sunk text-ink-soft",
  ready: "bg-honey/20 text-ink",
  stretch: "bg-[oklch(0.58_0.15_300_/_0.16)] text-ink",
  accent: "bg-accent/15 text-ink",
  success: "bg-success/15 text-ink",
};

export function Pill({
  tone = "neutral",
  icon,
  children,
  className,
}: {
  tone?: PillTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-sm font-medium",
        TONE[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
