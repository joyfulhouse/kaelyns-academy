import { cn } from "@/lib/cn";

/**
 * A single pulse-skeleton bar (rounded, sunk fill). The caller supplies the
 * height/width/offset via `className`; the animated pulse lives on the wrapping
 * header so a run of bars pulses together. Used by the parent loading skeletons.
 */
export function SkeletonBar({ className }: { className?: string }) {
  return <div className={cn(className, "rounded bg-paper-sunk")} />;
}

/**
 * The calm two-column grid of placeholder cards shared by the parent dashboard
 * and curriculum loading skeletons. `aria-hidden` (the surrounding `role="status"`
 * carries the announcement); keeps its own `motion-safe:animate-pulse`.
 */
export function SkeletonCardGrid() {
  return (
    <div
      className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 motion-safe:animate-pulse"
      aria-hidden
    >
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-40 rounded-xl border border-line bg-paper-sunk" />
      ))}
    </div>
  );
}
