import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Arc tones. The accent fill reads fine on large dashboard rings; a ring
 *  that must be legible AS the indicator (not just decorate a numeral) needs
 *  the deep variant — accent-on-sunk measures ~1.6:1, under WCAG 1.4.11's 3:1. */
const ARC_TONE = {
  accent: "var(--color-accent)",
  "accent-deep": "var(--color-accent-deep)",
} as const;

/** Circular progress. Track = paper-sunk, fill = program accent. */
export function ProgressRing({
  value,
  size = 72,
  stroke = 8,
  className,
  children,
  label,
  tone = "accent",
}: {
  /** 0..1 */
  value: number;
  size?: number;
  stroke?: number;
  className?: string;
  children?: ReactNode;
  label?: string;
  tone?: keyof typeof ARC_TONE;
}) {
  const clamped = Math.max(0, Math.min(1, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped);
  return (
    <div
      className={cn("relative inline-grid place-items-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `${Math.round(clamped * 100)} percent complete`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-paper-sunk)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={ARC_TONE[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset var(--dur-slow) var(--ease-out-expo)" }}
        />
      </svg>
      {children != null && (
        <span className="absolute inset-0 grid place-items-center">{children}</span>
      )}
    </div>
  );
}
