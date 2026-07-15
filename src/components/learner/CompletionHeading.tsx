"use client";

import { useEffect, useRef, type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

/** Stable focus target for saving, reward, and retry phase replacements. */
export function CompletionHeading({
  className,
  ...props
}: ComponentPropsWithoutRef<"h1">) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <h1
      {...props}
      ref={headingRef}
      tabIndex={-1}
      className={cn(
        "outline-none focus-visible:ring-4 focus-visible:ring-honey-deep",
        className,
      )}
    />
  );
}
