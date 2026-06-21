import type { Metadata } from "next";
import { listProgramsAsync } from "@/lib/content/repository";
import { ProgramPicker, type PickerProgram } from "@/components/learner/ProgramPicker";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Pick a world" };

/**
 * The learner entry: a program picker. A signed-in household auto-redirects when
 * its learner is enrolled in exactly one program, otherwise picks among the
 * enrolled programs; a guest sees every program (no enrollment gating). The
 * decision is client-side (it depends on the session + the remembered learner),
 * so this RSC just hands the picker the registry's program tiles.
 */
export default async function LearnPage() {
  const programs: PickerProgram[] = (await listProgramsAsync()).map((p) => ({
    slug: p.slug,
    title: p.title,
    subtitle: p.subtitle,
    summary: p.summary,
    emoji: p.units[0]?.emoji ?? "✨",
    world: p.units[0]?.world ?? "sunshine",
  }));
  return <ProgramPicker programs={programs} />;
}
