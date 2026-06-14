import { describe, it, expect } from "vitest";
import { nextSkillRecord } from "./store";

describe("nextSkillRecord (DB evidence fold)", () => {
  it("first solid attempt is emerging, not yet solid", () => {
    const r = nextSkillRecord(undefined, "solid", "2026-06-13");
    expect(r.outcome).toBe("emerging");
    expect(r.history).toEqual([{ day: "2026-06-13", outcome: "solid" }]);
  });

  it("locks to solid on the second distinct solid day", () => {
    const r1 = nextSkillRecord(undefined, "solid", "2026-06-13");
    const r2 = nextSkillRecord(r1.history, "solid", "2026-06-14");
    expect(r2.outcome).toBe("solid");
  });

  it("two solids on the SAME day stay emerging", () => {
    const r1 = nextSkillRecord(undefined, "solid", "2026-06-13");
    const r2 = nextSkillRecord(r1.history, "solid", "2026-06-13");
    expect(r2.outcome).toBe("emerging");
  });

  it("an attempt with a not_yet outcome still counts as emerging (started)", () => {
    expect(nextSkillRecord(undefined, "not_yet", "2026-06-13").outcome).toBe("emerging");
  });

  it("caps history length", () => {
    let history: { day: string; outcome: "solid" }[] = [];
    for (let i = 0; i < 40; i++) {
      const r = nextSkillRecord(history, "solid", `d${i}`);
      history = r.history as { day: string; outcome: "solid" }[];
    }
    expect(history.length).toBeLessThanOrEqual(24);
  });
});
