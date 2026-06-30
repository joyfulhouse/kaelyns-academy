import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProgramAsync } from "@/lib/content/repository";
import { studioTitle } from "@/lib/site";
import { StudioHome } from "@/components/learner/StudioHome";

export const dynamic = "force-dynamic";

interface ProgramPageProps {
  params: Promise<{ programSlug: string }>;
}

export async function generateMetadata({ params }: ProgramPageProps): Promise<Metadata> {
  const { programSlug } = await params;
  const program = await getProgramAsync(programSlug);
  return studioTitle(program?.title);
}

export default async function ProgramHomePage({ params }: ProgramPageProps) {
  const { programSlug } = await params;
  // An untrusted URL slug can name a program that does not exist → 404, never crash.
  const program = await getProgramAsync(programSlug);
  if (!program) notFound();
  return <StudioHome program={program} />;
}
