/**
 * Async content repository — the runtime seam for all curriculum reads.
 *
 * Every resolver is `cache()`-wrapped (React per-request memoization) and
 * follows the DB-preferred, static-fallback contract:
 *   1. Try the DB (getPublishedProgramTreeRows / etc.).
 *   2. On null result (no rows) OR any thrown error (incl. missing DATABASE_URL),
 *      fall back to the static @/content module.
 *   3. For genuine DB errors (not just "no rows"), call captureNonCritical.
 *
 * Nothing in this file is called at import time — fully build-safe.
 * This module imports FROM @/content for fallback; @/content does NOT import
 * from here (no import cycle).
 */
import { cache } from "react";
import {
  findActivity,
  getProgram,
  listPrograms,
  PROGRAMS,
} from "@/content";
import { captureNonCritical } from "@/lib/capture";
import {
  anyProgramExists,
  assembleProgram,
  getPublishedProgramTreeRows,
  getProgramVersionTreeRows,
  listPublishedProgramSummaries,
  programExistsBySlug,
} from "./store";
import type { ProgramSummary } from "./store";

import type { Program } from "@/content/types";

export type { ProgramSummary };

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Summaries derived from static PROGRAMS for use as fallback. */
function staticSummaries(): ProgramSummary[] {
  return PROGRAMS.map((p) => ({
    slug: p.slug,
    title: p.title,
    subtitle: p.subtitle,
    ageBand: p.ageBand,
    summary: p.summary,
    world: null,
    languages: [],
  }));
}

/**
 * The list analog of getProgramAsync's existence guard. When the published-list
 * read came back EMPTY, decide whether to serve the static catalog:
 *   - no `program` rows exist at all → static fallback is fine (true)
 *   - program rows exist but none are published (all draft/archived) → the
 *     catalog is deliberately empty; do NOT resurrect static programs (false)
 *   - the existence check itself errors → fall back to static (true), so a DB
 *     blip degrades to the built-in catalog rather than an empty store.
 */
async function shouldStaticFallbackForEmptyList(): Promise<boolean> {
  try {
    return !(await anyProgramExists());
  } catch (existsErr) {
    captureNonCritical("content repository existence check failed (list)", existsErr);
    return true;
  }
}

// ── Exported resolvers (cache()-wrapped) ─────────────────────────────────────

/**
 * Resolve a program by slug.
 * DB-preferred: assembles from the published version in the DB.
 *
 * Fallback contract (matters for archived/draft builtins): the static program is
 * a fallback ONLY when there is no DB row for this slug. If the published-tree
 * read is null because a DB `program` row exists but isn't published
 * (archived/draft), we return `undefined` — a deliberately-unpublished program
 * must NOT silently resurrect via `/learn/{slug}`. A genuine DB error (or a slug
 * with no DB row at all) still falls back to the static program.
 * Returns undefined only when there is nothing to serve.
 */
export const getProgramAsync: (slug: string) => Promise<Program | undefined> = cache(
  async (slug: string): Promise<Program | undefined> => {
    try {
      const rows = await getPublishedProgramTreeRows(slug);
      if (rows !== null) return assembleProgram(rows);

      // No published tree. Distinguish "no DB row at all" (static fallback OK)
      // from "DB row exists but is archived/draft" (deliberately unpublished →
      // no fallback). If the existence check itself errors, fall back to static.
      try {
        if (await programExistsBySlug(slug)) return undefined;
      } catch (existsErr) {
        captureNonCritical("content repository existence check failed (getProgramAsync)", existsErr);
      }
    } catch (err) {
      // Real error (e.g. missing DATABASE_URL, connection refused) — report and fall through.
      captureNonCritical("content repository DB error (getProgramAsync)", err);
    }

    return getProgram(slug);
  },
);

/**
 * Resolve a program by explicit version id (for enrollment-pinned reads).
 * No static fallback — a version id is DB-specific; return undefined if absent.
 */
export const getProgramVersionAsync: (versionId: string) => Promise<Program | undefined> = cache(
  async (versionId: string): Promise<Program | undefined> => {
    try {
      const rows = await getProgramVersionTreeRows(versionId);
      if (rows !== null) return assembleProgram(rows);
    } catch (err) {
      captureNonCritical("content repository DB error (getProgramVersionAsync)", err);
    }
    return undefined;
  },
);

/**
 * List all published programs.
 * DB-preferred: assembles each program from its published version.
 * Falls back to the static PROGRAMS array when DB is empty or unreachable.
 */
export const listProgramsAsync: () => Promise<Program[]> = cache(
  async (): Promise<Program[]> => {
    try {
      const summaries = await listPublishedProgramSummaries();
      if (summaries.length > 0) {
        const programs: Program[] = [];
        for (const summary of summaries) {
          const program = await getProgramAsync(summary.slug);
          if (program !== undefined) programs.push(program);
        }
        if (programs.length > 0) return programs;
      }
      // Zero PUBLISHED programs. Only fall back to the static catalog when the DB
      // has no program rows at all — if rows exist but none are published, the
      // catalog is deliberately empty (don't resurrect static programs).
      if (!(await shouldStaticFallbackForEmptyList())) return [];
    } catch (err) {
      // Real DB error (e.g. missing DATABASE_URL, connection refused) → static fallback.
      captureNonCritical("content repository DB error (listProgramsAsync)", err);
    }
    return listPrograms();
  },
);

/**
 * List light catalog summaries (slug, title, subtitle, ageBand, summary,
 * world, languages) without loading full trees.
 * Falls back to summaries derived from static PROGRAMS.
 */
export const listProgramSummariesAsync: () => Promise<ProgramSummary[]> = cache(
  async (): Promise<ProgramSummary[]> => {
    try {
      const summaries = await listPublishedProgramSummaries();
      if (summaries.length > 0) return summaries;
      // Zero PUBLISHED programs. Only fall back to static summaries when the DB
      // has no program rows at all — if rows exist but none are published, the
      // catalog is deliberately empty (don't resurrect static programs).
      if (!(await shouldStaticFallbackForEmptyList())) return [];
    } catch (err) {
      // Real DB error → static fallback.
      captureNonCritical("content repository DB error (listProgramSummariesAsync)", err);
    }
    return staticSummaries();
  },
);

/**
 * Find the program that owns a given activity id.
 * Uses the full program list (DB-preferred, static fallback) + the pure
 * `findActivity` walker from @/content.
 */
export const findProgramByActivityIdAsync: (
  activityId: string,
) => Promise<Program | undefined> = cache(async (activityId: string): Promise<Program | undefined> => {
  const programs = await listProgramsAsync();
  return programs.find((p) => findActivity(p, activityId) !== undefined);
});

// ── Enrollment-pinned resolution ─────────────────────────────────────────────

/**
 * Pure decision: given an enrollment's pinned `programVersionId` and the two
 * resolvers, pick which tree to serve. Factored out so the dispatch is unit
 * testable without a DB.
 *
 *   - pinned id set → resolve THAT version; if the version row is gone
 *     (`undefined`), fall back to the current published/static tree.
 *   - no pin (null `programVersionId`, OR no/unowned enrollment → `null`) →
 *     resolve the current published/static tree by slug.
 *
 * `byVersion`/`bySlug` are passed in (not closed over) so the test can supply
 * fakes and assert exactly which path was taken.
 */
export async function resolveProgramByVersionPin(
  pin: { programVersionId: string | null } | null,
  byVersion: (versionId: string) => Promise<Program | undefined>,
  bySlug: () => Promise<Program | undefined>,
): Promise<Program | undefined> {
  const versionId = pin?.programVersionId;
  if (versionId) {
    const pinned = await byVersion(versionId);
    if (pinned !== undefined) return pinned;
    // The pinned version row is gone (e.g. hard-deleted) — degrade to the
    // current published/static tree rather than 404 the learner's whole world.
  }
  return bySlug();
}

/**
 * Resolve the program a specific learner should see for `slug`, honoring the
 * enrollment's version pin (C#5). The single seam both the learner state action
 * (tree + progress scoping) and the §8 AI gate go through, so all three agree on
 * the learner's version.
 *
 * Reads the learner's enrollment version (ownership-checked) and dispatches via
 * {@link resolveProgramByVersionPin}: a pinned version is served as-is (with a
 * fall-back to current published if that version row is gone); a null pin / no
 * enrollment / unowned learner falls back to the current published (or static)
 * tree by slug — the guest-equivalent the picker + gate handle separately.
 *
 * Build-safe: the tutor store is imported lazily (per-request), never at module
 * top level. `cache()`-wrapped for per-request memoization like the other
 * resolvers.
 */
export const resolveLearnerProgram: (
  accountId: string,
  learnerId: string,
  slug: string,
) => Promise<Program | undefined> = cache(
  async (accountId: string, learnerId: string, slug: string): Promise<Program | undefined> => {
    let pin: { programVersionId: string | null } | null = null;
    try {
      const { getEnrollmentVersionId } = await import("@/lib/tutor/store");
      pin = await getEnrollmentVersionId(accountId, learnerId, slug);
    } catch (err) {
      // A DB blip reading the pin must not break the learner surface — degrade to
      // the current published/static tree (the null-pin path) rather than crash.
      captureNonCritical("resolveLearnerProgram enrollment-pin read failed", err);
      pin = null;
    }
    return resolveProgramByVersionPin(
      pin,
      (versionId) => getProgramVersionAsync(versionId),
      () => getProgramAsync(slug),
    );
  },
);
