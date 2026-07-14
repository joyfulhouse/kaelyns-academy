import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProgramAsync } from "@/lib/content/repository";
import { studioTitle } from "@/lib/site";
import { StudioHome } from "@/components/learner/StudioHome";
import { getParentPinHash } from "@/lib/parent-pin-store";
import { getAccountOrNull } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

interface ProgramPageProps {
  params: Promise<{ programSlug: string }>;
  searchParams: Promise<{ handoff?: string | string[] }>;
}

export async function generateMetadata({ params }: ProgramPageProps): Promise<Metadata> {
  const { programSlug } = await params;
  const program = await getProgramAsync(programSlug);
  return studioTitle(program?.title);
}

export default async function ProgramHomePage({ params, searchParams }: ProgramPageProps) {
  const { programSlug } = await params;
  // An untrusted URL slug can name a program that does not exist → 404, never crash.
  const program = await getProgramAsync(programSlug);
  if (!program) notFound();

  const query = await searchParams;
  const rawHandoff = Array.isArray(query.handoff) ? query.handoff[0] : query.handoff;
  const learnerId = cleanHandoffLearnerId(rawHandoff);
  if (!learnerId) return <StudioHome program={program} />;

  const account = await getAccountOrNull();
  const showPinNudge = account
    ? (await getParentPinHash(account.accountId)) === null
    : false;

  return <StudioHome program={program} handoff={{ learnerId, showPinNudge }} />;
}

/** Keep the opaque learner id bounded even for a hand-edited URL. */
function cleanHandoffLearnerId(value: string | undefined): string | null {
  if (!value) return null;
  const printable = Array.from(value)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code >= 32 && code !== 127;
    })
    .slice(0, 128)
    .join("")
    .trim();
  return printable || null;
}
