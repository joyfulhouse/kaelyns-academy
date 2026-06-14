import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findActivity, getProgram, listPrograms } from "@/content";
import type { Program } from "@/content";
import { ActivityHost } from "@/components/learner/ActivityHost";

interface ActivityPageProps {
  params: Promise<{ programSlug: string; unitId: string; activityId: string }>;
}

/** Every (programSlug, unitId, activityId) triple across all programs, for SSG. */
export function generateStaticParams(): {
  programSlug: string;
  unitId: string;
  activityId: string;
}[] {
  return listPrograms().flatMap((p) =>
    p.units.flatMap((u) =>
      u.lessons.flatMap((l) =>
        l.activities.map((a) => ({ programSlug: p.slug, unitId: u.id, activityId: a.id })),
      ),
    ),
  );
}

export async function generateMetadata({ params }: ActivityPageProps): Promise<Metadata> {
  const { programSlug, activityId } = await params;
  const program = getProgram(programSlug);
  const found = program ? findActivity(program, activityId) : undefined;
  return { title: found ? found.activity.title : "Studio" };
}

/**
 * The next activity within the same unit (kept inside the world so a child
 * advances through one theme before the map decides the next). Returns null at
 * the unit's end, where the reward screen offers only "back to the map".
 */
function nextActivityHref(
  program: Program,
  unitId: string,
  activityId: string,
): string | null {
  const unit = program.units.find((u) => u.id === unitId);
  if (!unit) return null;
  const ids = unit.lessons.flatMap((l) => l.activities.map((a) => a.id));
  const idx = ids.indexOf(activityId);
  if (idx < 0 || idx + 1 >= ids.length) return null;
  return `/learn/${program.slug}/${unit.id}/${ids[idx + 1]}`;
}

export default async function ActivityPage({ params }: ActivityPageProps) {
  const { programSlug, unitId, activityId } = await params;
  const program = getProgram(programSlug);
  const found = program ? findActivity(program, activityId) : undefined;

  // Guard against an unknown program or a mismatched route (activity not in the
  // named unit) → 404, never a crash on an untrusted URL.
  if (!program || !found || found.unit.id !== unitId) notFound();

  const backHref = `/learn/${program.slug}/${found.unit.id}`;
  const nextHref = nextActivityHref(program, unitId, activityId);

  return (
    <ActivityHost
      activity={found.activity}
      programSlug={program.slug}
      world={found.unit.world}
      backHref={backHref}
      nextHref={nextHref}
    />
  );
}
