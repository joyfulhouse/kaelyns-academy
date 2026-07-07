import type { Metadata } from "next";
import { getSessionOrNull } from "@/lib/auth";
import { getGeneratedActivityForAccount } from "@/lib/tutor/store";
import { studioTitle } from "@/lib/site";
import { GeneratedPracticeHost } from "@/components/learner/GeneratedPracticeHost";

export const dynamic = "force-dynamic";

interface GeneratedActivityPageProps {
  params: Promise<{ programSlug: string; generatedId: string }>;
}

// A static, no-PII title (§8): the child's display name never enters the tab /
// history / OS previews. A shelf item's own title stays off the tab too — the
// page is just "Practice".
export function generateMetadata(): Metadata {
  return studioTitle("Practice");
}

/**
 * The generated-shelf play route (Adventure 2.0 B3). Account-only by
 * construction: it resolves the Better Auth session lazily per-request
 * (build-safe — no getAuth()/getDb() at module top level), then loads the shelf
 * row scoped by ACCOUNT + programSlug (ownership resolved through the owning
 * learner). No session / a foreign or unknown id → row = null, and
 * GeneratedPracticeHost renders the calm "moved" state (mirroring the authored
 * route's posture) rather than a 404/500. unitId/world/next links are all
 * derived client-side inside the host from the row.
 */
export default async function GeneratedActivityPage({ params }: GeneratedActivityPageProps) {
  const { programSlug, generatedId } = await params;
  const session = await getSessionOrNull();
  const row = session
    ? await getGeneratedActivityForAccount(session.user.id, programSlug, generatedId)
    : null;
  return <GeneratedPracticeHost programSlug={programSlug} row={row} />;
}
