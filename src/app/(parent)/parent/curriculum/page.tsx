import type { Metadata } from "next";
import { MarketplaceGrid } from "@/components/parent/MarketplaceGrid";
import { getCatalog } from "@/app/(parent)/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Curriculum" };

export default async function CurriculumPage() {
  const programs = await getCatalog();

  return (
    <div className="mx-auto max-w-4xl">
      <header>
        <p className="font-display text-sm font-semibold text-ink-faint">Parent home</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Curriculum</h1>
        <p className="mt-2 max-w-prose text-ink-soft">
          Browse published programs and assign them to your learners. Each program covers a set
          of skills with guided lessons and activities.
        </p>
      </header>

      <MarketplaceGrid programs={programs} />
    </div>
  );
}
