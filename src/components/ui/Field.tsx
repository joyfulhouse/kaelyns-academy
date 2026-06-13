import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Calm parent/auth field wrapper (DESIGN.md §5): a clear label, optional hint,
 * the control, and a reserved error slot. Associates label + description +
 * error with the control by id so screen readers announce them. The control is
 * passed `id`, `aria-describedby`, and `aria-invalid` via render-prop so callers
 * never have to wire ARIA by hand.
 */
export function Field({
  id,
  label,
  hint,
  error,
  optional,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  className?: string;
  children: (props: {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
  }) => ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-ink">{label}</span>
        {optional && (
          <span className="text-xs font-normal text-ink-faint">optional</span>
        )}
      </label>

      {hint && (
        <p id={hintId} className="text-xs text-ink-faint">
          {hint}
        </p>
      )}

      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })}

      {error && (
        <p id={errorId} role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
