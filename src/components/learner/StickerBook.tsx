"use client";

import { useState } from "react";
import { useReducedMotion } from "motion/react";
import { ArrowClockwiseIcon, StarIcon } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";
import { Mascot } from "@/components/art/Mascot";
import { Button } from "@/components/ui/Button";
import type { PurchaseResult } from "@/lib/rewards/stickers";
import { AppShellKid } from "./AppShellKid";
import { useActiveLearner } from "./learners";
import { useLearnerState } from "./useLearnerState";
import { useRewards } from "./useRewards";
import { AccountSessionError } from "./AccountSessionError";

type PurchaseReason = Extract<PurchaseResult, { ok: false }>["reason"];

const REASON_COPY: Record<PurchaseReason, string> = {
  insufficient: "Not enough stars yet — keep playing!",
  already_owned: "You already have this one!",
  not_found: "That sticker isn't here right now.",
  error: "Hmm, try again in a moment.",
};

/**
 * The sticker shop (spec §3.7): account-mode only economy UI. Guest mode has
 * no stars/stickers, so it renders a calm "ask a grown-up" state instead of
 * ever calling the rewards actions. Prices are always visible and stickers
 * never reorder themselves — no dark patterns, no randomness (spec §4.2, §13).
 */
export function StickerBook({ programSlug }: { programSlug: string }) {
  // Same active-learner seam as StudioHome/UnitView: the guest mock-learner id
  // drives guest mode, while `mode`/`selectedLearnerId` from useLearnerState
  // report the real account learner once a household is signed in.
  const { learner } = useActiveLearner();
  const learnerState = useLearnerState(learner.id, programSlug);
  const { mode, selectedLearnerId } = learnerState;
  const { state, settled, refresh, purchase } = useRewards(
    mode === "account" ? selectedLearnerId : null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const reduce = useReducedMotion();

  if (mode === "error") {
    return <AccountSessionError backHref={`/learn/${programSlug}`} retry={learnerState.retrySession} />;
  }

  // While the session resolves, OR while a confirmed account learner's rewards
  // fetch hasn't settled yet, show a calm loading beat — same posture as
  // StudioHome's ResolvingSurface — rather than flashing the guest "ask a
  // grown-up" message at a signed-in household before `state` arrives.
  if (mode === "loading" || (mode === "account" && !state && !settled)) {
    return (
      <AppShellKid backHref={`/learn/${programSlug}`} readAloud="Getting your sticker book ready.">
        <div className="mx-auto flex max-w-2xl flex-col items-center pt-10 text-center">
          <Mascot mood="happy" size={64} className={reduce ? undefined : "motion-safe:animate-float"} />
          <p className="mt-6 text-base text-ink-faint">Getting your sticker book ready...</p>
        </div>
      </AppShellKid>
    );
  }

  // The fetch settled but never produced state — a transient failure
  // (getRewardsStateAction swallows errors into signedIn:false, which the
  // hook maps to state:null). Never strand a signed-in child on the loading
  // beat forever: offer a real retry instead.
  if (mode === "account" && !state && settled) {
    return (
      <AppShellKid backHref={`/learn/${programSlug}`} readAloud="Your sticker book is hiding. Let's try again.">
        <div className="mx-auto flex max-w-2xl flex-col items-center pt-10 text-center">
          <Mascot mood="think" size={64} />
          <p className="mt-6 text-lg text-ink-soft">
            Hmm, your sticker book is hiding. Let&rsquo;s try again!
          </p>
          <Button type="button" onClick={() => refresh()} variant="soft" size="kid" className="mt-6">
            <ArrowClockwiseIcon weight="bold" className="size-6" />
            Try again
          </Button>
        </div>
      </AppShellKid>
    );
  }

  if (!state) {
    return (
      <AppShellKid backHref={`/learn/${programSlug}`} readAloud="Your sticker book.">
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Mascot mood="happy" size={64} />
          <p className="text-lg text-ink-soft">Ask a grown-up to sign in to collect stickers!</p>
        </div>
      </AppShellKid>
    );
  }

  const owned = new Set(state.ownedStickerIds);
  return (
    <AppShellKid
      backHref={`/learn/${programSlug}`}
      readAloud={`Your sticker book. You have ${state.balance} stars to spend. Tap a sticker to get it.`}
    >
      <div className="mb-6 flex items-center justify-between rounded-2xl border-[3px] border-ink bg-honey/30 px-5 py-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Sticker Book</h1>
        <span className="inline-flex items-center gap-1.5 rounded-pill border-2 border-ink bg-paper px-3 py-1 font-display text-lg font-semibold">
          <StarIcon weight="fill" className="size-5 text-honey" aria-hidden />
          {state.balance}
        </span>
      </div>
      {message && (
        <p role="status" aria-live="polite" className="mb-4 text-center text-base text-ink-soft">
          {message}
        </p>
      )}
      {state.catalog.map((pack) => (
        <section key={pack.id} className="mb-8">
          <h2 className="mb-3 font-display text-xl font-semibold">{pack.title}</h2>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {pack.stickers.map((s) => {
              const emoji = s.artRef.startsWith("emoji:") ? s.artRef.slice(6) : "❓";
              const has = owned.has(s.id);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={has}
                    onClick={() => {
                      void purchase(s.id).then((r) => {
                        setMessage(r.ok ? `You got ${s.title}!` : REASON_COPY[r.reason]);
                      });
                    }}
                    className={cn(
                      "flex min-h-24 w-full flex-col items-center gap-1 rounded-2xl border-[3px] border-ink px-2 py-3",
                      has ? "bg-paper" : "bg-paper/60",
                    )}
                    aria-label={
                      has ? `${s.title}, collected` : `Get ${s.title} for ${s.starCost} stars`
                    }
                  >
                    <span aria-hidden className={cn("text-4xl", !has && "opacity-35 grayscale")}>
                      {emoji}
                    </span>
                    <span className="text-sm font-medium text-ink-soft">{s.title}</span>
                    {!has && (
                      <span className="inline-flex items-center gap-1 text-sm font-semibold">
                        <StarIcon weight="fill" className="size-4 text-honey" aria-hidden />
                        {s.starCost}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </AppShellKid>
  );
}
