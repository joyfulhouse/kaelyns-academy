import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getUnit } from "@/content";
import { getProgramAsync } from "@/lib/content/repository";
import { UnitView } from "@/components/learner/UnitView";

export const dynamic = "force-dynamic";

interface UnitPageProps {
  params: Promise<{ programSlug: string; unitId: string }>;
}

export async function generateMetadata({ params }: UnitPageProps): Promise<Metadata> {
  const { programSlug, unitId } = await params;
  const program = await getProgramAsync(programSlug);
  const unit = program ? getUnit(program, unitId) : undefined;
  return { title: unit ? unit.title : "Studio" };
}

export default async function UnitPage({ params }: UnitPageProps) {
  const { programSlug, unitId } = await params;
  const program = await getProgramAsync(programSlug);
  const unit = program ? getUnit(program, unitId) : undefined;
  if (!program || !unit) notFound();
  return <UnitView unit={unit} programSlug={program.slug} />;
}
