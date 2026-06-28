"use server";

/**
 * Admin authoring server actions. Every action:
 *   1. Calls requireAdmin() first — throws UnauthenticatedError or AdminForbiddenError.
 *   2. Zod-validates the input shape.
 *   3. Calls the relevant store mutation.
 *   4. Returns a discriminated { ok: true, ... } | { ok: false, reason, message }.
 *   5. Calls captureNonCritical on unexpected errors.
 *   6. Revalidates /admin and (where catalog changes) /parent/curriculum.
 * Build-safe: no top-level getAuth() or getDb().
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { captureNonCritical } from "@/lib/capture";
import { parseInput } from "@/lib/actions/results";
import { AdminForbiddenError, requireAdmin } from "@/lib/admin";
import { UnauthenticatedError } from "@/lib/tenancy";
import {
  createProgramDraft,
  loadVersionForEdit,
  saveVersionTree,
  publishVersion,
  cloneVersionToDraft,
  archiveProgram,
  listAdminPrograms,
  DuplicateSlugError,
  VersionNotDraftError,
  ActivityConfigValidationError,
  DuplicateKeyError,
  type EditableUnit,
  type EditableLesson,
  type EditableActivity,
  type EditableVersion,
  type AdminProgramRow,
} from "@/lib/content/store";

// ── Re-exports so Task 5.2/5.3 can import types from here ────────────────────

export type { EditableVersion, EditableUnit, EditableLesson, EditableActivity, AdminProgramRow };

// ── Shared error-to-result mapper ────────────────────────────────────────────

type AdminActionReason =
  | "unauthenticated"
  | "forbidden"
  | "invalid"
  | "unavailable";

type AdminErrorResult = { ok: false; reason: AdminActionReason; message: string };

function mapError(error: unknown): AdminErrorResult {
  if (error instanceof UnauthenticatedError) {
    return { ok: false, reason: "unauthenticated", message: "Please sign in again." };
  }
  if (error instanceof AdminForbiddenError) {
    return { ok: false, reason: "forbidden", message: "Admin access required." };
  }
  if (error instanceof DuplicateSlugError) {
    return { ok: false, reason: "invalid", message: error.message };
  }
  if (error instanceof VersionNotDraftError) {
    return { ok: false, reason: "invalid", message: error.message };
  }
  if (error instanceof ActivityConfigValidationError) {
    return { ok: false, reason: "invalid", message: error.message };
  }
  if (error instanceof DuplicateKeyError) {
    return { ok: false, reason: "invalid", message: error.message };
  }
  return { ok: false, reason: "unavailable", message: "An unexpected error occurred. Please try again." };
}

// ── Revalidation helpers ──────────────────────────────────────────────────────

function revalidateAdmin(): void {
  revalidatePath("/admin");
}

/** Revalidate both the admin list and the parent-facing catalog. */
function revalidateCatalog(): void {
  revalidatePath("/admin");
  revalidatePath("/parent/curriculum");
}

// ── Zod schemas for editable tree ────────────────────────────────────────────

const editableActivitySchema = z.object({
  activityKey: z.string().min(1),
  kind: z.string().min(1),
  title: z.string().min(1),
  blurb: z.string().optional(),
  estMinutes: z.number().int().positive().optional(),
  band: z.string().min(1),
  skillTags: z.array(z.string()),
  standardTags: z.array(z.string()),
  config: z.unknown(),
});

const editableLessonSchema = z.object({
  lessonKey: z.string().min(1),
  title: z.string().min(1),
  activities: z.array(editableActivitySchema),
});

const editableUnitSchema = z.object({
  unitKey: z.string().min(1),
  title: z.string().min(1),
  emoji: z.string().optional(),
  world: z.string().min(1),
  bigIdea: z.string().optional(),
  phonicsFocus: z.string().optional(),
  mathFocus: z.string().optional(),
  project: z.string().optional(),
  checkpoint: z.string().optional(),
  lessons: z.array(editableLessonSchema),
});

const versionMetadataSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  ageBand: z.string().optional(),
  summary: z.string().optional(),
  world: z.string().optional(),
  locale: z.string().optional(),
  languages: z.array(z.string()),
});

const saveVersionTreeInputSchema = z.object({
  metadata: versionMetadataSchema,
  units: z.array(editableUnitSchema),
});

const createProgramDraftSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  ageBand: z.string().optional(),
  summary: z.string().optional(),
  world: z.string().optional(),
  locale: z.string().optional(),
  languages: z.array(z.string()).optional(),
  publisherId: z.string().nullable().optional(),
});

// ── Actions ───────────────────────────────────────────────────────────────────

/** Create a new program as a draft (v1). */
export async function createProgramDraftAction(
  input: unknown,
): Promise<{ ok: true; programId: string; versionId: string } | AdminErrorResult> {
  try {
    await requireAdmin();
  } catch (error) {
    return mapError(error);
  }

  const parsed = parseInput(createProgramDraftSchema, input, "Invalid input.");
  if (!parsed.ok) return parsed;

  try {
    const result = await createProgramDraft(parsed.data);
    revalidateAdmin();
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof DuplicateSlugError) return mapError(error);
    captureNonCritical("createProgramDraftAction failed", error);
    return mapError(error);
  }
}

/**
 * Full-tree-replace for a draft version. The tree's activity configs are
 * validated in the store before any writes.
 */
export async function saveVersionTreeAction(
  versionId: string,
  tree: unknown,
): Promise<{ ok: true } | AdminErrorResult> {
  try {
    await requireAdmin();
  } catch (error) {
    return mapError(error);
  }

  const versionIdParsed = z.string().min(1).safeParse(versionId);
  if (!versionIdParsed.success) {
    return { ok: false, reason: "invalid", message: "Invalid version id." };
  }

  const parsed = parseInput(saveVersionTreeInputSchema, tree, "Invalid tree shape.");
  if (!parsed.ok) return parsed;

  try {
    // No casts: parsed.data is already the validated shape, so any drift between
    // the Zod schema and the store's VersionMetadata/EditableUnit types surfaces
    // here as a type error rather than being silently papered over.
    await saveVersionTree(versionId, {
      metadata: parsed.data.metadata,
      units: parsed.data.units,
    });
    revalidateAdmin();
    return { ok: true };
  } catch (error) {
    if (
      error instanceof VersionNotDraftError ||
      error instanceof ActivityConfigValidationError ||
      error instanceof DuplicateKeyError
    ) {
      return mapError(error);
    }
    captureNonCritical("saveVersionTreeAction failed", error);
    return mapError(error);
  }
}

/** Publish a draft version (archives any previously-published version). */
export async function publishProgramAction(
  versionId: string,
): Promise<{ ok: true } | AdminErrorResult> {
  try {
    await requireAdmin();
  } catch (error) {
    return mapError(error);
  }

  const versionIdParsed = z.string().min(1).safeParse(versionId);
  if (!versionIdParsed.success) {
    return { ok: false, reason: "invalid", message: "Invalid version id." };
  }

  try {
    await publishVersion(versionId);
    revalidateCatalog();
    return { ok: true };
  } catch (error) {
    captureNonCritical("publishProgramAction failed", error);
    return mapError(error);
  }
}

/** Clone a program's published (or latest) version to a new draft. */
export async function cloneToDraftAction(
  programId: string,
): Promise<{ ok: true; versionId: string } | AdminErrorResult> {
  try {
    await requireAdmin();
  } catch (error) {
    return mapError(error);
  }

  const programIdParsed = z.string().min(1).safeParse(programId);
  if (!programIdParsed.success) {
    return { ok: false, reason: "invalid", message: "Invalid program id." };
  }

  try {
    const result = await cloneVersionToDraft(programId);
    revalidateAdmin();
    return { ok: true, versionId: result.versionId };
  } catch (error) {
    captureNonCritical("cloneToDraftAction failed", error);
    return mapError(error);
  }
}

/** Archive a program (and its published version). Removes it from the catalog. */
export async function archiveProgramAction(
  programId: string,
): Promise<{ ok: true } | AdminErrorResult> {
  try {
    await requireAdmin();
  } catch (error) {
    return mapError(error);
  }

  const programIdParsed = z.string().min(1).safeParse(programId);
  if (!programIdParsed.success) {
    return { ok: false, reason: "invalid", message: "Invalid program id." };
  }

  try {
    await archiveProgram(programId);
    revalidateCatalog();
    return { ok: true };
  } catch (error) {
    captureNonCritical("archiveProgramAction failed", error);
    return mapError(error);
  }
}

/** Load a version's full tree for editing (any status). */
export async function loadVersionForEditAction(
  versionId: string,
): Promise<{ ok: true; version: EditableVersion } | AdminErrorResult> {
  try {
    await requireAdmin();
  } catch (error) {
    return mapError(error);
  }

  const versionIdParsed = z.string().min(1).safeParse(versionId);
  if (!versionIdParsed.success) {
    return { ok: false, reason: "invalid", message: "Invalid version id." };
  }

  try {
    const version = await loadVersionForEdit(versionId);
    if (!version) return { ok: false, reason: "unavailable", message: "Version not found." };
    return { ok: true, version };
  } catch (error) {
    captureNonCritical("loadVersionForEditAction failed", error);
    return mapError(error);
  }
}

/** List all programs (any status) for the admin program list. */
export async function listAdminProgramsAction(): Promise<
  { ok: true; programs: AdminProgramRow[] } | AdminErrorResult
> {
  try {
    await requireAdmin();
  } catch (error) {
    return mapError(error);
  }

  try {
    const programs = await listAdminPrograms();
    return { ok: true, programs };
  } catch (error) {
    captureNonCritical("listAdminProgramsAction failed", error);
    return mapError(error);
  }
}
