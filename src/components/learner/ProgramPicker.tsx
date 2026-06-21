"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRightIcon, CompassIcon } from "@phosphor-icons/react/dist/ssr";
import type { World } from "@/content";
import { cn } from "@/lib/cn";
import { Mascot } from "@/components/art/Mascot";
import { AppShellKid } from "./AppShellKid";
import { getEnrollmentsAction, getTutorSession } from "@/app/(learner)/actions";
import { getKeySnapshot, subscribeKey } from "./localStore";

/**
 * The program picker, the learner surface's front door. It decides which
 * "worlds" a child sees and, when there's only one, skips straight into it:
 *
 *  - **Signed-in household:** reads the (remembered, else first) learner's
 *    enrollments. Exactly one → auto-redirect into that program. Several →
 *    tiles for just the enrolled programs.
 *  - **Guest / signed-in-with-no-profile:** every program is shown (no
 *    enrollment gating), so a visitor can explore any world.
 *
 * Resolution is forgiving by construction: the server actions never throw, and
 * any failure falls back to showing every program rather than a dead end. Hooks
 * are all unconditional; state is set from awaited action results under a
 * mounted ref (no external-store reads inside an effect).
 */

export interface PickerProgram {
  slug: string;
  title: string;
  subtitle: string;
  summary: string;
  emoji: string;
  world: World;
}

/** Remembered account-learner choice (shared with useLearnerState). */
const ACCOUNT_LEARNER_KEY = "ka:account-learner";

function readRememberedAccountLearner(raw: string | null): string | null {
  return raw && raw.length > 0 ? raw : null;
}

type Resolution =
  | { phase: "loading" }
  | { phase: "ready"; visibleSlugs: string[] | null };

export function ProgramPicker({ programs }: { programs: PickerProgram[] }) {
  const router = useRouter();
  const reduce = useReducedMotion();

  // The remembered account-learner choice (external store), read at render
  // (never inside an effect, which the rules forbid for store reads).
  const rememberedLearner = useSyncExternalStore(
    useCallback((listener: () => void) => subscribeKey(ACCOUNT_LEARNER_KEY, listener), []),
    () => getKeySnapshot(ACCOUNT_LEARNER_KEY, readRememberedAccountLearner),
    () => null,
  );

  const [resolution, setResolution] = useState<Resolution>({ phase: "loading" });
  // Once we decide to redirect into the single enrolled program we hold the
  // calm loading beat (no tile flash) until the navigation lands.
  const [redirecting, setRedirecting] = useState(false);

  // Latest render values mirrored into refs (written in an effect — allowed —
  // never during render) so the one-shot resolver can read them without taking
  // reactive effect dependencies. This keeps the resolve effect a true setup
  // that runs once, with all setState after an await (async-safe).
  const mountedRef = useRef(true);
  const latest = useRef({ programs, router, rememberedLearner });
  useEffect(() => {
    latest.current = { programs, router, rememberedLearner };
  }, [programs, router, rememberedLearner]);

  useEffect(() => {
    mountedRef.current = true;
    void (async () => {
      const { programs: progs, router: r, rememberedLearner: rememberedId } = latest.current;
      const session = await getTutorSession();
      if (!mountedRef.current) return;

      // Guest, or signed-in but no learner profile yet: show every program.
      if (!session.signedIn || session.learners.length === 0) {
        setResolution({ phase: "ready", visibleSlugs: null });
        return;
      }

      // Account mode: read the active (remembered, else first) learner's
      // enrollments. Resolve against the real learner list so a stale remembered
      // id can't strand the picker.
      const active = session.learners.find((l) => l.id === rememberedId) ?? session.learners[0];
      const enrolled = await getEnrollmentsAction(active.id);
      if (!mountedRef.current) return;

      // Keep only enrollments we actually have a program tile for.
      const known = enrolled.filter((slug) => progs.some((p) => p.slug === slug));

      if (known.length === 1) {
        setRedirecting(true);
        r.replace(`/learn/${known[0]}`);
        return;
      }
      // CURATION GAP (accepted, P0 pilot): when a signed-in child has zero
      // active enrollments, `visibleSlugs` is `null` → the picker shows ALL
      // published programs (the kid can then self-enroll by opening a tile, see
      // ensureEnrollmentAction). Parent assignment is NOT strictly enforced on
      // the kid surface — a deliberately forgiving UX so a child never hits an
      // empty/locked screen. Bounds: removed programs stay removed, only
      // never-assigned PUBLISHED programs are reachable, and nothing crosses
      // accounts. See docs/claude/KNOWN-RISKS-P0-PILOT.md ("Kid-surface curation").
      // None resolved (e.g. enrollment read unavailable) falls back to all.
      setResolution({ phase: "ready", visibleSlugs: known.length > 0 ? known : null });
    })();
    return () => {
      mountedRef.current = false;
    };
    // Runs once on mount; latest render values are read from `latest.current`
    // (refs), so there are no reactive dependencies to declare.
  }, []);

  const visible = useMemo(() => {
    if (resolution.phase !== "ready") return [];
    const slugs = resolution.visibleSlugs;
    if (!slugs) return programs;
    // Preserve registry order while restricting to the enrolled set.
    return programs.filter((p) => slugs.includes(p.slug));
  }, [resolution, programs]);

  if (resolution.phase === "loading" || redirecting) {
    return (
      <AppShellKid backHref="/" readAloud="Getting your worlds ready.">
        <div className="mx-auto flex max-w-2xl flex-col items-center pt-10 text-center">
          <Mascot mood="happy" size={96} className={reduce ? undefined : "motion-safe:animate-float"} />
          <p className="mt-6 text-base text-ink-faint">Getting your worlds ready...</p>
        </div>
      </AppShellKid>
    );
  }

  return (
    <AppShellKid backHref="/" readAloud="Pick a world to explore. Tap a tile.">
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <Mascot mood="wave" size={96} className={reduce ? undefined : "motion-safe:animate-float"} />
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Pick a world
        </h1>
        <p className="mt-2 text-lg text-ink-soft">Where do you want to explore today?</p>

        <ul className="mt-9 grid w-full gap-5 sm:grid-cols-2">
          {visible.map((program, i) => (
            <ProgramTile key={program.slug} program={program} index={i} reduce={Boolean(reduce)} />
          ))}
        </ul>

        <div className="mt-10 flex flex-col items-center gap-2 text-center">
          <Mascot mood="happy" size={56} />
          <p className="text-base text-ink-faint">Each world remembers where you left off.</p>
        </div>
      </div>
    </AppShellKid>
  );
}

function ProgramTile({
  program,
  index,
  reduce,
}: {
  program: PickerProgram;
  index: number;
  reduce: boolean;
}) {
  const motionProps = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 14 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.36, delay: index * 0.08, ease: [0.16, 1, 0.3, 1] as const },
      };

  return (
    <motion.li {...motionProps} data-world={program.world}>
      <a
        href={`/learn/${program.slug}`}
        aria-label={`${program.title}. ${program.subtitle}.`}
        className={cn(
          "group flex h-full flex-col gap-3 rounded-2xl p-6 text-left",
          "border-[3px] border-ink bg-accent/12 shadow-pop transition",
          "active:translate-y-1 active:shadow-none motion-safe:hover:-translate-y-0.5",
        )}
      >
        <div className="flex items-center gap-4">
          <span
            aria-hidden
            className="grid size-20 shrink-0 place-items-center rounded-2xl border-[3px] border-ink bg-paper-raised text-5xl"
          >
            {program.emoji}
          </span>
          <span className="grid size-12 shrink-0 place-items-center rounded-full border-[3px] border-ink bg-honey text-ink shadow-pop transition group-hover:rotate-6">
            <CompassIcon weight="bold" className="size-7" />
          </span>
        </div>
        <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">{program.title}</h2>
        <p className="text-base text-ink-soft">{program.subtitle}</p>
        <span className="mt-auto inline-flex items-center gap-1.5 pt-2 font-display text-base font-semibold text-accent-deep">
          Let&rsquo;s go
          <ArrowRightIcon weight="bold" className="size-5" />
        </span>
      </a>
    </motion.li>
  );
}
