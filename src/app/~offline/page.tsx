import type { Metadata } from "next";
import { Mascot } from "@/components/art/Mascot";

export const metadata: Metadata = { title: "Offline" };

// Static, no-auth, no DB. Precached and served as the offline document fallback.
export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6 text-center">
      <div className="max-w-sm">
        <Mascot mood="think" size={140} className="mx-auto" />
        <h1 className="mt-6 font-display text-2xl font-semibold text-ink">You&rsquo;re offline</h1>
        <p className="mt-3 text-ink-soft">
          Kaelyn&rsquo;s Academy needs the internet for lessons. Reconnect and we&rsquo;ll pick up
          right where you left off.
        </p>
      </div>
    </main>
  );
}
