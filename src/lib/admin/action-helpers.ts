/**
 * Shared plumbing for the admin authoring server actions. This is a PLAIN module
 * (no `"use server"`) so these are ordinary helpers, not Server Actions — the
 * `"use server"` actions module imports them to drop the copy-pasted
 * requireAdmin-gate / id-validation / catch-and-map boilerplate from every action.
 *
 * The result *shapes* the admin UI switches on (the `reason` literals + the
 * user-facing `message` strings) are unchanged; these helpers only reproduce the
 * shapes that were duplicated verbatim across the seven actions.
 */
import { z } from "zod";
import { mapActionError } from "@/lib/actions/results";
import { AdminForbiddenError, requireAdmin } from "@/lib/admin";
import {
  ActivityConfigValidationError,
  DuplicateKeyError,
  DuplicateSlugError,
  VersionNotDraftError,
} from "@/lib/content/store";

export type AdminActionReason = "unauthenticated" | "forbidden" | "invalid" | "unavailable";

export type AdminErrorResult = { ok: false; reason: AdminActionReason; message: string };

/**
 * Map an error thrown by the admin gate or a store mutation to the discriminated
 * failure shape. The admin-specific branches stay here:
 *   - AdminForbiddenError → `forbidden`
 *   - the store's validation errors (duplicate slug/key, non-draft, bad config) →
 *     `invalid` with the error's own message (NOT logged — they are expected).
 * Everything else delegates to the shared `mapActionError`: an
 * `UnauthenticatedError` → the calm "Please sign in again." prompt (not logged),
 * and any unexpected error → logged non-critically under `context` + a generic
 * `unavailable`. Messages are preserved verbatim from the old inline mapper.
 */
export function mapError(error: unknown, context: string): AdminErrorResult {
  if (error instanceof AdminForbiddenError) {
    return { ok: false, reason: "forbidden", message: "Admin access required." };
  }
  if (
    error instanceof DuplicateSlugError ||
    error instanceof VersionNotDraftError ||
    error instanceof ActivityConfigValidationError ||
    error instanceof DuplicateKeyError
  ) {
    return { ok: false, reason: "invalid", message: error.message };
  }
  return mapActionError(error, context, "An unexpected error occurred. Please try again.");
}

/**
 * Run an admin action body behind the shared gate: assert admin access first,
 * then execute `fn`, mapping any thrown error (from the gate or the body) through
 * {@link mapError}. Validation failures the body *returns* (e.g. {@link idParam}
 * / parseInput results) pass straight through untouched. `context` is the log key
 * used for unexpected errors.
 */
export async function withAdminAction<T>(
  context: string,
  fn: () => Promise<T | AdminErrorResult>,
): Promise<T | AdminErrorResult> {
  try {
    await requireAdmin();
    return await fn();
  } catch (error) {
    return mapError(error, context);
  }
}

/**
 * Validate a required, non-empty id string. Returns the validated value, or the
 * `reason:"invalid"` shape (with the caller's `message`) the actions returned
 * inline for a blank id.
 */
export function idParam(
  value: string,
  message: string,
): { ok: true; value: string } | { ok: false; reason: "invalid"; message: string } {
  const parsed = z.string().min(1).safeParse(value);
  if (!parsed.success) return { ok: false, reason: "invalid", message };
  return { ok: true, value: parsed.data };
}
