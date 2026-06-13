import type { ReactNode } from "react";
import Link from "next/link";
import {
  HeartIcon,
  LockKeyIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Mascot } from "@/components/art/Mascot";
import { Sparkle } from "@/components/art/Decorations";

const PROMISES = [
  {
    icon: ShieldCheckIcon,
    title: "No ads, no tracking on children",
    body: "We do not sell data or run ad networks. Your child is the reader here, never the product.",
  },
  {
    icon: LockKeyIcon,
    title: "Your data is yours",
    body: "We keep only a display name and birth month for each learner. Export or delete it any time.",
  },
  {
    icon: HeartIcon,
    title: "Bounded by design",
    body: "Children never free-chat with an AI. Anything a tutor generates is checked before it is shown.",
  },
];

/**
 * Auth surface frame: the parent register (calm, trustworthy). A centered card
 * column on warm paper, paired with a quiet privacy aside that does the
 * emotional work the marketing site cannot do behind a sign-in.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="surface-parent min-h-dvh bg-paper">
      <div className="mx-auto grid min-h-dvh max-w-6xl items-stretch gap-0 lg:grid-cols-[1fr_1.05fr]">
        {/* Warm aside: privacy posture (hidden on small screens) */}
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-paper-raised px-10 py-12 lg:flex">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(40rem 30rem at 110% -10%, oklch(0.8 0.135 80 / 0.22), transparent 60%)",
            }}
          />
          <Sparkle className="pointer-events-none absolute right-10 top-10 size-6 opacity-60" />

          <Link
            href="/"
            className="relative flex items-center gap-2.5"
            aria-label="Kaelyn's Academy home"
          >
            <Mascot size={38} mood="happy" />
            <span className="font-display text-xl font-semibold tracking-tight">
              Kaelyn&rsquo;s Academy
            </span>
          </Link>

          <div className="relative max-w-md">
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              A studio you can trust with your child.
            </h2>
            <ul className="mt-8 flex flex-col gap-6">
              {PROMISES.map((promise) => {
                const Icon = promise.icon;
                return (
                  <li key={promise.title} className="flex gap-3.5">
                    <Icon
                      weight="regular"
                      className="mt-0.5 size-6 shrink-0 text-accent-deep"
                    />
                    <div>
                      <h3 className="font-display text-base font-semibold">
                        {promise.title}
                      </h3>
                      <p className="mt-1 text-sm text-ink-soft">{promise.body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <p className="relative text-sm text-ink-faint">
            Built by one family, on our own hardware, with care.
          </p>
        </aside>

        {/* Form column */}
        <main className="flex flex-col items-center justify-center px-5 py-12 sm:px-10">
          <div className="w-full max-w-sm">{children}</div>
        </main>
      </div>
    </div>
  );
}
