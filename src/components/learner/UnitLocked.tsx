"use client";

import { motion, useReducedMotion } from "motion/react";
import { LockSimpleIcon, MapTrifoldIcon } from "@phosphor-icons/react/dist/ssr";
import { Mascot } from "@/components/art/Mascot";
import { Button } from "@/components/ui/Button";
import { AppShellKid } from "./AppShellKid";

/**
 * A world the child's map hasn't opened yet, reached by deep link — a bookmark,
 * a shared URL, browser history, or a typed address.
 *
 * This is pacing, not a fail state and not access control: it is real content
 * they WILL get to, already curated for them by their grown-up. So the copy
 * promises rather than refuses, names the world so the trip wasn't confusing,
 * and offers the map, where the next open world is waiting.
 *
 * Shared by the unit route and the activity route so both say the same thing.
 */
export function UnitLocked({
  programSlug,
  unitTitle,
}: {
  programSlug: string;
  unitTitle: string;
}) {
  const reduce = useReducedMotion();
  const mapHref = `/learn/${programSlug}`;
  return (
    <AppShellKid
      backHref={mapHref}
      readAloud={`${unitTitle} is not open yet. Play the world before it first.`}
    >
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto flex max-w-md flex-col items-center pt-10 text-center"
      >
        <div className="grid size-24 place-items-center rounded-2xl border-[3px] border-ink bg-accent/15 shadow-pop">
          <LockSimpleIcon weight="duotone" className="size-12 text-ink" />
        </div>
        <Mascot mood="think" size={120} className="mt-6" />
        <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight">Not open yet!</h1>
        <p className="mt-3 text-lg text-ink-soft">
          <span className="font-semibold text-ink">{unitTitle}</span> is waiting for you. Play the
          world before it first.
        </p>
        <div className="mt-9 w-full">
          <Button href={mapHref} variant="primary" size="kid" className="w-full">
            <MapTrifoldIcon weight="duotone" className="size-6" />
            Back to the map
          </Button>
        </div>
      </motion.div>
    </AppShellKid>
  );
}
