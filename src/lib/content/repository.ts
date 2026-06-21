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
    } catch (err) {
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
    } catch (err) {
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
