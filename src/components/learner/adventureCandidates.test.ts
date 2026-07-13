import { describe, expect, it } from "vitest";
import { curateAdventureCandidates } from "./adventureCandidates";

describe("curateAdventureCandidates", () => {
  it("removes a recommender's global top unit and generated shelf items when curated out", () => {
    const recommendations = [
      { unit: { id: "global-top" }, activity: { id: "a1" } },
      { unit: { id: "assigned" }, activity: { id: "a2" } },
    ];
    const generated = [
      { id: "g1", unitKey: "global-top" },
      { id: "g2", unitKey: "assigned" },
    ];
    const reviews = [
      { activity: { id: "r1" }, unit: { id: "global-top" } },
      { activity: { id: "r2" }, unit: { id: "assigned" } },
    ];

    expect(
      curateAdventureCandidates(recommendations, generated, new Set(["assigned"]), reviews),
    ).toEqual({
      recommendations: [recommendations[1]],
      generated: [generated[1]],
      reviews: [reviews[1]],
    });
  });
});
