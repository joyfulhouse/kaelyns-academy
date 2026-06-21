/**
 * Client-safe type definitions for the parent curriculum surface.
 *
 * Declared here (not in the server-only data.ts or in the client component)
 * so both sides import the same shapes and can't drift independently.
 * No React. No server imports.
 */

import type { EnrollmentStatus } from "@/lib/tutor/enrollment";
import type { EnrollmentConfig } from "@/lib/content/config";

/** A single enrolled program as the curriculum panel needs it. */
export interface EnrolledProgramView {
  slug: string;
  title: string;
  status: EnrollmentStatus;
  config: EnrollmentConfig;
  /** Ordered units from the resolved program tree. */
  units: { key: string; title: string }[];
}

/** The two lists the CurriculumPanel renders. */
export interface LearnerCurriculumProps {
  enrolled: EnrolledProgramView[];
  /** Light catalog entries for the "add a program" control. */
  available: { slug: string; title: string }[];
}
