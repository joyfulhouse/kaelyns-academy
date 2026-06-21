import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getProgram } from "@/content";

// getProgramAsync's static-fallback contract: the static program is a fallback
// ONLY when there is no DB row for the slug. A slug whose DB program row exists
// but is archived/draft (so the published-tree read is null) must resolve to
// undefined — NOT silently fall back to the static program. We mock the store
// read layer so no live DB is needed.

const getPublishedProgramTreeRows = vi.fn();
const programExistsBySlug = vi.fn();

vi.mock("./store", () => ({
  getPublishedProgramTreeRows: (slug: string) => getPublishedProgramTreeRows(slug),
  programExistsBySlug: (slug: string) => programExistsBySlug(slug),
  // Unused by these tests but imported by repository.ts.
  assembleProgram: vi.fn(),
  getProgramVersionTreeRows: vi.fn(),
  listPublishedProgramSummaries: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  withScope: (fn: (scope: unknown) => void) => fn({ setLevel: vi.fn() }),
  captureException: vi.fn(),
}));

const { getProgramAsync } = await import("./repository");

beforeEach(() => {
  getPublishedProgramTreeRows.mockReset();
  programExistsBySlug.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("getProgramAsync (unpublished-DB-row contract)", () => {
  it("returns undefined for a builtin slug whose DB row exists but is unpublished (no static fallback)", async () => {
    // The static program DOES exist for this slug — proving we are NOT falling
    // back to it: the DB row exists (archived/draft) so it's deliberately hidden.
    const slug = "kaelyn-adaptive-archived-test";
    expect(getProgram(slug)).toBeUndefined(); // sanity: not a real static slug
    getPublishedProgramTreeRows.mockResolvedValue(null); // not published
    programExistsBySlug.mockResolvedValue(true); // but a DB row exists

    const result = await getProgramAsync(slug);
    expect(result).toBeUndefined();
    expect(programExistsBySlug).toHaveBeenCalledWith(slug);
  });

  it("hides a real static builtin when its DB row is archived/draft", async () => {
    // kaelyn-adaptive IS a static program; if its DB row exists but is
    // unpublished, getProgramAsync must NOT serve the static copy.
    const slug = "kaelyn-adaptive";
    expect(getProgram(slug)).toBeDefined(); // static copy exists
    getPublishedProgramTreeRows.mockResolvedValue(null);
    programExistsBySlug.mockResolvedValue(true);

    const result = await getProgramAsync(slug);
    expect(result).toBeUndefined();
  });

  it("falls back to the static program when there is NO DB row for the slug", async () => {
    const slug = "kaelyn-adaptive";
    getPublishedProgramTreeRows.mockResolvedValue(null);
    programExistsBySlug.mockResolvedValue(false); // no DB row at all

    const result = await getProgramAsync(slug);
    expect(result).toBeDefined();
    expect(result?.slug).toBe("kaelyn-adaptive");
  });

  it("falls back to the static program when the existence check itself errors", async () => {
    const slug = "kaelyn-adaptive";
    getPublishedProgramTreeRows.mockResolvedValue(null);
    programExistsBySlug.mockRejectedValue(new Error("db down during exists check"));

    const result = await getProgramAsync(slug);
    expect(result).toBeDefined();
    expect(result?.slug).toBe("kaelyn-adaptive");
  });
});
