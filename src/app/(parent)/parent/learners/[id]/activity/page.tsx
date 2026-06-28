import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/ui/PageHeader";
import { getLearnerActivityTrail } from "@/app/(parent)/data";
import { AiProvenanceList } from "@/components/parent/AiProvenanceList";

// Deliberately a static, non-identifying title (matches the learner-detail page).
// The child's display name is child PII (spec §8) and appears only in the page
// body — never in `document.title` (history / OS previews / Sentry breadcrumbs).
export const metadata: Metadata = { title: "What the AI made" };

/**
 * The per-learner AI provenance page (P6 / spec §8 "parent-visible 'what the AI
 * made' trail"): a calm, paginated, read-only list of everything the bounded
 * tutor generated for this child — activity, model/route, when, and the star
 * result. Read-only via the data helper (no new action); keyset pagination uses
 * a `?cursor=` query param so "View older" is a plain server-rendered link.
 * 404s (inherited learner-group not-found) when the learner isn't this account's.
 */
export default async function LearnerActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { id } = await params;
  const { cursor } = await searchParams;
  const trail = await getLearnerActivityTrail(id, cursor ?? null);
  // 404 when the learner does not exist or is not this account's (tenancy).
  if (!trail) notFound();

  const { learner, rows, nextCursor } = trail;
  const olderHref = nextCursor
    ? `/parent/learners/${id}/activity?cursor=${encodeURIComponent(nextCursor)}`
    : null;

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={`/parent/learners/${id}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"
      >
        <ArrowLeftIcon weight="bold" className="size-4" />
        Back to {learner.displayName}
      </Link>

      <PageHeader
        className="mt-4"
        eyebrow="Provenance"
        title={`What the AI made for ${learner.displayName}`}
        description={`Every practice item the bounded tutor generated for ${learner.displayName}, with what made it and when. We log the model and route for audit, never the prompt.`}
      />

      <AiProvenanceList rows={rows} olderHref={olderHref} learnerName={learner.displayName} />
    </div>
  );
}
