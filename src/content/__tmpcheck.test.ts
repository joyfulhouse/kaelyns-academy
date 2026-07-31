import { describe, it, expect } from "vitest";
import { PROGRAMS } from "@/content/index";
import { writeFileSync } from "node:fs";

describe("tmp", () => {
  it("lesson freshness", () => {
    const out: string[] = [];
    for (const p of PROGRAMS as any[]) {
      const seen = new Set<string>();
      out.push(`=== PROGRAM ${p.slug} units=${p.units.length}`);
      for (const u of p.units) {
        const uown = new Set<string>(u.lessons.flatMap((l: any) => l.activities.flatMap((a: any) => a.skillTags)));
        const ufresh = [...uown].filter((t) => !seen.has(t));
        if (uown.size > 0 && ufresh.length === 0) out.push(`  STALE UNIT ${u.id} :: ${[...uown].join(",")}`);
        for (const l of u.lessons) {
          const own = new Set<string>(
            l.activities.filter((a: any) => a.kind !== "journal-prompt").flatMap((a: any) => a.skillTags),
          );
          const fresh = [...own].filter((t) => !seen.has(t));
          if (own.size > 0 && fresh.length === 0)
            out.push(`  STALE LESSON ${u.id}/${l.id} :: ${[...own].join(",")}`);
          for (const t of own) seen.add(t);
        }
      }
    }
    writeFileSync("/tmp/freshness.txt", out.join("\n"));
    expect(true).toBe(true);
  });
});
