import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findActivity, getProgram } from "@/content";
import type { Program } from "@/content";
import { ActivityHost } from "@/components/learner/ActivityHost";
import { PROGRAM_SLUG } from "@/components/learner/activityMeta";

interface ActivityPageProps {
  params: Promise<{ unitId: string; activityId: string }>;
}

/** All (unitId, activityId) pairs in the program, for static pre-render. */
export function generateStaticParams(): { unitId: string; activityId: string }[] {
  const program = getProgram(PROGRAM_SLUG);
  if (!program) return [];
  const params: { unitId: string; activityId: string }[] = [];
  for (const unit of program.units) {
    for (const lesson of unit.lessons) {
      for (const activity of lesson.activities) {
        params.push({ unitId: unit.id, activityId: activity.id });
      }
    }
  }
  return params;
}

export async function generateMetadata({ params }: ActivityPageProps): Promise<Metadata> {
  const { activityId } = await params;
  const program = getProgram(PROGRAM_SLUG);
  const found = program ? findActivity(program, activityId) : undefined;
  return { title: found ? found.activity.title : "Studio" };
}

/**
 * The next activity within the same unit (kept inside the world so a child
 * advances through one theme before the map decides the next). Returns null at
 * the unit's end, where the reward screen offers only "back to the map".
 */
function nextActivityHref(program: Program, unitId: string, activityId: string): string | null {
  const unit = program.units.find((u) => u.id === unitId);
  if (!unit) return null;
  const ids = unit.lessons.flatMap((l) => l.activities.map((a) => a.id));
  const idx = ids.indexOf(activityId);
  if (idx < 0 || idx + 1 >= ids.length) return null;
  return `/learn/${unit.id}/${ids[idx + 1]}`;
}

export default async function ActivityPage({ params }: ActivityPageProps) {
  const { unitId, activityId } = await params;
  const program = getProgram(PROGRAM_SLUG);
  const found = program ? findActivity(program, activityId) : undefined;

  // Guard against a mismatched route (activity not in the named unit).
  if (!program || !found || found.unit.id !== unitId) notFound();

  const backHref = `/learn/${found.unit.id}`;
  const nextHref = nextActivityHref(program, unitId, activityId);

  return (
    <ActivityHost
      activity={found.activity}
      world={found.unit.world}
      backHref={backHref}
      nextHref={nextHref}
    />
  );
}
