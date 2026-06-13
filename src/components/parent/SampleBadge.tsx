import { InfoIcon } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";

/**
 * Honest "this is illustrative, not measured" marker. Used wherever the parent
 * surface shows progress/skill data that is not yet persisted (no attempt DB).
 * Never decorate real telemetry with this once it lands.
 */
export function SampleBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill border border-line bg-paper-sunk px-2 py-0.5 text-xs font-medium text-ink-soft",
        className,
      )}
    >
      <InfoIcon weight="regular" className="size-3.5" />
      Sample
    </span>
  );
}
