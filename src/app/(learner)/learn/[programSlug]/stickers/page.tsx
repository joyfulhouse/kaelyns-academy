import type { Metadata } from "next";
import { studioTitle } from "@/lib/site";
import { StickerBook } from "@/components/learner/StickerBook";

export const dynamic = "force-dynamic";

export const metadata: Metadata = studioTitle("Sticker Book");

interface StickersPageProps {
  params: Promise<{ programSlug: string }>;
}

export default async function StickersPage({ params }: StickersPageProps) {
  const { programSlug } = await params;
  return <StickerBook programSlug={programSlug} />;
}
