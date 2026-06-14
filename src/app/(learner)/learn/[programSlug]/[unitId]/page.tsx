import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProgram, getUnit, listPrograms } from "@/content";
import { UnitView } from "@/components/learner/UnitView";

interface UnitPageProps {
  params: Promise<{ programSlug: string; unitId: string }>;
}

/** Every (programSlug, unitId) pair across all programs, for static pre-render. */
export function generateStaticParams(): { programSlug: string; unitId: string }[] {
  return listPrograms().flatMap((p) =>
    p.units.map((u) => ({ programSlug: p.slug, unitId: u.id })),
  );
}

export async function generateMetadata({ params }: UnitPageProps): Promise<Metadata> {
  const { programSlug, unitId } = await params;
  const program = getProgram(programSlug);
  const unit = program ? getUnit(program, unitId) : undefined;
  return { title: unit ? unit.title : "Studio" };
}

export default async function UnitPage({ params }: UnitPageProps) {
  const { programSlug, unitId } = await params;
  const program = getProgram(programSlug);
  const unit = program ? getUnit(program, unitId) : undefined;
  if (!program || !unit) notFound();
  return <UnitView unit={unit} programSlug={program.slug} />;
}
