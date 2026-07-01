"use server";

/**
 * Admin authoring server actions. Every action runs behind `withAdminAction`,
 * which:
 *   1. Calls requireAdmin() first — throws UnauthenticatedError or AdminForbiddenError.
 *   2. Runs the body: Zod-validates the input, calls the store mutation, and
 *      revalidates /admin (and /parent/curriculum where the catalog changes).
 *   3. Maps any thrown error to the discriminated { ok: false, reason, message }
 *      result via mapError (admin-specific branches + the shared
 *      unauthenticated/unavailable tail), logging unexpected errors under the
 *      action's context key.
 * Bodies return { ok: true, ... } on success, or an inline `reason:"invalid"`/
 * `reason:"unavailable"` result for expected validation/not-found cases.
 * Build-safe: no top-level getAuth() or getDb().
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseInput } from "@/lib/actions/results";
import { idParam, withAdminAction, type AdminErrorResult } from "@/lib/admin/action-helpers";
import {
  createProgramDraft,
  saveVersionTree,
  publishVersion,
  cloneVersionToDraft,
  archiveProgram,
} from "@/lib/content/store";

// NOTE: do NOT re-export types from this "use server" file. Next.js's server-action
// transform registers every export name as a server reference (ensureServerEntryExports
// / registerServerReference); a `export type { … }` re-export of imported bindings is
// erased at runtime, so the generated reference throws `ReferenceError: <Type> is not
// defined` and breaks EVERY action in the module. Import these types directly from
// @/lib/content/store / @/lib/admin/action-helpers (all consumers already do). Inline
// `export type X = …` is fine — only re-exports of imported type bindings hit this.
// (Caught by e2e/specs/admin.spec.ts.)

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
  return withAdminAction("createProgramDraftAction", async () => {
    const parsed = parseInput(createProgramDraftSchema, input, "Invalid input.");
    if (!parsed.ok) return parsed;

    const result = await createProgramDraft(parsed.data);
    revalidateAdmin();
    return { ok: true, ...result };
  });
}

/**
 * Full-tree-replace for a draft version. The tree's activity configs are
 * validated in the store before any writes.
 */
export async function saveVersionTreeAction(
  versionId: string,
  tree: unknown,
): Promise<{ ok: true } | AdminErrorResult> {
  return withAdminAction("saveVersionTreeAction", async () => {
    const id = idParam(versionId, "Invalid version id.");
    if (!id.ok) return id;

    const parsed = parseInput(saveVersionTreeInputSchema, tree, "Invalid tree shape.");
    if (!parsed.ok) return parsed;

    // No casts: parsed.data is already the validated shape, so any drift between
    // the Zod schema and the store's VersionMetadata/EditableUnit types surfaces
    // here as a type error rather than being silently papered over.
    await saveVersionTree(versionId, {
      metadata: parsed.data.metadata,
      units: parsed.data.units,
    });
    revalidateAdmin();
    return { ok: true };
  });
}

/** Publish a draft version (archives any previously-published version). */
export async function publishProgramAction(
  versionId: string,
): Promise<{ ok: true } | AdminErrorResult> {
  return withAdminAction("publishProgramAction", async () => {
    const id = idParam(versionId, "Invalid version id.");
    if (!id.ok) return id;

    await publishVersion(versionId);
    revalidateCatalog();
    return { ok: true };
  });
}

/** Clone a program's published (or latest) version to a new draft. */
export async function cloneToDraftAction(
  programId: string,
): Promise<{ ok: true; versionId: string } | AdminErrorResult> {
  return withAdminAction("cloneToDraftAction", async () => {
    const id = idParam(programId, "Invalid program id.");
    if (!id.ok) return id;

    const result = await cloneVersionToDraft(programId);
    revalidateAdmin();
    return { ok: true, versionId: result.versionId };
  });
}

/** Archive a program (and its published version). Removes it from the catalog. */
export async function archiveProgramAction(
  programId: string,
): Promise<{ ok: true } | AdminErrorResult> {
  return withAdminAction("archiveProgramAction", async () => {
    const id = idParam(programId, "Invalid program id.");
    if (!id.ok) return id;

    await archiveProgram(programId);
    revalidateCatalog();
    return { ok: true };
  });
}
