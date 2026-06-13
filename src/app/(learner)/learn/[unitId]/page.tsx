import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProgram, getUnit } from "@/content";
import { UnitView } from "@/components/learner/UnitView";
import { PROGRAM_SLUG } from "@/components/learner/activityMeta";

interface UnitPageProps {
  params: Promise<{ unitId: string }>;
}

export function generateStaticParams(): { unitId: string }[] {
  const program = getProgram(PROGRAM_SLUG);
  return program ? program.units.map((u) => ({ unitId: u.id })) : [];
}

export async function generateMetadata({ params }: UnitPageProps): Promise<Metadata> {
  const { unitId } = await params;
  const program = getProgram(PROGRAM_SLUG);
  const unit = program ? getUnit(program, unitId) : undefined;
  return { title: unit ? unit.title : "Studio" };
}

export default async function UnitPage({ params }: UnitPageProps) {
  const { unitId } = await params;
  const program = getProgram(PROGRAM_SLUG);
  const unit = program ? getUnit(program, unitId) : undefined;
  if (!unit) notFound();
  return <UnitView unit={unit} />;
}
