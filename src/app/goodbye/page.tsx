import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { Mascot } from "@/components/art/Mascot";
import { Button } from "@/components/ui/Button";

// PUBLIC route (outside the auth-gated groups): after an account is deleted the
// session is gone, so this must render without a session. Neutral, calm, no PII.
export const metadata: Metadata = {
  title: "Account deleted",
  // No reason to index a transient signed-out confirmation.
  robots: { index: false, follow: false },
};

/**
 * The post-account-deletion confirmation (P6 / spec §8). The parent lands here
 * signed-out after deleteAccountAction succeeds. Calm and final: confirms the
 * data is gone, with only a way back to the home page (re-login will fail — the
 * account no longer exists). No child name, no account detail — the session and
 * the data are both gone.
 */
export default function GoodbyePage() {
  return (
    <div className="surface-parent grid min-h-dvh place-items-center bg-paper px-5 py-12">
      <main className="w-full max-w-md text-center">
        <div className="mx-auto flex flex-col items-center">
          <Mascot size={108} mood="happy" />
          <span
            aria-hidden
            className="-mt-3 grid size-12 place-items-center rounded-pill border-2 border-ink/10 bg-paper-raised text-success shadow-sm"
          >
            <CheckCircleIcon weight="fill" className="size-7" />
          </span>
        </div>

        <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight">
          Your account is deleted
        </h1>
        <p className="mt-3 text-ink-soft">
          We&rsquo;ve permanently removed your account and every learner&rsquo;s data. Nothing is
          kept. Thank you for spending time with us.
        </p>

        <div className="mt-8 flex justify-center">
          <Button href="/" variant="soft" size="md">
            Back to home
          </Button>
        </div>
      </main>
    </div>
  );
}
