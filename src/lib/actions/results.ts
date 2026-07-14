import { captureNonCritical } from "@/lib/capture";
import { ParentAreaLockedError } from "@/lib/parent-pin-gate";
import { UnauthenticatedError } from "@/lib/tenancy";
import type { z } from "zod";

/** Expected access failures shared by parent Server Action result unions. */
export type ActionGateReason = "unauthenticated" | "locked";

type BaseMappedActionError = {
  ok: false;
  reason: "unauthenticated" | "unavailable";
  message: string;
};

type ParentMappedActionError = {
  ok: false;
  reason: ActionGateReason | "unavailable";
  message: string;
};

/**
 * Shared plumbing for the discriminated `{ ok, reason, message }` results that
 * every parent/admin server action returns. This is a PLAIN module (no
 * `"use server"`) so its helpers are ordinary functions, not Server Actions —
 * importing them does not add new product surface, it just removes the
 * copy-pasted validate/catch boilerplate from each action.
 *
 * The result *shapes* the UI switches on (the `reason` literals and the
 * user-facing `message` strings) are owned by the call sites; these helpers only
 * produce the common shapes that were duplicated verbatim everywhere:
 *   - the "input failed Zod validation" → `reason:"invalid"` shape, and
 *   - the generic catch tail → `unauthenticated` / `unavailable`, plus the
 *     opt-in parent PIN authorization tail → `locked`.
 */

/**
 * Validate `input` against `schema`, returning the same discriminated shape the
 * actions used to build inline. On failure the surfaced message is the first
 * Zod issue's message (the field-level guidance) and falls back to
 * `fallbackMessage` only when an issue carries no message — exactly the
 * `parsed.error.issues[0]?.message ?? fallback` pattern the call sites repeated.
 */
export function parseInput<T>(
  schema: z.ZodType<T>,
  input: unknown,
  fallbackMessage: string,
): { ok: true; data: T } | { ok: false; reason: "invalid"; message: string } {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid",
      message: parsed.error.issues[0]?.message ?? fallbackMessage,
    };
  }
  return { ok: true, data: parsed.data };
}

/**
 * Map an unexpected error thrown inside an action body to the generic failure
 * tail every action shared:
 *   - an `UnauthenticatedError` (raised by the tenancy seam) → a calm
 *     "please sign in again" prompt; NEVER logged, it is an expected gate, and
 *   - an opted-in `ParentAreaLockedError` → calm unlock guidance; NEVER logged,
 *     because an expired or missing device unlock is an expected gate, and
 *   - anything else → logged non-critically under `context` and reported as a
 *     transient `unavailable` with the caller's own `unavailableMessage`.
 * The fixed "Please sign in again." string is preserved verbatim from the old
 * inline tails so the UI keeps rendering the identical copy.
 */
export function mapActionError(
  error: unknown,
  context: string,
  unavailableMessage: string,
): BaseMappedActionError;
export function mapActionError(
  error: unknown,
  context: string,
  unavailableMessage: string,
  options: { allowLocked: true },
): ParentMappedActionError;
export function mapActionError(
  error: unknown,
  context: string,
  unavailableMessage: string,
  options?: { allowLocked?: boolean },
): ParentMappedActionError {
  if (error instanceof UnauthenticatedError) {
    return { ok: false, reason: "unauthenticated", message: "Please sign in again." };
  }
  if (options?.allowLocked && error instanceof ParentAreaLockedError) {
    return {
      ok: false,
      reason: "locked",
      message: "The grown-up area is locked. Unlock it to continue.",
    };
  }
  captureNonCritical(context, error);
  return { ok: false, reason: "unavailable", message: unavailableMessage };
}
