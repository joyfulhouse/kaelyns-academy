import type { Metadata } from "next";
import { CompassIcon, HouseIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { Mascot } from "@/components/art/Mascot";

export const metadata: Metadata = { title: "Page not found" };

/**
 * Kid-surface 404 for the learner route group. A bad program slug calls
 * notFound() in learn/[programSlug]/page.tsx; without this, the generic global
 * 404 renders on a non-kid surface. Server component (no interactivity) wrapped
 * in `.surface-kid` for big taps + base font. Calm, encouraging copy — a missing
 * page is a small adventure — with a direct path back to the studio and home.
 */
export default function LearnerNotFound() {
  return (
    <main className="surface-kid grid min-h-dvh place-items-center bg-paper px-6 text-center">
      <div className="max-w-md">
        <Mascot mood="wave" size={140} className="mx-auto motion-safe:animate-float" />
        <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight text-ink">
          This page wandered off.
        </h1>
        <p className="mt-3 text-lg text-ink-soft">
          We looked everywhere and couldn&rsquo;t find it. No worries, let&rsquo;s head back to a
          place you know.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button href="/learn" variant="primary" size="kid">
            <CompassIcon weight="bold" aria-hidden="true" />
            Go to the studio
          </Button>
          <Button href="/" variant="soft" size="kid">
            <HouseIcon weight="bold" aria-hidden="true" />
            Take me home
          </Button>
        </div>
      </div>
    </main>
  );
}
