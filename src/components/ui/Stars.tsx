import { cn } from "@/lib/cn";

const STAR_PATH =
  "M12 2.2l2.9 6.2 6.8.7c.6.1.9.9.4 1.3l-5.1 4.6 1.4 6.7c.1.6-.5 1.1-1.1.8L12 19.2 5.9 22.5c-.5.3-1.2-.2-1.1-.8l1.4-6.7-5.1-4.6c-.5-.4-.2-1.2.4-1.3l6.8-.7L12 2.2z";

const SIZE = { sm: 18, md: 26, lg: 40 } as const;

/** Earned-star rating. Filled = honey with the storybook ink outline.
 *  Presentational + server-safe; award animation is applied by the caller. */
export function Stars({
  value,
  max = 3,
  size = "md",
  className,
}: {
  value: number;
  max?: number;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const px = SIZE[size];
  return (
    <span
      className={cn("inline-flex items-center gap-1", className)}
      role="img"
      aria-label={`${value} of ${max} stars`}
    >
      {Array.from({ length: max }, (_, i) => {
        const filled = i < value;
        return (
          <svg
            key={i}
            width={px}
            height={px}
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={filled ? "text-ink" : "text-ink/25"}
          >
            <path
              d={STAR_PATH}
              fill={filled ? "var(--color-honey)" : "var(--color-paper-sunk)"}
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinejoin="round"
            />
          </svg>
        );
      })}
    </span>
  );
}
