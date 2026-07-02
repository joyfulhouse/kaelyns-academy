import { z } from "zod";

/**
 * Shared draft→published→archived status lifecycle for the Adventure 2.0
 * motivation taxonomies (sticker packs, quest templates, interests) — spec §2
 * deviation note: a single status column, not the program/version two-table
 * lifecycle content programs use. No version cloning: editing a row edits it
 * in place; only the status column moves along the lifecycle.
 */
export const lifecycleStatusSchema = z.enum(["draft", "published", "archived"]);
export type LifecycleStatus = z.infer<typeof lifecycleStatusSchema>;

/**
 * PURE. Valid edges: draft→published, published→archived, and
 * archived→published (re-publishing something pulled back). Setting the
 * same status is always a valid no-op write. Anything else (e.g.
 * published→draft, archived→draft, draft→archived) is rejected.
 */
export function isValidStatusTransition(from: LifecycleStatus, to: LifecycleStatus): boolean {
  if (from === to) return true;
  return (
    (from === "draft" && to === "published") ||
    (from === "published" && to === "archived") ||
    (from === "archived" && to === "published")
  );
}

/** Thrown by a setStatus store function when the requested transition is not
 *  one of the lifecycle's allowed edges (see {@link isValidStatusTransition}). */
export class InvalidStatusTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Cannot move status from "${from}" to "${to}".`);
    this.name = "InvalidStatusTransitionError";
  }
}

/** Thrown by a setStatus store function when the conditional (compare-and-swap)
 *  status write affected 0 rows — a concurrent write moved the row's status
 *  between the validation read and the write. Expected under an admin race;
 *  maps to reason:"invalid" so the UI shows this message instead of logging. */
export class ConcurrentStatusChangeError extends Error {
  constructor() {
    super("The status was changed in another window. Refresh and try again.");
    this.name = "ConcurrentStatusChangeError";
  }
}
