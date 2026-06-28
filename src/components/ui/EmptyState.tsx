import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

/**
 * A calm "nothing here yet" panel: a dashed-border, centered card with an
 * optional icon, a title, an optional description, and an optional action below.
 *
 * The caller supplies layout spacing (margin + padding) via `className`; the
 * static base carries the dashed-card chrome. Rendered markup is identical to
 * the inline empty-state blocks this replaces.
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "grid place-items-center rounded-xl border border-dashed border-line-strong text-center",
        className,
      )}
    >
      {icon}
      <p className="mt-3 font-display text-lg font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-ink-soft">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
