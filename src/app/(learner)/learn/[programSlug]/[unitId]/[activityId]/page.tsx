import type { Metadata } from "next";
import { findActivity } from "@/content";
import type { Activity, Unit, World } from "@/content";
import { getProgramAsync } from "@/lib/content/repository";
import { studioTitle } from "@/lib/site";
import { ActivityHost } from "@/components/learner/ActivityHost";

export const dynamic = "force-dynamic";

interface ActivityPageProps {
  params: Promise<{ programSlug: string; unitId: string; activityId: string }>;
}

export async function generateMetadata({ params }: ActivityPageProps): Promise<Metadata> {
  const { programSlug, activityId } = await params;
  const program = await getProgramAsync(programSlug);
  const found = program ? findActivity(program, activityId) : undefined;
  return studioTitle(found?.activity.title);
}

/**
 * The activity route. A thin server shell (mirrors the unit route): it resolves
 * the CURRENT PUBLISHED activity best-effort for SSR + guest fallback, but does
 * NOT hard-404 on a miss. ActivityHost (client) resolves the learner's PINNED
 * activity + its owning unit from useLearnerState and renders/links from THAT,
 * using `ssrActivity` (+ `world`) only as the pre-hydration / guest fallback;
 * when the key is in neither tree it shows a calm "this activity moved" state
 * rather than crashing. next/back hrefs are computed inside ActivityHost from
 * the RESOLVED (pinned) unit, so they point within the learner's own version.
 * unitId/activityId params are the stable authored keys (Fix-E Layer 1).
 *
 * Tradeoff (accepted): a bogus URL now renders the client "moved" state (HTTP
 * 200) for signed-in users instead of a server 404, because the server cannot
 * know the learner's pin. Guests still effectively get the published-miss path.
 */
export default async function ActivityPage({ params }: ActivityPageProps) {
  const { programSlug, unitId, activityId } = await params;
  const program = await getProgramAsync(programSlug);
  const found = program ? findActivity(program, activityId) : undefined;

  // Pass the published activity + its owning unit ONLY when the activity sits in
  // the named unit — a mismatched route keeps the SSR fallback null so the client
  // resolves from the pinned tree (or shows "moved"), never serving the wrong
  // activity. The owning unit gives guests/pre-hydration the in-unit "Next" link
  // and world theme without a pinned tree.
  const inUnit = found && found.unit.id === unitId ? found : undefined;
  const ssrActivity: Activity | null = inUnit ? inUnit.activity : null;
  const ssrUnit: Unit | null = inUnit ? inUnit.unit : null;
  const world: World = inUnit ? inUnit.unit.world : "sunshine";

  return (
    <ActivityHost
      programSlug={programSlug}
      unitKey={unitId}
      activityKey={activityId}
      ssrActivity={ssrActivity}
      ssrUnit={ssrUnit}
      world={world}
    />
  );
}
