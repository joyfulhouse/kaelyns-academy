/**
 * Repository fallback-path tests. There is NO DATABASE_URL in the test env,
 * so getDb() throws — exercising the DB-attempt-throws → static-fallback path.
 */
import { describe, expect, it } from "vitest";
import { getProgram, listPrograms } from "@/content";

const { getProgramAsync, listProgramsAsync, getProgramVersionAsync, findProgramByActivityIdAsync } =
  await import("./repository");

describe("getProgramAsync (fallback path — no DB)", () => {
  it("returns the static program when DB is unreachable", async () => {
    const result = await getProgramAsync("kaelyn-adaptive");
    const staticProgram = getProgram("kaelyn-adaptive");

    expect(result).toBeDefined();
    expect(result?.slug).toBe(staticProgram?.slug);
    expect(result?.title).toBe(staticProgram?.title);
    expect(result?.units).toHaveLength(staticProgram?.units.length ?? -1);
  });

  it("returns undefined for a slug that does not exist", async () => {
    const result = await getProgramAsync("does-not-exist");
    expect(result).toBeUndefined();
  });
});

describe("listProgramsAsync (fallback path — no DB)", () => {
  it("returns the same number of programs as the static list", async () => {
    const result = await listProgramsAsync();
    const staticList = listPrograms();

    expect(result).toHaveLength(staticList.length);
  });

  it("includes the kaelyn-adaptive program", async () => {
    const result = await listProgramsAsync();
    const found = result.find((p) => p.slug === "kaelyn-adaptive");
    expect(found).toBeDefined();
  });
});

describe("getProgramVersionAsync (fallback path — no DB)", () => {
  it("returns undefined when DB is unreachable (no static fallback for version id)", async () => {
    const result = await getProgramVersionAsync("some-version-id");
    expect(result).toBeUndefined();
  });
});

describe("findProgramByActivityIdAsync (fallback path — no DB)", () => {
  it("resolves to the owning program for a known static activity id", async () => {
    // "reading-r1-a1" is the first activity in kaelyn-adaptive (see kaelyn-adaptive.ts line 47)
    const result = await findProgramByActivityIdAsync("reading-r1-a1");
    expect(result).toBeDefined();
    expect(result?.slug).toBe("kaelyn-adaptive");
  });

  it("returns undefined for an activity id that does not exist", async () => {
    const result = await findProgramByActivityIdAsync("nonexistent-activity-id");
    expect(result).toBeUndefined();
  });
});
