import type { Metadata } from "next";
import { CompassIcon, HouseIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { KidMessagePanel } from "@/components/boundaries/KidMessagePanel";

export const metadata: Metadata = { title: "Page not found" };

/**
 * Kid-friendly 404. Server component (no interactivity needed) rendered inside
 * the root layout. Reuses the shared KidMessagePanel on the plain root surface.
 * Calm, encouraging copy — a missing page is a small adventure, not a failure —
 * with a clear way home and a direct path back to the studio, so a child who
 * lands here is never stranded on the marketing site.
 */
export default function NotFound() {
  return (
    <KidMessagePanel
      mood="wave"
      title="This page wandered off."
      body={
        <>
          We looked everywhere and couldn&rsquo;t find it. No worries, let&rsquo;s head back to a
          place you know.
        </>
      }
      actions={
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button href="/" variant="primary" size="lg">
            <HouseIcon weight="bold" />
            Take me home
          </Button>
          <Button href="/learn" variant="soft" size="lg">
            <CompassIcon weight="bold" />
            Go to the studio
          </Button>
        </div>
      }
    />
  );
}
