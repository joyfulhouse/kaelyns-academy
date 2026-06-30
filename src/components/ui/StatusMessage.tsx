import type { ReactNode } from "react";
import { CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";

export type StatusTone = "success" | "error";

/**
 * The success / error status badge shared across the parent + admin forms: an
 * inline-flex line with a tone icon and a short message. Replaces the ~19
 * hand-rolled copies of `inline-flex items-center gap-1.5 text-sm font-medium`
 * + `text-success`/`text-danger` + `CheckCircleIcon`/`WarningCircleIcon`.
 *
 * Tone drives three things through static maps (Tailwind JIT-safe — never a
 * constructed class string):
 *  - text color (`text-success` / `text-danger`),
 *  - ARIA role — success announces politely (`role="status"`), error assertively
 *    (`role="alert"`); this matches every call site that was replaced, and
 *  - the leading icon (filled check for success, warning circle for error).
 *
 * Callers add layout spacing (e.g. `mt-1`) via `className`; it composes onto the
 * static base.
 */
const TONE_TEXT: Record<StatusTone, string> = {
  success: "text-success",
  error: "text-danger",
};

const TONE_ROLE: Record<StatusTone, "status" | "alert"> = {
  success: "status",
  error: "alert",
};

export function StatusMessage({
  tone,
  className,
  children,
}: {
  tone: StatusTone;
  className?: string;
  children: ReactNode;
}) {
  const Icon = tone === "success" ? CheckCircleIcon : WarningCircleIcon;
  return (
    <span
      role={TONE_ROLE[tone]}
      className={cn(
        "inline-flex items-center gap-1.5 text-sm font-medium",
        TONE_TEXT[tone],
        className,
      )}
    >
      <Icon weight={tone === "success" ? "fill" : "regular"} className="size-4" />
      {children}
    </span>
  );
}
