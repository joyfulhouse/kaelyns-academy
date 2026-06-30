import type { Metadata } from "next";
import { CompassIcon, HouseIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { KidMessagePanel } from "@/components/boundaries/KidMessagePanel";

export const metadata: Metadata = { title: "Page not found" };

/**
 * Kid-surface 404 for the learner route group. A bad program slug calls
 * notFound() in learn/[programSlug]/page.tsx; without this, the generic global
 * 404 renders on a non-kid surface. Server component (no interactivity) reusing
 * the shared KidMessagePanel wrapped in `.surface-kid` for big taps + base font.
 * Calm, encouraging copy — a missing page is a small adventure — with a direct
 * path back to the studio and home.
 */
export default function LearnerNotFound() {
  return (
    <KidMessagePanel
      surface
      mood="wave"
      title="This page wandered off."
      body={
        <>
          We looked everywhere and couldn&rsquo;t find it. No worries, let&rsquo;s head back to a
          place you know.
        </>
      }
      actions={
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
      }
    />
  );
}
