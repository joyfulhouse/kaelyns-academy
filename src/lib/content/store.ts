/**
 * Async content store: DB row types, the pure tree assembler, and thin DB-read
 * helpers. Nothing here is called at module top-level (build-safe). The
 * repository layer (repository.ts) is the public API; this file is its
 * implementation detail.
 */
import { eq } from "drizzle-orm";
import type { ActivityKind } from "@/content/activity-configs";
import { ACTIVITY_CONFIG_SCHEMAS } from "@/content/activity-configs";
import type { Activity, Band, Program, SkillTag, Unit, Lesson, World } from "@/content/types";
import { captureNonCritical } from "@/lib/capture";
import { getDb, schema } from "@/lib/db";

// ── Row types from Drizzle ───────────────────────────────────────────────────

type ProgramVersionRow = typeof schema.programVersion.$inferSelect;
type UnitRow = typeof schema.unit.$inferSelect;
type LessonRow = typeof schema.lesson.$inferSelect;
type ActivityRow = typeof schema.activity.$inferSelect;

/**
 * The flattened bag of DB rows needed to assemble one Program tree.
 * `version.programSlug` is augmented (from the parent `program` row) because
 * the version table has no slug column; the slug travels through with the row.
 */
export interface ProgramTreeRows {
  version: ProgramVersionRow & { programSlug: string };
  units: UnitRow[];
  lessons: LessonRow[];
  activities: ActivityRow[];
}

/** Light catalog metadata — no full tree. */
export interface ProgramSummary {
  slug: string;
  title: string;
  subtitle: string | null;
  ageBand: string | null;
  summary: string | null;
  world: string | null;
  languages: string[];
}

// ── Pure tree assembler ──────────────────────────────────────────────────────

/**
 * Build a `Program` (the @/content runtime shape) from flat DB rows.
 * - Units, lessons, and activities are ordered by `orderKey` ascending
 *   (locale-insensitive text sort; keys are authored as zero-padded strings).
 * - Each activity row is validated against its kind's config schema. A row
 *   with an unknown kind or failing schema is silently DROPPED and reported
 *   via `captureNonCritical` — a single bad row must never crash a learner.
 * PURE: no I/O, no side effects beyond the captureNonCritical call.
 */
export function assembleProgram(rows: ProgramTreeRows): Program {
  const { version, units, lessons, activities } = rows;

  const sortedUnits = [...units].sort((a, b) => a.orderKey.localeCompare(b.orderKey));

  return {
    slug: version.programSlug,
    title: version.title,
    subtitle: version.subtitle ?? "",
    ageBand: version.ageBand ?? "",
    summary: version.summary ?? "",
    units: sortedUnits.map((unitRow, unitIndex): Unit => {
      const unitLessons = lessons
        .filter((l) => l.unitId === unitRow.id)
        .sort((a, b) => a.orderKey.localeCompare(b.orderKey));

      return {
        id: unitRow.id,
        order: unitIndex,
        title: unitRow.title,
        emoji: unitRow.emoji ?? "",
        world: (unitRow.world as World) ?? "sunshine",
        bigIdea: unitRow.bigIdea ?? "",
        phonicsFocus: unitRow.phonicsFocus ?? "",
        mathFocus: unitRow.mathFocus ?? "",
        project: unitRow.project ?? "",
        ...(unitRow.checkpoint != null
          ? { checkpoint: unitRow.checkpoint as "baseline" | "mid" | "final" }
          : {}),
        lessons: unitLessons.map((lessonRow, lessonIndex): Lesson => {
          const lessonActivities = activities
            .filter((a) => a.lessonId === lessonRow.id)
            .sort((a, b) => a.orderKey.localeCompare(b.orderKey));

          const assembledActivities: Activity[] = [];
          for (const actRow of lessonActivities) {
            const activity = assembleActivity(actRow);
            if (activity !== null) assembledActivities.push(activity);
          }

          return {
            id: lessonRow.id,
            order: lessonIndex,
            title: lessonRow.title,
            activities: assembledActivities,
          };
        }),
      };
    }),
  };
}

/** Validate one activity row against its config schema; return null on failure. */
function assembleActivity(row: ActivityRow): Activity | null {
  const kind = row.kind as ActivityKind;
  const schema = ACTIVITY_CONFIG_SCHEMAS[kind];
  if (schema === undefined) {
    captureNonCritical(
      "activity config invalid",
      new Error(`Unknown activity kind: ${row.kind} (id=${row.id})`),
    );
    return null;
  }

  const parsed = schema.safeParse(row.config);
  if (!parsed.success) {
    captureNonCritical("activity config invalid", parsed.error);
    return null;
  }

  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    ...(row.blurb != null ? { blurb: row.blurb } : {}),
    ...(row.estMinutes != null ? { estMinutes: row.estMinutes } : {}),
    band: row.band as Band,
    skillTags: row.skillTags as SkillTag[],
    ...(row.standardTags.length > 0 ? { standardTags: row.standardTags as string[] } : {}),
    config: parsed.data,
  } as Activity; // cast: discriminated union — kind+config pair validated above
}

// ── DB read helpers (thin glue — not unit-tested, getDb() inside functions) ──

/**
 * Load the full program tree for the currently-published version of a program.
 * Returns null when the program is not found or has no published version.
 */
export async function getPublishedProgramTreeRows(slug: string): Promise<ProgramTreeRows | null> {
  const db = getDb();

  const programRow = await db.query.program.findFirst({
    where: (p, { and }) =>
      and(eq(p.slug, slug), eq(p.status, "published")),
  });
  if (!programRow?.publishedVersionId) return null;

  return getProgramVersionTreeRows(programRow.publishedVersionId, slug);
}

/**
 * Load the full program tree for a specific version id (used for enrollment
 * pinning — a learner stays on the version they enrolled on).
 * Returns null when the version is not found.
 */
export async function getProgramVersionTreeRows(
  versionId: string,
  slugHint?: string,
): Promise<ProgramTreeRows | null> {
  const db = getDb();

  const versionRow = await db.query.programVersion.findFirst({
    where: (v) => eq(v.id, versionId),
  });
  if (!versionRow) return null;

  // Resolve slug: prefer the hint (already known from the program lookup) to
  // avoid a second query; fall back to fetching the parent program row.
  let programSlug = slugHint;
  if (!programSlug) {
    const programRow = await db.query.program.findFirst({
      where: (p) => eq(p.id, versionRow.programId),
    });
    if (!programRow) return null;
    programSlug = programRow.slug;
  }

  const units = await db.query.unit.findMany({
    where: (u) => eq(u.programVersionId, versionId),
  });

  const unitIds = units.map((u) => u.id);

  const lessons =
    unitIds.length === 0
      ? []
      : await db.query.lesson.findMany({
          where: (l, { inArray }) => inArray(l.unitId, unitIds),
        });

  const lessonIds = lessons.map((l) => l.id);

  const activities =
    lessonIds.length === 0
      ? []
      : await db.query.activity.findMany({
          where: (a, { inArray }) => inArray(a.lessonId, lessonIds),
        });

  return {
    version: { ...versionRow, programSlug },
    units,
    lessons,
    activities,
  };
}

/**
 * Return the `publishedVersionId` for a published program by slug.
 * Returns null when the program is absent, not published, or the DB is
 * unreachable (mirrors the repository layer's "try DB → return null" pattern).
 */
export async function getPublishedVersionId(slug: string): Promise<string | null> {
  try {
    const db = getDb();
    const row = await db.query.program.findFirst({
      where: (p, { and }) => and(eq(p.slug, slug), eq(p.status, "published")),
    });
    return row?.publishedVersionId ?? null;
  } catch {
    return null;
  }
}

/**
 * Light catalog metadata — slug, title, subtitle, ageBand, summary, world,
 * languages — without loading the full tree.
 */
export async function listPublishedProgramSummaries(): Promise<ProgramSummary[]> {
  const db = getDb();

  const programs = await db.query.program.findMany({
    where: (p) => eq(p.status, "published"),
  });

  const summaries: ProgramSummary[] = [];
  for (const prog of programs) {
    if (!prog.publishedVersionId) continue;
    const version = await db.query.programVersion.findFirst({
      where: (v) => eq(v.id, prog.publishedVersionId!),
    });
    if (!version) continue;
    summaries.push({
      slug: prog.slug,
      title: version.title,
      subtitle: version.subtitle,
      ageBand: version.ageBand,
      summary: version.summary,
      world: version.world,
      languages: version.languages,
    });
  }

  return summaries;
}
