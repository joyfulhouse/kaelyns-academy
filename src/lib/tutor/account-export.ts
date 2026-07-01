/**
 * Pure export-shaping for the WHOLE-ACCOUNT data export (P6 / spec §8 COPPA
 * "export … all its data" + "clear data inventory"). No DB access, no
 * `new Date()` — the caller injects `exportedAt`, mirroring `export.ts`, so this
 * module stays unit-testable without mocks.
 *
 * The account export is, deliberately, "the parent record + an array of the
 * per-child export we already produce" (reusing {@link LearnerExport}), so there
 * is ONE source of truth for what a child's data looks like and the provenance
 * addition shows up here for free.
 */
import type { LearnerExport } from "./export";

/** Bump when the export SHAPE changes, so a consumer can tell versions apart. */
export const ACCOUNT_EXPORT_SCHEMA_VERSION = 1;

/**
 * The self-describing data inventory (the COPPA "clear data inventory"). These
 * arrays are not decoration: `contents` names every category the bundle
 * INCLUDES, and `notExported` names everything deliberately left out and why.
 * A reviewer can diff `contents` against the DB tables that reference a
 * learner/user and confirm nothing child-bearing is silently dropped — a test
 * asserts exactly that (see account-export inventory guard).
 */
export const EXPORT_CONTENTS = [
  "account",
  "learners",
  "enrollments",
  // "attempts" includes each attempt's full `response` payload — the child's own
  // answers, journal text, and drawing data (COPPA "export … all its data").
  "skillState",
  "attempts",
  "aiProvenance",
] as const;

export const EXPORT_NOT_EXPORTED = [
  "narration audio (shared, content-addressed, no PII)",
  "raw AI prompts (metadata only is kept; prompts can embed a child's name)",
  "passwords / auth tokens",
] as const;

/** Where the manifest points for the retention policy + full inventory rationale. */
const PRIVACY_DOC_PATH = "docs/architecture/PRIVACY.md";

interface AccountExportManifest {
  schemaVersion: number;
  /** ISO, injected by the action. */
  exportedAt: string;
  /** Human-readable inventory of what IS in the bundle. */
  contents: string[];
  /** Honesty: what is deliberately NOT in the bundle, and why. */
  notExported: string[];
  /** Pointer to the retention/inventory doc the bundle is governed by. */
  policy: string;
}

/** The minimized parent record — NEVER password/tokens. */
interface AccountExportAccount {
  id: string;
  email: string;
  createdAt: string;
}

/** The whole-account export bundle (manifest + parent record + every child). */
export interface AccountExport {
  manifest: AccountExportManifest;
  account: AccountExportAccount;
  learners: LearnerExport[];
}

export interface ShapeAccountInput {
  exportedAt: string;
  account: AccountExportAccount;
  learners: LearnerExport[];
}

/**
 * Pure assembly of the account export. Stamps the manifest (schema version +
 * the fixed inventory arrays + the injected `exportedAt`) and carries the
 * minimized parent record + the per-child exports through unchanged. Copies the
 * inventory arrays so callers can't mutate the module-level constants.
 */
export function shapeAccountExport(input: ShapeAccountInput): AccountExport {
  return {
    manifest: {
      schemaVersion: ACCOUNT_EXPORT_SCHEMA_VERSION,
      exportedAt: input.exportedAt,
      contents: [...EXPORT_CONTENTS],
      notExported: [...EXPORT_NOT_EXPORTED],
      policy: PRIVACY_DOC_PATH,
    },
    account: {
      id: input.account.id,
      email: input.account.email,
      createdAt: input.account.createdAt,
    },
    learners: input.learners,
  };
}
