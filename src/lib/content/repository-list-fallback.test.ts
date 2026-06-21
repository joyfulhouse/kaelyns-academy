import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The list resolvers' static-fallback contract (C#6). When the PUBLISHED-list
// read is empty, the static catalog is served ONLY when the DB has no program
// rows at all. If program rows exist but none are published (all draft/archived),
// the catalog is deliberately empty → return [] (no static resurrection). A
// thrown DB error still falls back to static. We mock the store read layer so no
// live DB is needed.

const listPublishedProgramSummaries = vi.fn();
const anyProgramExists = vi.fn();
const captureException = vi.fn();

vi.mock("./store", () => ({
  listPublishedProgramSummaries: () => listPublishedProgramSummaries(),
  anyProgramExists: () => anyProgramExists(),
  // Imported by repository.ts but unused by these list-path tests.
  getPublishedProgramTreeRows: vi.fn(),
  getProgramVersionTreeRows: vi.fn(),
  assembleProgram: vi.fn(),
  programExistsBySlug: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  withScope: (fn: (scope: unknown) => void) => fn({ setLevel: vi.fn() }),
  captureException: (e: unknown) => captureException(e),
}));

const { listProgramSummariesAsync, listProgramsAsync } = await import("./repository");
const { listPrograms } = await import("@/content");

beforeEach(() => {
  listPublishedProgramSummaries.mockReset();
  anyProgramExists.mockReset();
  captureException.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe("listProgramSummariesAsync (empty-published fallback contract)", () => {
  it("returns [] (no static fallback) when programs exist but none are published", async () => {
    listPublishedProgramSummaries.mockResolvedValue([]); // none published
    anyProgramExists.mockResolvedValue(true); // but rows exist (draft/archived)

    const result = await listProgramSummariesAsync();
    expect(result).toEqual([]);
    expect(anyProgramExists).toHaveBeenCalledOnce();
    expect(captureException).not.toHaveBeenCalled();
  });

  it("falls back to static summaries when the DB has no program rows at all", async () => {
    listPublishedProgramSummaries.mockResolvedValue([]);
    anyProgramExists.mockResolvedValue(false); // no rows

    const result = await listProgramSummariesAsync();
    expect(result.length).toBe(listPrograms().length);
  });

  it("falls back to static summaries when the published-list read throws", async () => {
    listPublishedProgramSummaries.mockRejectedValue(new Error("db down"));

    const result = await listProgramSummariesAsync();
    expect(result.length).toBe(listPrograms().length);
    expect(captureException).toHaveBeenCalledOnce();
  });

  it("falls back to static summaries when the existence check itself throws", async () => {
    listPublishedProgramSummaries.mockResolvedValue([]);
    anyProgramExists.mockRejectedValue(new Error("db down during exists check"));

    const result = await listProgramSummariesAsync();
    expect(result.length).toBe(listPrograms().length);
    expect(captureException).toHaveBeenCalledOnce();
  });
});

describe("listProgramsAsync (empty-published fallback contract)", () => {
  it("returns [] (no static fallback) when programs exist but none are published", async () => {
    listPublishedProgramSummaries.mockResolvedValue([]);
    anyProgramExists.mockResolvedValue(true);

    const result = await listProgramsAsync();
    expect(result).toEqual([]);
    expect(anyProgramExists).toHaveBeenCalledOnce();
  });

  it("falls back to the static program list when the DB has no program rows", async () => {
    listPublishedProgramSummaries.mockResolvedValue([]);
    anyProgramExists.mockResolvedValue(false);

    const result = await listProgramsAsync();
    expect(result.length).toBe(listPrograms().length);
  });

  it("falls back to the static program list when the published-list read throws", async () => {
    listPublishedProgramSummaries.mockRejectedValue(new Error("db down"));

    const result = await listProgramsAsync();
    expect(result.length).toBe(listPrograms().length);
    expect(captureException).toHaveBeenCalledOnce();
  });
});
