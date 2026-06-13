"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * Calm parent toggle (DESIGN.md §5). A real <button role="switch"> for full
 * keyboard + screen-reader support; color is never the only signal (the knob
 * position and the on/off track both change). Optional label + description make
 * it a self-contained settings row.
 */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const labelId = label ? `${id}-label` : undefined;
  const descId = description ? `${id}-desc` : undefined;

  const toggle = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      aria-describedby={descId}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-pill border transition-colors duration-200 ease-out-quart",
        "disabled:pointer-events-none disabled:opacity-50",
        checked ? "border-accent-deep bg-accent-deep" : "border-line-strong bg-paper-sunk",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block size-5 rounded-pill bg-paper shadow-sm transition-transform duration-200 ease-out-quart",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );

  if (!label) {
    return <span className={className}>{toggle}</span>;
  }

  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <span className="flex flex-col gap-0.5">
        <span id={labelId} className="text-sm font-medium text-ink">
          {label}
        </span>
        {description && (
          <span id={descId} className="text-sm text-ink-soft">
            {description}
          </span>
        )}
      </span>
      {toggle}
    </div>
  );
}
