import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

/**
 * The standard parent/admin page header: a small eyebrow label, an h1 title, and
 * an optional supporting description.
 *
 * Pass `action` to switch to the split layout (title block on the left, action
 * node on the right) used by the parent home page — the slot stays rendered even
 * when the action content is conditionally hidden, so the layout is stable. Omit
 * `action` for the default stacked layout. Rendered markup is byte-for-byte
 * identical to the inline headers this replaces.
 */
export function PageHeader({ eyebrow, title, description, action, className }: PageHeaderProps) {
  if (action !== undefined) {
    return (
      <header className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
        <div>
          <p className="font-display text-sm font-semibold text-ink-faint">{eyebrow}</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-2 max-w-prose text-ink-soft">{description}</p>}
        </div>
        {action}
      </header>
    );
  }

  return (
    <header className={className}>
      <p className="font-display text-sm font-semibold text-ink-faint">{eyebrow}</p>
      <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="mt-2 max-w-prose text-ink-soft">{description}</p>}
    </header>
  );
}
