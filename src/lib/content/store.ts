/**
 * Async content store: DB row types, the pure tree assembler, thin DB-read
 * helpers, and transactional DB-write mutations for the admin authoring API.
 * Nothing here is called at module top-level (build-safe). The repository
 * layer (repository.ts) is the public API for reads; the admin actions layer
 * calls the write mutations directly.
 */
import { eq, max, and, ne } from "drizzle-orm";
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
        order: unitIndex + 1,
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
            order: lessonIndex + 1,
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

// ── Editable-version types (admin authoring API) ─────────────────────────────

/** Metadata fields shared by VersionMetadata and EditableVersion. */
export interface VersionMetadata {
  title: string;
  subtitle?: string;
  ageBand?: string;
  summary?: string;
  world?: string;
  locale?: string;
  languages: string[];
}

export interface EditableActivity {
  activityKey: string;
  kind: string;
  title: string;
  blurb?: string;
  estMinutes?: number;
  band: string;
  skillTags: string[];
  standardTags: string[];
  config: unknown;
}

export interface EditableLesson {
  lessonKey: string;
  title: string;
  activities: EditableActivity[];
}

export interface EditableUnit {
  unitKey: string;
  title: string;
  emoji?: string;
  world: string;
  bigIdea?: string;
  phonicsFocus?: string;
  mathFocus?: string;
  project?: string;
  checkpoint?: string;
  lessons: EditableLesson[];
}

/** Full editable snapshot of a program version (any status). */
export interface EditableVersion {
  programId: string;
  versionId: string;
  version: number;
  status: string;
  slug: string;
  metadata: VersionMetadata;
  units: EditableUnit[];
}

/** Row returned by listAdminPrograms. */
export interface AdminProgramRow {
  programId: string;
  slug: string;
  status: string;
  latestVersionId: string | null;
  latestVersion: number | null;
  publishedVersionId: string | null;
  title: string;
}

// ── Typed mutation errors ─────────────────────────────────────────────────────

/** Thrown when a slug is already in use (maps to reason:"invalid" in actions). */
export class DuplicateSlugError extends Error {
  constructor(slug: string) {
    super(`A program with slug "${slug}" already exists`);
    this.name = "DuplicateSlugError";
  }
}

/** Thrown when a mutation is attempted on an immutable (non-draft) version. */
export class VersionNotDraftError extends Error {
  constructor(versionId: string, status: string) {
    super(`Version "${versionId}" is "${status}", not draft`);
    this.name = "VersionNotDraftError";
  }
}

/** Thrown when activity config fails schema validation during saveVersionTree. */
export class ActivityConfigValidationError extends Error {
  constructor(activityKey: string, message: string) {
    super(`Activity "${activityKey}" config validation failed: ${message}`);
    this.name = "ActivityConfigValidationError";
  }
}

// ── PURE: version-tree row builder ───────────────────────────────────────────

/**
 * PURE. Build the ordered set of DB-insert values for a draft version's tree
 * from the submitted `EditableUnit[]`. `orderKey` uses `String(i).padStart(6,"0")`
 * per sibling level, matching the Slice 1 seed pattern.
 *
 * Returns `{ units, lessons, activities }` with stable-typed insert rows.
 * The IDs are generated here so callers can insert without back-fetching.
 * PURE: no I/O; only deterministic transforms.
 */
export function buildVersionTreeRows(
  versionId: string,
  units: EditableUnit[],
): {
  units: (typeof schema.unit.$inferInsert)[];
  lessons: (typeof schema.lesson.$inferInsert)[];
  activities: (typeof schema.activity.$inferInsert)[];
} {
  const unitRows: (typeof schema.unit.$inferInsert)[] = [];
  const lessonRows: (typeof schema.lesson.$inferInsert)[] = [];
  const activityRows: (typeof schema.activity.$inferInsert)[] = [];

  for (let ui = 0; ui < units.length; ui++) {
    const u = units[ui];
    const unitId = globalThis.crypto.randomUUID();

    unitRows.push({
      id: unitId,
      programVersionId: versionId,
      unitKey: u.unitKey,
      orderKey: String(ui).padStart(6, "0"),
      title: u.title,
      emoji: u.emoji ?? null,
      world: u.world,
      bigIdea: u.bigIdea ?? null,
      phonicsFocus: u.phonicsFocus ?? null,
      mathFocus: u.mathFocus ?? null,
      project: u.project ?? null,
      checkpoint: u.checkpoint ?? null,
    });

    for (let li = 0; li < u.lessons.length; li++) {
      const l = u.lessons[li];
      const lessonId = globalThis.crypto.randomUUID();

      lessonRows.push({
        id: lessonId,
        unitId,
        lessonKey: l.lessonKey,
        orderKey: String(li).padStart(6, "0"),
        title: l.title,
      });

      for (let ai = 0; ai < l.activities.length; ai++) {
        const a = l.activities[ai];
        activityRows.push({
          id: globalThis.crypto.randomUUID(),
          lessonId,
          activityKey: a.activityKey,
          orderKey: String(ai).padStart(6, "0"),
          kind: a.kind,
          title: a.title,
          blurb: a.blurb ?? null,
          estMinutes: a.estMinutes ?? null,
          band: a.band,
          skillTags: a.skillTags,
          standardTags: a.standardTags,
          config: a.config,
        });
      }
    }
  }

  return { units: unitRows, lessons: lessonRows, activities: activityRows };
}

// ── DB mutations (transactional where multi-row) ──────────────────────────────

/**
 * Insert a new `program` (status `draft`) + its first `program_version`
 * (version 1, status `draft`). Rejects a duplicate slug.
 */
export async function createProgramDraft(input: {
  slug: string;
  title: string;
  subtitle?: string;
  ageBand?: string;
  summary?: string;
  world?: string;
  locale?: string;
  languages?: string[];
  publisherId?: string | null;
}): Promise<{ programId: string; versionId: string }> {
  const db = getDb();

  // Check for duplicate slug before opening a transaction to give a clean error.
  const existing = await db.query.program.findFirst({
    where: (p) => eq(p.slug, input.slug),
  });
  if (existing) throw new DuplicateSlugError(input.slug);

  const programId = globalThis.crypto.randomUUID();
  const versionId = globalThis.crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(schema.program).values({
      id: programId,
      slug: input.slug,
      status: "draft",
      publisherId: input.publisherId ?? null,
      publishedVersionId: null,
    });
    await tx.insert(schema.programVersion).values({
      id: versionId,
      programId,
      version: 1,
      status: "draft",
      title: input.title,
      subtitle: input.subtitle ?? null,
      ageBand: input.ageBand ?? null,
      summary: input.summary ?? null,
      world: input.world ?? null,
      locale: input.locale ?? null,
      languages: input.languages ?? [],
    });
  });

  return { programId, versionId };
}

/**
 * Load any version (any status) plus its full tree as editable rows.
 * Config is returned raw (no validation drop) so the editor can surface issues.
 */
export async function loadVersionForEdit(versionId: string): Promise<EditableVersion | null> {
  const db = getDb();

  const versionRow = await db.query.programVersion.findFirst({
    where: (v) => eq(v.id, versionId),
  });
  if (!versionRow) return null;

  const programRow = await db.query.program.findFirst({
    where: (p) => eq(p.id, versionRow.programId),
  });
  if (!programRow) return null;

  const unitRows = await db.query.unit.findMany({
    where: (u) => eq(u.programVersionId, versionId),
  });
  unitRows.sort((a, b) => a.orderKey.localeCompare(b.orderKey));

  const unitIds = unitRows.map((u) => u.id);
  const lessonRows =
    unitIds.length === 0
      ? []
      : await db.query.lesson.findMany({
          where: (l, { inArray }) => inArray(l.unitId, unitIds),
        });
  lessonRows.sort((a, b) => a.orderKey.localeCompare(b.orderKey));

  const lessonIds = lessonRows.map((l) => l.id);
  const activityRows =
    lessonIds.length === 0
      ? []
      : await db.query.activity.findMany({
          where: (a, { inArray }) => inArray(a.lessonId, lessonIds),
        });
  activityRows.sort((a, b) => a.orderKey.localeCompare(b.orderKey));

  const units: EditableUnit[] = unitRows.map((u) => {
    const uLessons = lessonRows.filter((l) => l.unitId === u.id);
    return {
      unitKey: u.unitKey,
      title: u.title,
      emoji: u.emoji ?? undefined,
      world: u.world,
      bigIdea: u.bigIdea ?? undefined,
      phonicsFocus: u.phonicsFocus ?? undefined,
      mathFocus: u.mathFocus ?? undefined,
      project: u.project ?? undefined,
      checkpoint: u.checkpoint ?? undefined,
      lessons: uLessons.map((l) => {
        const lActivities = activityRows.filter((a) => a.lessonId === l.id);
        return {
          lessonKey: l.lessonKey,
          title: l.title,
          activities: lActivities.map((a) => ({
            activityKey: a.activityKey,
            kind: a.kind,
            title: a.title,
            blurb: a.blurb ?? undefined,
            estMinutes: a.estMinutes ?? undefined,
            band: a.band,
            skillTags: a.skillTags as string[],
            standardTags: a.standardTags as string[],
            config: a.config,
          })),
        };
      }),
    };
  });

  return {
    programId: programRow.id,
    versionId,
    version: versionRow.version,
    status: versionRow.status,
    slug: programRow.slug,
    metadata: {
      title: versionRow.title,
      subtitle: versionRow.subtitle ?? undefined,
      ageBand: versionRow.ageBand ?? undefined,
      summary: versionRow.summary ?? undefined,
      world: versionRow.world ?? undefined,
      locale: versionRow.locale ?? undefined,
      languages: versionRow.languages,
    },
    units,
  };
}

/**
 * Full-tree-replace for a draft version. Validates each activity config before
 * writing. Transaction: update version metadata → delete units (cascades
 * lessons/activities) → reinsert from input.
 * @throws {VersionNotDraftError} when the version is not in `draft` status.
 * @throws {ActivityConfigValidationError} when any activity config fails its schema.
 */
export async function saveVersionTree(
  versionId: string,
  input: { metadata: VersionMetadata; units: EditableUnit[] },
): Promise<void> {
  const db = getDb();

  const versionRow = await db.query.programVersion.findFirst({
    where: (v) => eq(v.id, versionId),
  });
  if (!versionRow) throw new Error(`Version not found: ${versionId}`);
  if (versionRow.status !== "draft") {
    throw new VersionNotDraftError(versionId, versionRow.status);
  }

  // Validate all activity configs BEFORE touching the DB.
  for (const unit of input.units) {
    for (const lesson of unit.lessons) {
      for (const activity of lesson.activities) {
        const actSchema = ACTIVITY_CONFIG_SCHEMAS[activity.kind as ActivityKind];
        if (!actSchema) {
          throw new ActivityConfigValidationError(
            activity.activityKey,
            `Unknown activity kind: "${activity.kind}"`,
          );
        }
        const result = actSchema.safeParse(activity.config);
        if (!result.success) {
          const msg = result.error.issues[0]?.message ?? "invalid config";
          throw new ActivityConfigValidationError(activity.activityKey, msg);
        }
      }
    }
  }

  const { units: unitRows, lessons: lessonRows, activities: activityRows } =
    buildVersionTreeRows(versionId, input.units);

  await db.transaction(async (tx) => {
    // Update version metadata.
    await tx
      .update(schema.programVersion)
      .set({
        title: input.metadata.title,
        subtitle: input.metadata.subtitle ?? null,
        ageBand: input.metadata.ageBand ?? null,
        summary: input.metadata.summary ?? null,
        world: input.metadata.world ?? null,
        locale: input.metadata.locale ?? null,
        languages: input.metadata.languages,
      })
      .where(eq(schema.programVersion.id, versionId));

    // Delete existing units — cascades to lessons and activities.
    await tx.delete(schema.unit).where(eq(schema.unit.programVersionId, versionId));

    // Reinsert from the submitted tree.
    if (unitRows.length > 0) await tx.insert(schema.unit).values(unitRows);
    if (lessonRows.length > 0) await tx.insert(schema.lesson).values(lessonRows);
    if (activityRows.length > 0) await tx.insert(schema.activity).values(activityRows);
  });
}

/**
 * Publish a draft version:
 * - Set the version status to `published` + stamp `publishedAt`.
 * - Set the program status to `published` + set `publishedVersionId`.
 * - Archive any other previously-published version of the same program.
 * Transaction ensures all three changes are atomic.
 */
export async function publishVersion(versionId: string): Promise<void> {
  const db = getDb();

  const versionRow = await db.query.programVersion.findFirst({
    where: (v) => eq(v.id, versionId),
  });
  if (!versionRow) throw new Error(`Version not found: ${versionId}`);

  const now = new Date();

  await db.transaction(async (tx) => {
    // Archive any currently-published version of the same program (skip self).
    await tx
      .update(schema.programVersion)
      .set({ status: "archived" })
      .where(
        and(
          eq(schema.programVersion.programId, versionRow.programId),
          eq(schema.programVersion.status, "published"),
          ne(schema.programVersion.id, versionId),
        ),
      );

    // Publish the target version.
    await tx
      .update(schema.programVersion)
      .set({ status: "published", publishedAt: now })
      .where(eq(schema.programVersion.id, versionId));

    // Update the program record.
    await tx
      .update(schema.program)
      .set({ status: "published", publishedVersionId: versionId, updatedAt: now })
      .where(eq(schema.program.id, versionRow.programId));
  });
}

/**
 * Clone the program's current published (or highest-numbered) version's metadata
 * and tree into a new `program_version` (version = max+1, status `draft`).
 * Returns the new version's id.
 */
export async function cloneVersionToDraft(
  programId: string,
): Promise<{ versionId: string }> {
  const db = getDb();

  const programRow = await db.query.program.findFirst({
    where: (p) => eq(p.id, programId),
  });
  if (!programRow) throw new Error(`Program not found: ${programId}`);

  // Prefer the published version; fall back to the highest version number.
  let sourceVersionId = programRow.publishedVersionId;
  if (!sourceVersionId) {
    const result = await db
      .select({ maxVersion: max(schema.programVersion.version), id: schema.programVersion.id })
      .from(schema.programVersion)
      .where(eq(schema.programVersion.programId, programId));
    const best = result[0];
    if (!best?.id) throw new Error(`No versions found for program: ${programId}`);
    sourceVersionId = best.id;
  }

  const sourceRows = await getProgramVersionTreeRows(sourceVersionId);
  if (!sourceRows) throw new Error(`Source version not found: ${sourceVersionId}`);

  // Determine the next version number.
  const maxResult = await db
    .select({ maxVersion: max(schema.programVersion.version) })
    .from(schema.programVersion)
    .where(eq(schema.programVersion.programId, programId));
  const nextVersion = (maxResult[0]?.maxVersion ?? 0) + 1;

  const newVersionId = globalThis.crypto.randomUUID();
  const { units: unitRows, lessons: lessonRows, activities: activityRows } =
    buildVersionTreeRows(newVersionId, sourceRowsToEditable(sourceRows));

  await db.transaction(async (tx) => {
    await tx.insert(schema.programVersion).values({
      id: newVersionId,
      programId,
      version: nextVersion,
      status: "draft",
      title: sourceRows.version.title,
      subtitle: sourceRows.version.subtitle ?? null,
      ageBand: sourceRows.version.ageBand ?? null,
      summary: sourceRows.version.summary ?? null,
      world: sourceRows.version.world ?? null,
      locale: sourceRows.version.locale ?? null,
      languages: sourceRows.version.languages,
    });
    if (unitRows.length > 0) await tx.insert(schema.unit).values(unitRows);
    if (lessonRows.length > 0) await tx.insert(schema.lesson).values(lessonRows);
    if (activityRows.length > 0) await tx.insert(schema.activity).values(activityRows);
  });

  return { versionId: newVersionId };
}

/**
 * Archive a program (and its currently-published version if any). After this
 * call, the program will no longer appear in `listPublishedProgramSummaries`
 * (which filters status='published').
 */
export async function archiveProgram(programId: string): Promise<void> {
  const db = getDb();

  const programRow = await db.query.program.findFirst({
    where: (p) => eq(p.id, programId),
  });
  if (!programRow) throw new Error(`Program not found: ${programId}`);

  await db.transaction(async (tx) => {
    // Archive the published version (if any) so it also stops appearing in any
    // version-level published queries.
    if (programRow.publishedVersionId) {
      await tx
        .update(schema.programVersion)
        .set({ status: "archived" })
        .where(eq(schema.programVersion.id, programRow.publishedVersionId));
    }

    // Archive the program and clear the published pointer.
    await tx
      .update(schema.program)
      .set({ status: "archived", publishedVersionId: null, updatedAt: new Date() })
      .where(eq(schema.program.id, programId));
  });
}

/**
 * List every program (any status) with summary fields for the admin list view.
 */
export async function listAdminPrograms(): Promise<AdminProgramRow[]> {
  const db = getDb();

  const programs = await db.query.program.findMany();

  const rows: AdminProgramRow[] = [];
  for (const prog of programs) {
    // Find the highest version to report as latestVersion.
    const versions = await db.query.programVersion.findMany({
      where: (v) => eq(v.programId, prog.id),
    });
    versions.sort((a, b) => b.version - a.version);
    const latest = versions[0];

    // Resolve the display title: prefer the published version's title, then latest.
    let title = latest?.title ?? "";
    if (prog.publishedVersionId) {
      const pubVersion = versions.find((v) => v.id === prog.publishedVersionId);
      if (pubVersion) title = pubVersion.title;
    }

    rows.push({
      programId: prog.id,
      slug: prog.slug,
      status: prog.status,
      latestVersionId: latest?.id ?? null,
      latestVersion: latest?.version ?? null,
      publishedVersionId: prog.publishedVersionId ?? null,
      title,
    });
  }

  return rows;
}

// ── Private helpers ───────────────────────────────────────────────────────────

/** Convert ProgramTreeRows into the EditableUnit[] shape for clone / tree build. */
function sourceRowsToEditable(rows: ProgramTreeRows): EditableUnit[] {
  const sortedUnits = [...rows.units].sort((a, b) => a.orderKey.localeCompare(b.orderKey));

  return sortedUnits.map((u) => {
    const uLessons = rows.lessons
      .filter((l) => l.unitId === u.id)
      .sort((a, b) => a.orderKey.localeCompare(b.orderKey));

    return {
      unitKey: u.unitKey,
      title: u.title,
      emoji: u.emoji ?? undefined,
      world: u.world,
      bigIdea: u.bigIdea ?? undefined,
      phonicsFocus: u.phonicsFocus ?? undefined,
      mathFocus: u.mathFocus ?? undefined,
      project: u.project ?? undefined,
      checkpoint: u.checkpoint ?? undefined,
      lessons: uLessons.map((l) => {
        const lActivities = rows.activities
          .filter((a) => a.lessonId === l.id)
          .sort((a, b) => a.orderKey.localeCompare(b.orderKey));

        return {
          lessonKey: l.lessonKey,
          title: l.title,
          activities: lActivities.map((a) => ({
            activityKey: a.activityKey,
            kind: a.kind,
            title: a.title,
            blurb: a.blurb ?? undefined,
            estMinutes: a.estMinutes ?? undefined,
            band: a.band,
            skillTags: a.skillTags as string[],
            standardTags: a.standardTags as string[],
            config: a.config,
          })),
        };
      }),
    };
  });
}
