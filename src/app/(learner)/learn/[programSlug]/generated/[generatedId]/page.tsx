import type { Metadata } from "next";
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
 * construction, but the server page intentionally does not perform an
 * account-wide shelf lookup. GeneratedPracticeHost first resolves the selected
 * account learner, then calls the learner-scoped action. No session / a foreign
 * or unknown id degrades to the calm "moved" state rather than a 404/500.
 */
export default async function GeneratedActivityPage({ params }: GeneratedActivityPageProps) {
  const { programSlug, generatedId } = await params;
  return <GeneratedPracticeHost programSlug={programSlug} generatedId={generatedId} />;
}
