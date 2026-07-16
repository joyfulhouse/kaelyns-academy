/**
 * Tests for the enrollment-version-pin resolution (C#5).
 *
 *  - `resolveProgramByVersionPin` is pure: assert the dispatch decision directly
 *    (pinned → version tree; set pin whose version can't resolve → undefined,
 *    fail-closed with NO slug fallback; null pin / no-enrollment → published).
 *  - `resolveAccountLearnerProgram` is exercised against a MOCKED store (no DB): a
 *    pinned enrollment resolves the version tree; an unowned/absent enrollment
 *    (store returns null) falls back to the current published/static tree.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Program } from "@/content";

// Mock the tutor store so resolveAccountLearnerProgram needs no DB. getProgramVersionAsync
// has NO static fallback, so to assert the pinned path we also stub the version
// tree read in the content store; the slug path uses the real no-DB static fallback.
vi.mock("@/lib/tutor/store", () => ({ getEnrollmentVersionId: vi.fn() }));
vi.mock("./store", async (importActual) => ({
  ...(await importActual<typeof import("./store")>()),
  getProgramVersionTreeRows: vi.fn(),
}));

const {
  resolveProgramByVersionPin,
  resolveProgramForEnrollmentVersion,
  resolveAccountLearnerProgram,
} = await import("./repository");
const { getEnrollmentVersionId } = await import("@/lib/tutor/store");
const { getProgramVersionTreeRows } = await import("./store");

const PROG_A = { slug: "prog-a", title: "Program A" } as unknown as Program;
const PROG_PUBLISHED = { slug: "prog-pub", title: "Published" } as unknown as Program;

afterEach(() => vi.resetAllMocks());

describe("resolveProgramByVersionPin (pure dispatch)", () => {
  it("serves the pinned version tree when a version id is set and present", async () => {
    const byVersion = vi.fn(async () => PROG_A);
    const bySlug = vi.fn(async () => PROG_PUBLISHED);
    const result = await resolveProgramByVersionPin({ programVersionId: "v-1" }, byVersion, bySlug);
    expect(result).toBe(PROG_A);
    expect(byVersion).toHaveBeenCalledWith("v-1");
    expect(bySlug).not.toHaveBeenCalled();
  });

  it("fails closed (returns undefined, no slug fallback) when a set pin's version can't be resolved", async () => {
    const byVersion = vi.fn(async () => undefined);
    const bySlug = vi.fn(async () => PROG_PUBLISHED);
    const result = await resolveProgramByVersionPin({ programVersionId: "v-gone" }, byVersion, bySlug);
    // A set pin resolves to THAT version or nothing — never the current published
    // tree (that would silently move a pinned learner onto unassigned content).
    expect(result).toBeUndefined();
    expect(byVersion).toHaveBeenCalledWith("v-gone");
    expect(bySlug).not.toHaveBeenCalled();
  });

  it("uses the published tree when the pin is null (lazy/default enrollment)", async () => {
    const byVersion = vi.fn(async () => PROG_A);
    const bySlug = vi.fn(async () => PROG_PUBLISHED);
    const result = await resolveProgramByVersionPin({ programVersionId: null }, byVersion, bySlug);
    expect(result).toBe(PROG_PUBLISHED);
    expect(byVersion).not.toHaveBeenCalled();
    expect(bySlug).toHaveBeenCalledOnce();
  });

  it("uses the published tree when there is no enrollment (pin null)", async () => {
    const byVersion = vi.fn(async () => PROG_A);
    const bySlug = vi.fn(async () => PROG_PUBLISHED);
    const result = await resolveProgramByVersionPin(null, byVersion, bySlug);
    expect(result).toBe(PROG_PUBLISHED);
    expect(byVersion).not.toHaveBeenCalled();
    expect(bySlug).toHaveBeenCalledOnce();
  });
});

describe("resolveAccountLearnerProgram (mocked store, no DB)", () => {
  beforeEach(() => {
    // A version tree read that returns one assemblable version row set. The
    // shape only needs to survive assembleProgram for this slug-agnostic check.
    vi.mocked(getProgramVersionTreeRows).mockResolvedValue({
      version: {
        id: "v-1",
        programId: "p-1",
        version: 2,
        status: "published",
        title: "Pinned Program v2",
        subtitle: null,
        ageBand: "6-7",
        summary: null,
        world: null,
        locale: "en",
        languages: [],
        publishedAt: new Date(),
        createdAt: new Date(),
        programSlug: "kaelyn-adaptive",
      },
      units: [],
      lessons: [],
      activities: [],
    });
  });

  it("resolves the PINNED version tree when the enrollment is pinned", async () => {
    vi.mocked(getEnrollmentVersionId).mockResolvedValue({ programVersionId: "v-1" });
    const result = await resolveAccountLearnerProgram("acc-1", "l-1", "kaelyn-adaptive");
    expect(getEnrollmentVersionId).toHaveBeenCalledWith("acc-1", "l-1", "kaelyn-adaptive");
    expect(getProgramVersionTreeRows).toHaveBeenCalledWith("v-1");
    expect(result?.title).toBe("Pinned Program v2");
  });

  it("fails closed when a pin names a version owned by a different program slug", async () => {
    vi.mocked(getEnrollmentVersionId).mockResolvedValue({ programVersionId: "v-1" });
    vi.mocked(getProgramVersionTreeRows).mockResolvedValue({
      version: {
        id: "v-1",
        programId: "other-program-id",
        version: 1,
        status: "published",
        title: "Other program",
        subtitle: null,
        ageBand: null,
        summary: null,
        world: null,
        locale: "en",
        languages: [],
        publishedAt: new Date(),
        createdAt: new Date(),
        programSlug: "world-languages",
      },
      units: [],
      lessons: [],
      activities: [],
    });

    await expect(
      resolveAccountLearnerProgram("acc-1", "l-1", "kaelyn-adaptive"),
    ).resolves.toBeUndefined();
  });

  it("falls back to the current published/static tree when unowned/no enrollment (store → null)", async () => {
    vi.mocked(getEnrollmentVersionId).mockResolvedValue(null);
    const result = await resolveAccountLearnerProgram("acc-1", "l-1", "kaelyn-adaptive");
    // No version read; resolves the slug's published (here: static fallback) tree.
    expect(getProgramVersionTreeRows).not.toHaveBeenCalled();
    expect(result?.slug).toBe("kaelyn-adaptive");
  });

  it("falls back to the published tree when the enrollment pin is null", async () => {
    vi.mocked(getEnrollmentVersionId).mockResolvedValue({ programVersionId: null });
    const result = await resolveAccountLearnerProgram("acc-1", "l-1", "kaelyn-adaptive");
    expect(getProgramVersionTreeRows).not.toHaveBeenCalled();
    expect(result?.slug).toBe("kaelyn-adaptive");
  });

  it("fails closed when the enrollment pin read throws", async () => {
    vi.mocked(getEnrollmentVersionId).mockRejectedValue(new Error("pin database unavailable"));

    await expect(
      resolveAccountLearnerProgram("acc-1", "l-1", "kaelyn-adaptive"),
    ).rejects.toThrow("pin database unavailable");
    expect(getProgramVersionTreeRows).not.toHaveBeenCalled();
  });
});

describe("resolveProgramForEnrollmentVersion", () => {
  it("resolves the exact supplied version without rereading enrollment state", async () => {
    vi.mocked(getProgramVersionTreeRows).mockResolvedValue({
      version: {
        id: "v-1",
        programId: "p-1",
        version: 1,
        status: "published",
        title: "Exact v1",
        subtitle: null,
        ageBand: "6-7",
        summary: null,
        world: null,
        locale: "en",
        languages: [],
        publishedAt: new Date(),
        createdAt: new Date(),
        programSlug: "kaelyn-adaptive",
      },
      units: [],
      lessons: [],
      activities: [],
    });

    const result = await resolveProgramForEnrollmentVersion("kaelyn-adaptive", "v-1");

    expect(result?.title).toBe("Exact v1");
    expect(getEnrollmentVersionId).not.toHaveBeenCalled();
    expect(getProgramVersionTreeRows).toHaveBeenCalledWith("v-1");
  });

  it("rejects an exact version whose parent program does not match the supplied slug", async () => {
    vi.mocked(getProgramVersionTreeRows).mockResolvedValue({
      version: {
        id: "v-other",
        programId: "p-other",
        version: 1,
        status: "published",
        title: "Wrong parent",
        subtitle: null,
        ageBand: null,
        summary: null,
        world: null,
        locale: "en",
        languages: [],
        publishedAt: new Date(),
        createdAt: new Date(),
        programSlug: "world-languages",
      },
      units: [],
      lessons: [],
      activities: [],
    });

    await expect(
      resolveProgramForEnrollmentVersion("kaelyn-adaptive", "v-other"),
    ).resolves.toBeUndefined();
  });
});
