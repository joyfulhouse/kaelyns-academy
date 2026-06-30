import type { Metadata } from "next";
import { getUnit } from "@/content";
import { getProgramAsync } from "@/lib/content/repository";
import { studioTitle } from "@/lib/site";
import { UnitView } from "@/components/learner/UnitView";

export const dynamic = "force-dynamic";

interface UnitPageProps {
  params: Promise<{ programSlug: string; unitId: string }>;
}

export async function generateMetadata({ params }: UnitPageProps): Promise<Metadata> {
  const { programSlug, unitId } = await params;
  const program = await getProgramAsync(programSlug);
  const unit = program ? getUnit(program, unitId) : undefined;
  return studioTitle(unit?.title);
}

/**
 * The unit (world) route. This is a thin server shell: it resolves the CURRENT
 * PUBLISHED unit best-effort for SSR + guest fallback, but does NOT hard-404 on
 * a miss. A signed-in learner pinned to an older version may be on a unit that
 * isn't in the current published tree (or whose program was since archived);
 * UnitView (client) resolves the learner's PINNED unit from useLearnerState and
 * renders that, using `ssrUnit` only as the pre-hydration / guest fallback. When
 * the key is in neither tree, UnitView shows a calm "this world moved" state
 * rather than crashing. The unitKey ([unitId] param) is the stable authored key
 * (Fix-E Layer 1), shared by the map, the pinned tree, and progress scoping.
 *
 * Tradeoff (accepted): a bogus URL now renders the client "moved" state (HTTP
 * 200) for signed-in users instead of a server 404, because the server cannot
 * know the learner's pin. Guests still effectively get the published-miss path.
 */
export default async function UnitPage({ params }: UnitPageProps) {
  const { programSlug, unitId } = await params;
  const program = await getProgramAsync(programSlug);
  const ssrUnit = program ? (getUnit(program, unitId) ?? null) : null;
  return <UnitView programSlug={programSlug} unitKey={unitId} ssrUnit={ssrUnit} />;
}
