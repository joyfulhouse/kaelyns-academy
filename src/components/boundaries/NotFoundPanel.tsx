import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Shared scaffold for the adult-surface 404 boundaries (admin + parent). Both
 * render the same quiet `.surface-parent` card — a bordered icon chip, the
 * byte-identical "We couldn't find that." heading, a short explanation, and a
 * single soft link back to safety — differing only in icon, body, and link.
 * Server component (no interactivity), matching both not-found boundaries.
 */
export function NotFoundPanel({
  icon,
  body,
  actionHref,
  actionLabel,
}: {
  icon: ReactNode;
  body: ReactNode;
  actionHref: string;
  actionLabel: ReactNode;
}) {
  return (
    <div className="mx-auto grid max-w-md place-items-center py-16 text-center">
      <span
        aria-hidden
        className="grid size-12 place-items-center rounded-md border border-line bg-paper-sunk text-ink-soft"
      >
        {icon}
      </span>
      <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight text-ink">
        We couldn&rsquo;t find that.
      </h1>
      <p className="mt-3 text-ink-soft">{body}</p>
      <div className="mt-8">
        <Button href={actionHref} variant="soft" size="md">
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}
