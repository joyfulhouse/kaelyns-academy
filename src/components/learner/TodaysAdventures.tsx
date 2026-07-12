"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { CheckCircleIcon, CompassIcon, StarIcon } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";
import type { QuestView } from "@/lib/quests/store";
import { activateOfferedQuest } from "./questStart";

/**
 * Today's Adventures (spec §4.1): the daily quest board. One row per quest —
 * offered (a big tappable "I'll do this one!" invite), active (progress dots
 * + a warm honey highlight — the app's existing reward-highlight color, same
 * vocabulary as the map's star badges/banner rather than a new glow effect),
 * done (checked, celebratory star count with a scale-in on completion).
 *
 * Forgiving posture (spec §4.1): no timers, no penalties, nothing locked
 * behind a quest — this only ever ADDS a warm nudge on top of free play.
 * StudioHome only renders this when `quests` is non-null/non-empty; guests
 * and quest-less days keep the existing single-pick NextThingCard.
 */
export function TodaysAdventures({
  quests,
  onActivate,
  hrefForQuest,
  reduce,
}: {
  quests: QuestView[];
  onActivate: (id: string) => Promise<void>;
  hrefForQuest: (quest: QuestView) => string | null;
  reduce: boolean;
}) {
  const router = useRouter();
  // In-flight guard (same idiom as InterestPicker's `saving`): a child
  // double-tapping "I'll do this one!" before the activate round-trip
  // resolves would otherwise fire onActivate twice. Keyed per-quest so
  // other offered quests stay tappable while one is settling.
  const [pendingId, setPendingId] = useState<string | null>(null);

  function handleStart(id: string, status: QuestView["status"], href: string | null) {
    if (pendingId) return;
    if (!href) return;
    if (status === "active") {
      router.push(href);
      return;
    }
    setPendingId(id);
    void activateOfferedQuest({
      id,
      href,
      activate: onActivate,
      navigate: (destination) => router.push(destination),
    }).finally(() => setPendingId(null));
  }

  const doneMotionProps = reduce
    ? {}
    : {
        initial: { opacity: 0, scale: 0.85 },
        animate: { opacity: 1, scale: 1 },
        transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] as const },
      };

  return (
    <section
      aria-label="Today's adventures"
      className="mb-8 rounded-2xl border-[3px] border-ink bg-paper px-5 py-4"
    >
      <h2 className="mb-3 inline-flex items-center gap-2 font-display text-xl font-semibold">
        <CompassIcon weight="bold" className="size-6" aria-hidden />
        Today&apos;s Adventures
      </h2>
      <ul className="flex flex-col gap-2">
        {quests.map((q) => {
          const href = hrefForQuest(q);
          return (
          <li key={q.id}>
            {q.status === "done" ? (
              <motion.div
                {...doneMotionProps}
                role="status"
                aria-label={`${q.title}, done! You earned ${q.rewardStars} stars.`}
                className="flex min-h-24 items-center gap-3 rounded-xl border-2 border-ink/20 bg-honey/20 px-4 py-3"
              >
                <CheckCircleIcon weight="fill" className="size-7 shrink-0 text-ink" aria-hidden />
                <span aria-hidden className="flex-1 truncate font-medium">
                  {q.title}
                </span>
                <span
                  aria-hidden
                  className="inline-flex shrink-0 items-center gap-1 font-display font-semibold"
                >
                  +{q.rewardStars}
                  <StarIcon weight="fill" className="size-4 text-honey" />
                </span>
              </motion.div>
            ) : href ? (
              <a
                href={href}
                onClick={(event) => {
                  event.preventDefault();
                  handleStart(q.id, q.status, href);
                }}
                aria-disabled={pendingId !== null}
                aria-label={
                  q.status === "active"
                    ? `${q.title}. Continue. ${q.progress.done} of ${q.target.count} done. Reward ${q.rewardStars} stars.`
                    : `${q.title}. Start. Reward ${q.rewardStars} stars.`
                }
                className={cn(
                  "flex min-h-24 w-full items-center gap-3 rounded-xl border-2 px-4 py-4 text-left transition",
                  pendingId !== null && "pointer-events-none opacity-60",
                  q.status === "active"
                    ? "border-ink bg-honey/30 shadow-pop"
                    : "border-ink/30 bg-paper active:translate-y-1 active:shadow-none motion-safe:hover:-translate-y-0.5",
                )}
              >
                <span aria-hidden className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{q.title}</span>
                  {q.status === "offered" && (
                    <span className="block text-sm font-semibold text-accent-deep">
                      Start
                    </span>
                  )}
                  {q.status === "active" && (
                    <span className="block text-sm font-semibold text-accent-deep">Continue</span>
                  )}
                </span>
                <span aria-hidden className="flex shrink-0 gap-1">
                  {Array.from({ length: q.target.count }, (_, i) => (
                    <span
                      key={i}
                      className={cn(
                        "size-3 rounded-full border-2 border-ink",
                        i < q.progress.done ? "bg-honey" : "bg-paper",
                      )}
                    />
                  ))}
                </span>
                <span
                  aria-hidden
                  className="inline-flex shrink-0 items-center gap-1 font-display text-sm font-semibold text-ink-soft"
                >
                  +{q.rewardStars}
                  <StarIcon weight="fill" className="size-4 text-honey" />
                </span>
              </a>
            ) : (
              <div className="flex min-h-24 w-full items-center rounded-xl border-2 border-ink/20 bg-paper-sunk px-4 py-4 text-left text-ink-soft">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{q.title}</span>
                  <span className="block text-sm">Saved for later</span>
                </span>
              </div>
            )}
          </li>
          );
        })}
      </ul>
    </section>
  );
}
