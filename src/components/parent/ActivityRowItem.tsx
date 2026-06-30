import { StarIcon } from "@phosphor-icons/react/dist/ssr";
import { Stars } from "@/components/ui/Stars";
import { cn } from "@/lib/cn";
import type { ActivityRow } from "@/app/(parent)/data";

export type ActivityRowSize = "sm" | "md";

// Star-box + star-icon sizes as static pairs (kept split so the rendered class
// order matches the inline rows this replaces).
const BOX: Record<ActivityRowSize, string> = {
  sm: "size-9",
  md: "size-10",
};
const ICON: Record<ActivityRowSize, string> = {
  sm: "size-4",
  md: "size-5",
};

/**
 * One recent-activity row, shared by the parent home ("Recent activity") and the
 * learner-detail ("Recent attempts") lists: a star-in-box, a truncated title
 * with its `kindLabel · when` line, and the earned {@link Stars} on the right.
 *
 * Renders the `<li>`; the caller owns the surrounding `<ul>` and passes the
 * per-list row chrome (padding / dividers) via `className`. `size` switches the
 * leading star box between the two lists. The `ActivityRow` import is type-only
 * (erased), so this stays client-safe despite that type living in the
 * server-only parent data module.
 */
export function ActivityRowItem({
  row,
  size = "md",
  className,
}: {
  row: ActivityRow;
  size?: ActivityRowSize;
  className?: string;
}) {
  return (
    <li className={cn("flex items-center gap-3", className)}>
      <span
        aria-hidden
        className={cn(
          "grid",
          BOX[size],
          "shrink-0 place-items-center rounded-md border border-line bg-paper-sunk/70 text-ink-soft",
        )}
      >
        <StarIcon weight={row.stars >= 3 ? "fill" : "regular"} className={ICON[size]} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">{row.title}</p>
        <p className="text-sm text-ink-faint">
          {row.kindLabel} · {row.when}
        </p>
      </div>
      <Stars value={row.stars} size="sm" />
    </li>
  );
}
