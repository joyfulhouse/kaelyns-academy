import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProgram, listPrograms } from "@/content";
import { StudioHome } from "@/components/learner/StudioHome";

interface ProgramPageProps {
  params: Promise<{ programSlug: string }>;
}

/** One world-map route per registered program, for static pre-render. */
export function generateStaticParams(): { programSlug: string }[] {
  return listPrograms().map((p) => ({ programSlug: p.slug }));
}

export async function generateMetadata({ params }: ProgramPageProps): Promise<Metadata> {
  const { programSlug } = await params;
  const program = getProgram(programSlug);
  return { title: program ? program.title : "Studio" };
}

export default async function ProgramHomePage({ params }: ProgramPageProps) {
  const { programSlug } = await params;
  // An untrusted URL slug can name a program that does not exist → 404, never crash.
  const program = getProgram(programSlug);
  if (!program) notFound();
  return <StudioHome program={program} />;
}
