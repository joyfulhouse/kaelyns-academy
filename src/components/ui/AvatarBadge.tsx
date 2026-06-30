import { cn } from "@/lib/cn";

export type AvatarBadgeSize = "md" | "lg";

// Box + glyph sizes as static pairs (kept split so the rendered class order
// matches the inline badges this replaces, and so Tailwind keeps the utilities).
const BOX: Record<AvatarBadgeSize, string> = {
  md: "size-14",
  lg: "size-16",
};
const GLYPH: Record<AvatarBadgeSize, string> = {
  md: "text-2xl",
  lg: "text-3xl",
};

/**
 * First character of a display name, uppercased — the avatar glyph. Inlined
 * here (NOT imported from the server-only `@/app/(parent)/data` module) so this
 * stays a client-safe, purely presentational primitive. Mirrors that module's
 * `avatarInitial`.
 */
function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

/**
 * The round initial badge shown beside a learner's name. Decorative
 * (`aria-hidden`) — the readable name always sits next to it. `size` switches
 * between the dashboard tile (md) and the learner-detail header (lg).
 */
export function AvatarBadge({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: AvatarBadgeSize;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid",
        BOX[size],
        "place-items-center rounded-pill border-2 border-ink/15 bg-accent/15 font-display",
        GLYPH[size],
        "font-semibold text-ink",
        className,
      )}
    >
      {initialOf(name)}
    </span>
  );
}
