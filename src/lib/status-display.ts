/**
 * Shared status display maps — client-safe (no React, no server imports).
 *
 * Three distinct namespaces:
 *  - Program status (admin surface): draft / published / archived
 *  - Lifecycle status (Task 12 motivation admin: stickers/quests/interests):
 *    draft / published / archived — same values as program status, but kept
 *    as a separate export (typed against LifecycleStatus) so the two surfaces
 *    don't couple to one shared symbol by coincidence of identical strings.
 *  - Enrollment status (parent surface): active / paused / removed
 *
 * The parent surface intentionally labels the enrollment "active" state as
 * "Assigned" in the per-program assign control but "Active" in the curriculum
 * panel — those are kept as separate exports (ENROLLMENT_STATUS_LABEL_ASSIGN
 * vs ENROLLMENT_STATUS_LABEL) rather than force-merged.
 */

import type { PillTone } from "@/components/ui/Pill";
import type { LifecycleStatus } from "@/lib/admin/lifecycle";
import type { EnrollmentStatus } from "@/lib/tutor/enrollment";

// ── Program status (admin) ────────────────────────────────────────────────────

/** Pill tone for each program lifecycle status (admin surface). */
export const PROGRAM_STATUS_TONE: Record<string, PillTone> = {
  draft: "ready",
  published: "success",
  archived: "neutral",
};

/** Human-readable label for each program lifecycle status (admin surface). */
export const PROGRAM_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

// ── Lifecycle status (motivation taxonomies: stickers/quests/interests) ──────

/** Pill tone for each motivation-taxonomy row's status. */
export const LIFECYCLE_STATUS_TONE: Record<LifecycleStatus, PillTone> = {
  draft: "ready",
  published: "success",
  archived: "neutral",
};

/** Human-readable label for each motivation-taxonomy row's status. */
export const LIFECYCLE_STATUS_LABEL: Record<LifecycleStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

// ── Enrollment status (parent surface) ───────────────────────────────────────

/** Pill tone for each enrollment status (parent surface, both views). */
export const ENROLLMENT_STATUS_PILL_TONE: Record<
  EnrollmentStatus,
  "success" | "ready" | "neutral"
> = {
  active: "success",
  paused: "ready",
  removed: "neutral",
};

/**
 * Enrollment status label for the curriculum panel ("Active" for the
 * active state).
 */
export const ENROLLMENT_STATUS_LABEL: Record<EnrollmentStatus, string> = {
  active: "Active",
  paused: "Paused",
  removed: "Removed",
};

/**
 * Enrollment status label for the per-program assign control, where the
 * "active" state is surfaced as "Assigned" (enrollment semantics, not
 * program-lifecycle semantics).
 */
export const ENROLLMENT_STATUS_LABEL_ASSIGN: Record<EnrollmentStatus, string> = {
  active: "Assigned",
  paused: "Paused",
  removed: "Removed",
};
