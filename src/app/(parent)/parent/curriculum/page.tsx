import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { MarketplaceGrid } from "@/components/parent/MarketplaceGrid";
import { getCatalog } from "@/app/(parent)/data";
import { parentUnlockChallenge } from "@/app/(parent)/parent-unlock-challenge";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Curriculum" };

export default async function CurriculumPage() {
  const unlockChallenge = await parentUnlockChallenge();
  if (unlockChallenge) return unlockChallenge;

  const programs = await getCatalog();

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Parent home"
        title="Curriculum"
        description="Browse published programs and assign them to your learners. Each program covers a set of skills with guided lessons and activities."
      />

      <MarketplaceGrid programs={programs} />
    </div>
  );
}
