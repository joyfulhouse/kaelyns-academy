import { cn } from "@/lib/cn";

export type MascotMood = "happy" | "cheer" | "think" | "wave";

const STAR =
  "M60 9 L74.1 40.6 L107.6 44.6 L82.8 67.4 L89.4 100.5 L60 84 L30.6 100.5 " +
  "L37.2 67.4 L12.4 44.6 L45.9 40.6 Z";

/** "Twinkle" — the Wonder Studio star-sprite. Honey body, storybook ink outline. */
export function Mascot({
  mood = "happy",
  size = 120,
  className,
  title = "Twinkle, the Kaelyn's Academy star",
}: {
  mood?: MascotMood;
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      className={cn("overflow-visible", className)}
      role="img"
      aria-label={title}
    >
      <path
        d={STAR}
        fill="var(--color-honey)"
        stroke="var(--color-ink)"
        strokeWidth={4}
        strokeLinejoin="round"
      />
      {/* cheeks */}
      <circle cx={43} cy={66} r={5} fill="var(--color-coral)" opacity={0.55} />
      <circle cx={77} cy={66} r={5} fill="var(--color-coral)" opacity={0.55} />

      {/* eyes */}
      {mood === "cheer" ? (
        <>
          <path d="M44 56 q5 -6 10 0" fill="none" stroke="var(--color-ink)" strokeWidth={4} strokeLinecap="round" />
          <path d="M66 56 q5 -6 10 0" fill="none" stroke="var(--color-ink)" strokeWidth={4} strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx={49} cy={56} r={4.2} fill="var(--color-ink)" />
          <circle cx={71} cy={56} r={4.2} fill="var(--color-ink)" />
        </>
      )}

      {/* mouth */}
      {mood === "think" ? (
        <circle cx={60} cy={70} r={4} fill="none" stroke="var(--color-ink)" strokeWidth={3.5} />
      ) : mood === "cheer" ? (
        <path d="M50 68 q10 14 20 0 q-10 6 -20 0 Z" fill="var(--color-ink)" />
      ) : (
        <path
          d="M51 68 q9 9 18 0"
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth={4}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
