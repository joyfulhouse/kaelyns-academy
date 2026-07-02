import { describe, expect, it } from "vitest";
import { buildMotivationSeedPlan } from "./seed-motivation";
import { validateArtRef } from "@/lib/rewards/admin-store";
import { validateTemplateInput } from "@/lib/quests/admin-store";

describe("buildMotivationSeedPlan", () => {
  const plan = buildMotivationSeedPlan();

  it("seeds exactly 12 published interests with unique slugs", () => {
    expect(plan.interests.length).toBe(12);
    expect(plan.interests.every((i) => i.status === "published")).toBe(true);
    expect(new Set(plan.interests.map((i) => i.slug)).size).toBe(plan.interests.length);
  });

  it("seeds 3 published sticker packs of 8 stickers each, costs 3–10, valid v1 artRefs", () => {
    expect(plan.stickerPacks.length).toBe(3);
    expect(new Set(plan.stickerPacks.map((p) => p.slug)).size).toBe(plan.stickerPacks.length);
    for (const pack of plan.stickerPacks) {
      expect(pack.status).toBe("published");
      expect(pack.stickers.length).toBe(8);
      expect(new Set(pack.stickers.map((s) => s.slug)).size).toBe(pack.stickers.length);
      for (const sticker of pack.stickers) {
        expect(() => validateArtRef(sticker.artRef)).not.toThrow();
        expect(sticker.starCost).toBeGreaterThanOrEqual(3);
        expect(sticker.starCost).toBeLessThanOrEqual(10);
      }
    }
  });

  it("seeds 3 published quest templates whose params match their kind", () => {
    expect(plan.questTemplates.length).toBe(3);
    expect(new Set(plan.questTemplates.map((t) => t.slug)).size).toBe(plan.questTemplates.length);
    for (const t of plan.questTemplates) {
      expect(t.status).toBe("published");
      expect(() => validateTemplateInput(t.kind, t.params)).not.toThrow();
    }
  });

  it("includes the three named templates with their specified kind/params/reward", () => {
    const bySlug = new Map(plan.questTemplates.map((t) => [t.slug, t]));
    expect(bySlug.get("daily-three")).toMatchObject({
      kind: "complete_n",
      params: { count: 3 },
      rewardStars: 3,
    });
    expect(bySlug.get("explore-strand")).toMatchObject({ kind: "try_strand", rewardStars: 2 });
    expect(bySlug.get("level-up-skill")).toMatchObject({ kind: "practice_skill", rewardStars: 2 });
  });
});
