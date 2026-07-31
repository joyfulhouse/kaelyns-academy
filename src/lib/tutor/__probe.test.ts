import { describe, it, expect } from "vitest";
import type { Program, SkillTag } from "@/content";
import { applyEvidence, type SkillState } from "./mastery";
import { nextBest } from "./recommend";
import { kaelynAdaptive } from "@/content/programs/kaelyn-adaptive";

describe("PROBE: finished-the-map state", () => {
  it("all NON-checkpoint units played + every skill solid", () => {
    let s: SkillState = {};
    const completed = new Set<string>();
    const tags = new Set<string>();
    for (const u of kaelynAdaptive.units) {
      for (const l of u.lessons) for (const a of l.activities) {
        for (const t of a.skillTags) tags.add(t);
        if (!u.checkpoint) completed.add(a.id);
      }
    }
    for (const day of ["d1", "d2"]) {
      s = applyEvidence(
        s,
        [...tags].map((skill) => ({ skill: skill as SkillTag, outcome: "solid" as const })),
        day,
      );
    }
    const recs = nextBest(kaelynAdaptive as Program, s, completed);
    console.log(
      "FINISHED-MAP RECS:",
      JSON.stringify(recs.map((r) => ({ u: r.unit.id, a: r.activity.id, why: r.reason }))),
    );
    expect(recs.length).toBe(-1);
  });
});
