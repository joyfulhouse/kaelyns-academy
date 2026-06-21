import { describe, expect, it } from "vitest";
import { buildSeedPlan } from "./seed-content";
import { listPrograms, SKILLS } from "@/content";

describe("buildSeedPlan", () => {
  const plan = buildSeedPlan(listPrograms(), SKILLS);
  it("emits one program + one published v1 per static program", () => {
    expect(plan.programs.length).toBe(listPrograms().length);
    expect(plan.versions.every((v) => v.version === 1 && v.status === "published")).toBe(true);
  });
  it("preserves authored ids as stable keys (activityKey == authored activity.id)", () => {
    const a = listPrograms()[0].units[0].lessons[0].activities[0];
    expect(plan.activities.some((r) => r.activityKey === a.id)).toBe(true);
  });
  it("maps every skill", () => { expect(plan.skills.length).toBe(SKILLS.length); });
  it("orders siblings with lexically-sortable orderKeys matching authored order", () => {
    const u = plan.units.filter((r) => r.programVersionKey === plan.versions[0].key);
    const sorted = [...u].sort((x, y) => x.orderKey.localeCompare(y.orderKey));
    expect(sorted.map((r) => r.unitKey)).toEqual(u.map((r) => r.unitKey));
  });
});
