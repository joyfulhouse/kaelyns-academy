import { cn } from "@/lib/cn";

/** Shared id for the skip-link target. The shells put this on their <main>. */
export const MAIN_CONTENT_ID = "main-content";

/**
 * Visually-hidden "skip to main content" link that appears on keyboard focus.
 * Must be the first focusable element in a shell so keyboard/SR users can bypass
 * the header/nav (WCAG 2.4.1). Targets the shell's <main id={MAIN_CONTENT_ID}>.
 */
export function SkipLink({ className }: { className?: string }) {
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className={cn(
        "sr-only focus:not-sr-only",
        "focus:absolute focus:left-4 focus:top-3 focus:z-[60]",
        "focus:rounded-md focus:border focus:border-line focus:bg-paper-raised",
        "focus:px-4 focus:py-2 focus:text-base focus:font-medium focus:text-ink focus:shadow-md",
        className,
      )}
    >
      Skip to main content
    </a>
  );
}
