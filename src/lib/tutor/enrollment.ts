import type { EnrollmentConfig } from "@/lib/content/config";

export type EnrollmentStatus = "active" | "paused" | "removed";

export const ENROLLMENT_STATUSES: EnrollmentStatus[] = ["active", "paused", "removed"];

/**
 * Allowed status transitions for an enrollment:
 *  - X → X (idempotent) always true.
 *  - active ↔ paused (pause/resume).
 *  - active → removed (soft-delete).
 *  - paused → removed (soft-delete from paused).
 *  - removed → active (restore).
 *  - removed → paused is disallowed (must restore to active first).
 */
export function canTransitionStatus(from: EnrollmentStatus, to: EnrollmentStatus): boolean {
  if (from === to) return true;
  if (from === "active" && to === "paused") return true;
  if (from === "paused" && to === "active") return true;
  if (from === "active" && to === "removed") return true;
  if (from === "paused" && to === "removed") return true;
  if (from === "removed" && to === "active") return true;
  return false;
}

export interface EnrollmentDetail {
  slug: string;
  status: EnrollmentStatus;
  config: EnrollmentConfig;
  programVersionId: string | null;
  startedAt: Date;
}
