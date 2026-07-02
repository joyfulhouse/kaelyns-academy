"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "motion/react";
import { CheckCircleIcon, HeartIcon } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";
import { Mascot } from "@/components/art/Mascot";
import { Button } from "@/components/ui/Button";
import { AppShellKid } from "./AppShellKid";
import { useInterests } from "./useInterests";
import { speak } from "./speak";

const MAX_PICKS = 5;

/**
 * The child interest picker (spec §4.3, Task 9): big emoji chips from the
 * PARENT-OFFERED set only — never free text (§8). Tapping toggles a pick,
 * capped at 5 client-side as a gentle nudge; `setPickedInterestsAction`
 * re-validates the SAME cap + subset server-side, so this cap is a UX
 * courtesy, not the enforcement boundary. Account-mode only: guest mode has
 * no interests economy, same posture as the sticker shop.
 *
 * Follows StickerBook's structure: AppShellKid shell, a Mascot empty state
 * for "nothing to pick yet", and the loading/guest/ready state ladder driven
 * by `useInterests`' settled derivation.
 */
export function InterestPicker() {
  const router = useRouter();
  const { mode, state, settled, save } = useInterests();
  // The working pick set starts as null (not yet touched) and is seeded from
  // the server's `picked` once it settles; after the first toggle it is fully
  // local until Save. Deriving instead of syncing via effect avoids
  // `react-hooks/set-state-in-effect`.
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const reduce = useReducedMotion();

  const workingPicked = picked ?? new Set((state?.picked ?? []).map((p) => p.id));

  if (mode === "loading" || (mode === "account" && !settled)) {
    return (
      <AppShellKid backHref="/learn" readAloud="Getting your favorite things ready.">
        <div className="mx-auto flex max-w-2xl flex-col items-center pt-10 text-center">
          <Mascot mood="happy" size={64} className={reduce ? undefined : "motion-safe:animate-float"} />
          <p className="mt-6 text-base text-ink-faint">Getting your favorite things ready...</p>
        </div>
      </AppShellKid>
    );
  }

  if (mode !== "account" || !state) {
    return (
      <AppShellKid backHref="/learn" readAloud="Ask a grown-up to sign in to pick your favorite things.">
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Mascot mood="happy" size={64} />
          <p className="text-lg text-ink-soft">
            Ask a grown-up to sign in to pick your favorite things!
          </p>
        </div>
      </AppShellKid>
    );
  }

  if (state.offered.length === 0) {
    return (
      <AppShellKid backHref="/learn" readAloud="Ask a grown-up to pick some favorites with you.">
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Mascot mood="think" size={64} />
          <p className="text-lg text-ink-soft">Ask a grown-up to pick some favorites with you!</p>
        </div>
      </AppShellKid>
    );
  }

  function toggle(id: string, label: string) {
    const next = new Set(workingPicked);
    if (next.has(id)) {
      next.delete(id);
      setMessage(null);
    } else if (next.size >= MAX_PICKS) {
      setMessage("5 picked! Tap one to swap.");
      return;
    } else {
      next.add(id);
      setMessage(null);
      speak(label);
    }
    setPicked(next);
  }

  function handleSave() {
    if (saving) return;
    setSaving(true);
    void save([...workingPicked]).then((ok) => {
      setSaving(false);
      if (ok) router.back();
      else setMessage("Hmm, that didn't save. Let's try again!");
    });
  }

  return (
    <AppShellKid
      backHref="/learn"
      readAloud={`Pick your favorite things. ${state.offered.map((o) => o.label).join(", ")}.`}
    >
      <div className="mb-6 flex items-center justify-between rounded-2xl border-[3px] border-ink bg-honey/30 px-5 py-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight">My Favorite Things</h1>
        <span className="inline-flex items-center gap-1.5 rounded-pill border-2 border-ink bg-paper px-3 py-1 font-display text-lg font-semibold">
          <HeartIcon weight="fill" className="size-5 text-coral" aria-hidden />
          {workingPicked.size} / {MAX_PICKS}
        </span>
      </div>

      {message && (
        <p role="status" aria-live="polite" className="mb-4 text-center text-base text-ink-soft">
          {message}
        </p>
      )}

      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {state.offered.map((i) => {
          const has = workingPicked.has(i.id);
          return (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => toggle(i.id, i.label)}
                aria-pressed={has}
                aria-label={has ? `${i.label}, picked` : `Pick ${i.label}`}
                className={cn(
                  "relative flex min-h-11 w-full flex-col items-center gap-1 rounded-2xl border-[3px] border-ink px-2 py-3",
                  has ? "bg-accent/15" : "bg-paper/60",
                )}
              >
                {has && (
                  <CheckCircleIcon
                    weight="fill"
                    aria-hidden
                    className="absolute -right-1.5 -top-1.5 size-6 rounded-full bg-paper text-accent-deep"
                  />
                )}
                <span aria-hidden className="text-4xl">
                  {i.icon ?? "✨"}
                </span>
                <span className="text-sm font-medium text-ink-soft">{i.label}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-8 flex justify-center">
        <Button variant="primary" size="kid" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save my favorites"}
        </Button>
      </div>
    </AppShellKid>
  );
}
