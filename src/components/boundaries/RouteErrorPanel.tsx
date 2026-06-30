"use client";

import type { ReactNode } from "react";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";

/**
 * Shared scaffold for the adult-surface route error boundaries (admin + parent).
 * Both render the same calm `.surface-parent` recovery card — a centered heading,
 * a reassuring line, one primary "Try again" that calls `reset()`, and the Sentry
 * digest reference — differing only in copy. Each boundary keeps its own
 * `"use client"` + `useRouteError(...)` call and passes its title/body here.
 */
export function RouteErrorPanel({
  title,
  body,
  reset,
  digest,
}: {
  title: ReactNode;
  body: ReactNode;
  reset: () => void;
  digest?: string;
}) {
  return (
    <div className="mx-auto grid max-w-md place-items-center py-16 text-center">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
        {title}
      </h1>
      <p className="mt-3 text-ink-soft">{body}</p>
      <div className="mt-8">
        <Button onClick={() => reset()} variant="primary" size="md">
          <ArrowClockwiseIcon weight="bold" className="size-4" />
          Try again
        </Button>
      </div>
      {digest && (
        <p className="mt-6 text-sm text-ink-faint">Reference: {digest}</p>
      )}
    </div>
  );
}
