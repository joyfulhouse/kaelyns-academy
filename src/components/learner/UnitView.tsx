"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  CaretRightIcon,
  FlagIcon,
  MapTrifoldIcon,
  SparkleIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { Activity, Unit } from "@/content";
import { getUnit } from "@/content";
import { ensureLessonPractice } from "@/app/(learner)/actions";
import { SHELF_LESSON_CAP } from "@/lib/tutor/shelf";
import type { ShelfItem } from "@/lib/tutor/store";
import { cn } from "@/lib/cn";
import { Mascot } from "@/components/art/Mascot";
import { Pill } from "@/components/ui/Pill";
import { Stars } from "@/components/ui/Stars";
import { Button } from "@/components/ui/Button";
import { AppShellKid } from "./AppShellKid";
import { useActiveLearner } from "./learners";
import { useLearnerState } from "./useLearnerState";
import { ACTIVITY_META } from "./activityMeta";

/**
 * A unit (the week's world): theme, big idea, phonics/math focus + project,
 * then its lessons' activities as big friendly buttons. Each activity leads
 * with its kind icon and shows earned stars. Themed by `data-world`.
 *
 * Version pinning (Fix-E Layer 2): the server passes the stable `unitKey` and a
 * best-effort `ssrUnit` (the CURRENT PUBLISHED unit, or null). We render the
 * learner's PINNED unit — `getUnit(state.program, unitKey)` — and fall back to
 * `ssrUnit` only while the pinned tree is still loading (or in guest mode, where
 * `state.program` is always null). If the key is in neither tree the unit has
 * moved out of the learner's version; we show a calm "back to the map" state
 * rather than crashing.
 */
export function UnitView({
  programSlug,
  unitKey,
  ssrUnit,
}: {
  programSlug: string;
  unitKey: string;
  ssrUnit: Unit | null;
}) {
  const reduce = useReducedMotion();
  const { learner } = useActiveLearner();
  // Stars + the resolved (version-pinned) tree come from the active surface: DB
  // in account mode, localStorage guest otherwise. The mock learner id only
  // matters in guest mode; state is scoped to the active program by its slug.
  // `mode`/`available`/`config` drive the account-mode curation gate (Fix-F A3).
  const {
    getStars,
    ready,
    program,
    mode,
    available,
    config,
    generatedShelf,
    refreshShelf,
    selectedLearnerId,
  } = useLearnerState(learner.id, programSlug);

  // Account-mode curation gate (Fix-F A3). Enforced ONLY in account mode and
  // ONLY once state has loaded (`ready`) — so guest mode is unaffected and the
  // loading beat isn't a flash-of-block. Blocked when the program isn't playable
  // (removed/paused/not-assigned → available:false) OR this unit's stable key is
  // curated out of a non-empty activeUnitKeys (closes the direct-URL hole the
  // StudioHome map already filters client-side).
  const curatedOut =
    config.activeUnitKeys !== undefined &&
    config.activeUnitKeys.length > 0 &&
    !config.activeUnitKeys.includes(unitKey);
  if (mode === "account" && ready && (!available || curatedOut)) {
    return <NotAssigned programSlug={programSlug} />;
  }

  // Resolve from the PINNED tree when it has loaded; otherwise the server's
  // published unit (guest mode / the brief account-load window). `getUnit` keys
  // on the stable authored unitKey, so the same key resolves in either tree.
  const effectiveUnit: Unit | null =
    (program ? getUnit(program, unitKey) : undefined) ?? ssrUnit;

  if (!effectiveUnit) {
    return <UnitMoved programSlug={programSlug} />;
  }
  const unit = effectiveUnit;

  const readAloud = `${unit.title}. ${unit.bigIdea} Pick something to do.`;

  // Flatten activities across lessons; the child sees one friendly list, the
  // lesson grouping is an authoring detail.
  const activities: Activity[] = unit.lessons.flatMap((l) => l.activities);

  return (
    <div data-world={unit.world}>
      <AppShellKid backHref={`/learn/${programSlug}`} readAloud={readAloud}>
        {/* World header */}
        <header className="relative mb-7 overflow-hidden rounded-2xl border-[3px] border-ink bg-accent/12 px-5 py-6">
          <div className="flex items-start gap-4">
            <span
              aria-hidden
              className="grid size-20 shrink-0 place-items-center rounded-2xl border-[3px] border-ink bg-paper text-5xl shadow-pop"
            >
              {unit.emoji}
            </span>
            <div className="min-w-0">
              <div className="font-display text-sm font-semibold text-accent-deep">
                World {unit.order}
                {unit.checkpoint ? " · check-in" : ""}
              </div>
              <h1 className="mt-0.5 font-display text-3xl font-semibold tracking-tight">
                {unit.title}
              </h1>
              <p className="mt-2 max-w-prose text-lg text-ink-soft">{unit.bigIdea}</p>
            </div>
          </div>

          <dl className="mt-5 flex flex-wrap gap-2">
            <FocusPill label="Letters" value={unit.phonicsFocus} />
            <FocusPill label="Numbers" value={unit.mathFocus} />
          </dl>

          <div className="mt-4 flex items-start gap-2 rounded-xl bg-paper/70 px-4 py-3">
            <FlagIcon weight="fill" className="mt-0.5 size-5 shrink-0 text-accent-deep" />
            <p className="text-base text-ink-soft">
              <span className="font-semibold text-ink">This week we make:</span> {unit.project}
            </p>
          </div>
        </header>

        {/* Activities */}
        <h2 className="mb-3 px-1 font-display text-xl font-semibold tracking-tight">
          Let&rsquo;s play
        </h2>
        <ul className="flex flex-col gap-4">
          {activities.map((activity, i) => {
            const meta = ACTIVITY_META[activity.kind];
            const Icon = meta.icon;
            const stars = ready ? getStars(activity.id) : 0;
            const motionProps = reduce
              ? {}
              : {
                  initial: { opacity: 0, y: 12 },
                  animate: { opacity: 1, y: 0 },
                  transition: {
                    duration: 0.32,
                    delay: Math.min(i, 8) * 0.05,
                    ease: [0.16, 1, 0.3, 1] as const,
                  },
                };
            return (
              <motion.li key={activity.id} {...motionProps}>
                <a
                  href={`/learn/${programSlug}/${unit.id}/${activity.id}`}
                  aria-label={`${activity.title}. ${meta.label}.${stars > 0 ? ` ${stars} of 3 stars.` : ""}`}
                  className={cn(
                    "flex min-h-24 w-full items-center gap-4 rounded-2xl px-4 py-4",
                    "border-[3px] border-ink bg-paper-raised shadow-pop transition",
                    "active:translate-y-1 active:shadow-none motion-safe:hover:-translate-y-0.5",
                  )}
                >
                  <span
                    aria-hidden
                    className="grid size-16 shrink-0 place-items-center rounded-xl border-[3px] border-ink bg-accent/15"
                  >
                    <Icon weight="duotone" className="size-9 text-ink" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-xl font-semibold tracking-tight">
                      {activity.title}
                    </span>
                    {activity.blurb && (
                      <span className="mt-0.5 block truncate text-base text-ink-soft">
                        {activity.blurb}
                      </span>
                    )}
                    <span className="mt-1.5 block">
                      <Stars value={stars} size="sm" />
                    </span>
                  </span>
                  <CaretRightIcon weight="bold" className="size-7 shrink-0 text-ink/60" />
                </a>
              </motion.li>
            );
          })}
        </ul>

        {/* Fresh practice shelf (Adventure 2.0 B3): account mode only, once the
            server has generated items for a completed lesson in THIS unit. Guest
            mode never renders it (generatedShelf is always [] there, §8). */}
        {mode === "account" && ready && selectedLearnerId && (
          <FreshPracticeShelf
            programSlug={programSlug}
            unit={unit}
            shelf={generatedShelf}
            getStars={getStars}
            learnerId={selectedLearnerId}
            refreshShelf={refreshShelf}
          />
        )}

        <div className="mt-10 flex flex-col items-center gap-2 text-center">
          <Mascot mood="happy" size={56} />
          <p className="text-base text-ink-faint">Tap anything. You can always try again.</p>
        </div>
      </AppShellKid>
    </div>
  );
}

/* ── Fresh practice shelf (Adventure 2.0 B3) ─────────────────────────────────
   The learner's durable AI-generated practice for this unit, grouped by the
   lesson it was made from. Each group offers ONE gentle "More like this" that
   asks the server for another bounded batch, up to SHELF_LESSON_CAP. Account
   mode only (the parent hook returns an empty shelf in guest mode). */

function FreshPracticeShelf({
  programSlug,
  unit,
  shelf,
  getStars,
  learnerId,
  refreshShelf,
}: {
  programSlug: string;
  unit: Unit;
  shelf: ShelfItem[];
  getStars: (activityId: string) => 0 | 1 | 2 | 3;
  learnerId: string;
  refreshShelf: () => Promise<void>;
}) {
  // The lessonId currently generating "more" (null = idle); disables that group's
  // button and shows the calm "cooking" copy while the bounded call is in flight.
  const [pendingLesson, setPendingLesson] = useState<string | null>(null);
  // Announced via the sr-only status region below — a disabled button's label
  // swap ("Making more…") isn't reliably read out, and new shelf items appear
  // silently otherwise (mirrors ActivityHost's GeneratingScreen live region).
  const [liveStatus, setLiveStatus] = useState("");

  const shelfForUnit = shelf.filter((s) => s.unitKey === unit.id);
  if (shelfForUnit.length === 0) return null;

  // Group by lessonId, keeping the unit's authored lesson order (then any stray
  // lesson id not on the current tree, defensively, so nothing is dropped).
  const titleByLesson = new Map(unit.lessons.map((l) => [l.id, l.title]));
  const itemsByLesson = new Map<string, ShelfItem[]>();
  for (const item of shelfForUnit) {
    const arr = itemsByLesson.get(item.lessonId);
    if (arr) arr.push(item);
    else itemsByLesson.set(item.lessonId, [item]);
  }
  const orderedLessonIds = [
    ...unit.lessons.map((l) => l.id).filter((id) => itemsByLesson.has(id)),
    ...[...itemsByLesson.keys()].filter((id) => !titleByLesson.has(id)),
  ];

  async function handleMore(lessonId: string) {
    setPendingLesson(lessonId);
    setLiveStatus("Making more practice");
    try {
      await ensureLessonPractice({ learnerId, programSlug, lessonId, more: true });
      await refreshShelf();
      setLiveStatus("New practice ready");
    } catch {
      // Forgiving: the button simply re-enables; the server logged the failure.
      setLiveStatus("");
    } finally {
      setPendingLesson(null);
    }
  }

  return (
    <section className="mt-10">
      <h2 className="mb-3 flex items-center gap-2 px-1 font-display text-xl font-semibold tracking-tight">
        <SparkleIcon weight="fill" className="size-5 text-honey-deep" aria-hidden />
        Fresh practice, made for you
      </h2>

      {/* Screen-reader announcement for the More-like-this flow. */}
      <p role="status" aria-live="polite" className="sr-only">
        {liveStatus}
      </p>

      <div className="flex flex-col gap-7">
        {orderedLessonIds.map((lessonId) => {
          const items = itemsByLesson.get(lessonId) ?? [];
          const capped = items.length >= SHELF_LESSON_CAP;
          const busy = pendingLesson === lessonId;
          const title = titleByLesson.get(lessonId);
          return (
            <div key={lessonId}>
              {title && (
                <h3 className="mb-2 px-1 font-display text-base font-semibold text-ink-soft">
                  {title}
                </h3>
              )}
              <ul className="flex flex-col gap-4">
                {items.map((item) => {
                  const meta = ACTIVITY_META[item.kind];
                  const Icon = meta.icon;
                  const stars = getStars(item.id);
                  return (
                    <li key={item.id}>
                      <a
                        href={`/learn/${programSlug}/generated/${item.id}`}
                        aria-label={`${item.title}. ${meta.label}.${stars > 0 ? ` ${stars} of 3 stars.` : ""}`}
                        className={cn(
                          "flex min-h-24 w-full items-center gap-4 rounded-2xl px-4 py-4",
                          "border-[3px] border-ink bg-paper-raised shadow-pop transition",
                          "active:translate-y-1 active:shadow-none motion-safe:hover:-translate-y-0.5",
                        )}
                      >
                        <span
                          aria-hidden
                          className="grid size-16 shrink-0 place-items-center rounded-xl border-[3px] border-ink bg-honey/20"
                        >
                          <Icon weight="duotone" className="size-9 text-ink" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-display text-xl font-semibold tracking-tight">
                            {item.title}
                          </span>
                          <span className="mt-1.5 block">
                            <Stars value={stars} size="sm" />
                          </span>
                        </span>
                        <CaretRightIcon weight="bold" className="size-7 shrink-0 text-ink/60" />
                      </a>
                    </li>
                  );
                })}
              </ul>
              {!capped && (
                <div className="mt-3 px-1">
                  <Button
                    type="button"
                    variant="soft"
                    size="kid"
                    onClick={() => void handleMore(lessonId)}
                    disabled={busy}
                  >
                    <SparkleIcon weight="fill" className="size-5 text-honey-deep" aria-hidden />
                    {busy ? "Making more…" : "More like this"}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FocusPill({ label, value }: { label: string; value: string }) {
  // A unit that doesn't use this focus dimension leaves it "" (e.g. the Life
  // Skills Math / Science units carry only a math focus) — render nothing
  // rather than an empty "Letters:" pill.
  if (value.trim() === "") return null;
  return (
    <div className="flex items-center gap-2">
      <Pill tone="accent">
        <span className="font-semibold">{label}:</span> {value}
      </Pill>
    </div>
  );
}

/* ── World moved (key in neither the pinned nor the published tree) ──────────
   A pinned learner can land on a unit that isn't in their version (e.g. a bogus
   URL, or a unit removed across versions). Never a crash or scary 404 — a warm
   nudge back to the map. */

function UnitMoved({ programSlug }: { programSlug: string }) {
  const reduce = useReducedMotion();
  return (
    <AppShellKid backHref={`/learn/${programSlug}`} readAloud="This world moved. Back to the map.">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto flex max-w-md flex-col items-center pt-10 text-center"
      >
        <Mascot mood="think" size={120} />
        <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight">
          This world moved!
        </h1>
        <p className="mt-3 text-lg text-ink-soft">Let&rsquo;s head back to the map.</p>
        <div className="mt-9 w-full">
          <Button href={`/learn/${programSlug}`} variant="primary" size="kid" className="w-full">
            <MapTrifoldIcon weight="duotone" className="size-6" />
            Back to the map
          </Button>
        </div>
      </motion.div>
    </AppShellKid>
  );
}

/* ── Not assigned (account-mode curation, Fix-F A3) ──────────────────────────
   A signed-in child reached a program/world a grown-up hasn't added (removed,
   paused, never assigned, or curated out of activeUnitKeys). Never a scary lock
   — a warm nudge to ask a grown-up, with the map as the safe floor. Mirrors the
   UnitMoved tone; guest mode never sees this (curation is account-mode only). */

export function NotAssigned({ programSlug }: { programSlug: string }) {
  const reduce = useReducedMotion();
  return (
    <AppShellKid backHref={`/learn/${programSlug}`} readAloud="Ask a grown-up to add this. Back to the map.">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto flex max-w-md flex-col items-center pt-10 text-center"
      >
        <Mascot mood="happy" size={120} />
        <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight">
          Ask a grown-up to add this!
        </h1>
        <p className="mt-3 text-lg text-ink-soft">
          This one isn&rsquo;t ready for you yet. Let&rsquo;s head back to your map.
        </p>
        <div className="mt-9 w-full">
          <Button href={`/learn/${programSlug}`} variant="primary" size="kid" className="w-full">
            <MapTrifoldIcon weight="duotone" className="size-6" />
            Back to the map
          </Button>
        </div>
      </motion.div>
    </AppShellKid>
  );
}
