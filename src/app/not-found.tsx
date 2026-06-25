import type { Metadata } from "next";
import { CompassIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { Mascot } from "@/components/art/Mascot";

export const metadata: Metadata = { title: "Page not found" };

/**
 * Kid-friendly 404. Server component (no interactivity needed) rendered inside
 * the root layout. Calm, encouraging copy — a missing page is a small adventure,
 * not a failure — with a single clear way back home.
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
        <div className="mt-8 flex justify-center">
          <Button href="/" variant="primary" size="lg">
            <CompassIcon weight="bold" />
            Take me home
          </Button>
        </div>
      </div>
    </main>
  );
}
