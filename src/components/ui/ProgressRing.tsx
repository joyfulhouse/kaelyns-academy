import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Circular progress. Track = paper-sunk, fill = program accent. */
export function ProgressRing({
  value,
  size = 72,
  stroke = 8,
  className,
  children,
  label,
}: {
  /** 0..1 */
  value: number;
  size?: number;
  stroke?: number;
  className?: string;
  children?: ReactNode;
  label?: string;
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
          stroke="var(--color-accent)"
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
