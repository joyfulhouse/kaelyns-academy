import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

type Deco = { className?: string; style?: CSSProperties };

/** Decorative organic motifs. All aria-hidden; accent/honey tinted. */

export function Sun({ className, style }: Deco) {
  return (
    <svg viewBox="0 0 100 100" className={cn("text-honey", className)} style={style} aria-hidden="true">
      <circle cx={50} cy={50} r={22} fill="currentColor" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * 30 * Math.PI) / 180;
        const x1 = 50 + Math.cos(a) * 30;
        const y1 = 50 + Math.sin(a) * 30;
        const x2 = 50 + Math.cos(a) * 40;
        const y2 = 50 + Math.sin(a) * 40;
        return (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth={5} strokeLinecap="round" />
        );
      })}
    </svg>
  );
}

export function Hills({ className, style }: Deco) {
  return (
    <svg viewBox="0 0 1440 220" preserveAspectRatio="none" className={cn("text-accent", className)} style={style} aria-hidden="true">
      <path d="M0 220 V120 Q240 40 480 110 T960 110 T1440 90 V220 Z" fill="currentColor" opacity={0.18} />
      <path d="M0 220 V160 Q300 90 620 150 T1200 150 T1440 140 V220 Z" fill="currentColor" opacity={0.28} />
    </svg>
  );
}

export function Waves({ className, style }: Deco) {
  return (
    <svg viewBox="0 0 1440 120" preserveAspectRatio="none" className={cn("text-accent", className)} style={style} aria-hidden="true">
      <path d="M0 60 Q120 10 240 60 T480 60 T720 60 T960 60 T1200 60 T1440 60 V120 H0 Z" fill="currentColor" opacity={0.25} />
      <path d="M0 80 Q120 40 240 80 T480 80 T720 80 T960 80 T1200 80 T1440 80 V120 H0 Z" fill="currentColor" opacity={0.4} />
    </svg>
  );
}

export function Sparkle({ className, style }: Deco) {
  return (
    <svg viewBox="0 0 24 24" className={cn("text-honey", className)} style={style} aria-hidden="true">
      <path
        d="M12 1c.6 5.4 4.6 9.4 10 10 -5.4.6-9.4 4.6-10 10 -.6-5.4-4.6-9.4-10-10C7.4 10.4 11.4 6.4 12 1Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function Blob({ className, style }: Deco) {
  return (
    <svg viewBox="0 0 200 200" className={cn("text-accent", className)} style={style} aria-hidden="true">
      <path
        fill="currentColor"
        d="M44 -64C58 -54 72 -44 78 -30C84 -16 82 2 75 17C68 33 56 46 42 56C27 65 9 71 -8 70C-26 68 -45 60 -58 46C-71 32 -78 13 -76 -5C-74 -22 -63 -38 -49 -50C-35 -62 -18 -69 0 -69C17 -69 35 -68 44 -64Z"
        transform="translate(100 100)"
      />
    </svg>
  );
}
