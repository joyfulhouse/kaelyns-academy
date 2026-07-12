"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import { Mascot } from "@/components/art/Mascot";
import { Button } from "@/components/ui/Button";
import { AppShellKid } from "./AppShellKid";

export function AccountSessionError({
  backHref,
  retry,
}: {
  backHref: string;
  retry: () => Promise<void>;
}) {
  return (
    <AppShellKid backHref={backHref} readAloud="Your studio is hiding. Let's try again.">
      <div className="mx-auto flex max-w-2xl flex-col items-center pt-10 text-center">
        <Mascot mood="think" size={72} />
        <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight">
          Your studio is hiding
        </h1>
        <p className="mt-3 text-lg text-ink-soft">Your saved work is safe. Let&rsquo;s try again!</p>
        <Button
          type="button"
          onClick={() => void retry()}
          variant="soft"
          size="kid"
          className="mt-6"
        >
          <ArrowClockwiseIcon weight="bold" className="size-6" />
          Try again
        </Button>
      </div>
    </AppShellKid>
  );
}
