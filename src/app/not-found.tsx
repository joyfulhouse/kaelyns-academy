import type { Metadata } from "next";
import { CompassIcon, HouseIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { Mascot } from "@/components/art/Mascot";

export const metadata: Metadata = { title: "Page not found" };

/**
 * Kid-friendly 404. Server component (no interactivity needed) rendered inside
 * the root layout. Calm, encouraging copy — a missing page is a small adventure,
 * not a failure — with a clear way home and a direct path back to the studio, so
 * a child who lands here is never stranded on the marketing site.
 */
export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6 text-center">
      <div className="max-w-md">
        <Mascot mood="wave" size={140} className="mx-auto motion-safe:animate-float" />
        <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight text-ink">
          This page wandered off.
        </h1>
        <p className="mt-3 text-lg text-ink-soft">
          We looked everywhere and couldn&rsquo;t find it. No worries, let&rsquo;s head back to a
          place you know.
        </p>
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
      </div>
    </main>
  );
}
