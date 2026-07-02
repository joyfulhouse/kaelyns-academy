import { describe, it, expect } from "vitest";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { getTableName, is } from "drizzle-orm";
import {
  ACCOUNT_EXPORT_SCHEMA_VERSION,
  EXPORT_CONTENTS,
  EXPORT_NOT_EXPORTED,
  shapeAccountExport,
  type ShapeAccountInput,
} from "./account-export";
import type { LearnerExport } from "./export";
import * as schema from "@/lib/db/schema";

/** A minimal already-shaped per-child export (the shaper just carries these). */
function learnerExport(overrides: Partial<LearnerExport> = {}): LearnerExport {
  return {
    exportedAt: "2026-06-26T00:00:00.000Z",
    learner: { id: "L1", displayName: "Kaelyn", birthMonth: "August" },
    settings: { aiPractice: false },
    enrollments: [],
    skillState: [],
    attempts: [],
    aiProvenance: [],
    stars: { balance: 0, ledger: [] },
    stickers: [],
    interests: [],
    quests: [],
    ...overrides,
  };
}

function baseInput(overrides: Partial<ShapeAccountInput> = {}): ShapeAccountInput {
  return {
    exportedAt: "2026-06-26T00:00:00.000Z",
    account: { id: "U1", email: "parent@example.com", createdAt: "2026-01-01T00:00:00.000Z" },
    learners: [learnerExport()],
    ...overrides,
  };
}

describe("shapeAccountExport (pure shaper)", () => {
  it("assembles { manifest, account, learners }", () => {
    const result = shapeAccountExport(baseInput());
    expect(Object.keys(result).sort()).toEqual(["account", "learners", "manifest"]);
  });

  it("stamps the schema version + the injected exportedAt on the manifest", () => {
    const result = shapeAccountExport(baseInput({ exportedAt: "2026-07-04T12:00:00.000Z" }));
    expect(result.manifest.schemaVersion).toBe(ACCOUNT_EXPORT_SCHEMA_VERSION);
    expect(result.manifest.exportedAt).toBe("2026-07-04T12:00:00.000Z");
  });

  it("populates the data-inventory arrays (contents + notExported)", () => {
    const result = shapeAccountExport(baseInput());
    expect(result.manifest.contents).toEqual([...EXPORT_CONTENTS]);
    expect(result.manifest.notExported).toEqual([...EXPORT_NOT_EXPORTED]);
    expect(result.manifest.contents.length).toBeGreaterThan(0);
    expect(result.manifest.notExported.length).toBeGreaterThan(0);
  });

  it("points the manifest at the retention/inventory doc", () => {
    expect(shapeAccountExport(baseInput()).manifest.policy).toBe("docs/architecture/PRIVACY.md");
  });

  it("carries the minimized parent record — id/email/createdAt only, NO password/token", () => {
    const result = shapeAccountExport(baseInput());
    expect(Object.keys(result.account).sort()).toEqual(["createdAt", "email", "id"]);
    expect(result.account.email).toBe("parent@example.com");
    // Defensive: no secret-ish keys ever appear on the account node.
    for (const k of ["password", "token", "accessToken", "refreshToken", "secret"]) {
      expect(k in result.account).toBe(false);
    }
  });

  it("carries every learner export through unchanged", () => {
    const result = shapeAccountExport(
      baseInput({
        learners: [
          learnerExport({ learner: { id: "L1", displayName: "A", birthMonth: null } }),
          learnerExport({ learner: { id: "L2", displayName: "B", birthMonth: "May" } }),
        ],
      }),
    );
    expect(result.learners).toHaveLength(2);
    expect(result.learners.map((l) => l.learner.id)).toEqual(["L1", "L2"]);
  });

  it("does not mutate the module-level inventory constants (returns copies)", () => {
    const result = shapeAccountExport(baseInput());
    result.manifest.contents.push("tampered");
    expect([...EXPORT_CONTENTS]).not.toContain("tampered");
  });

  it("handles an account with no learners (empty array)", () => {
    const result = shapeAccountExport(baseInput({ learners: [] }));
    expect(result.learners).toEqual([]);
  });
});

// ── COPPA inventory guard (the single most important safeguard, plan §7/§9) ───
// Every table that FK-references `learner` or `user` must be accounted for in the
// export: either it maps to a manifest `contents` category (its data IS exported)
// or it is explicitly enumerated below as a deliberate omission (which the
// manifest `notExported` honesty array describes to the parent). Adding a new
// child/account-bearing table without making that decision FAILS this test.
describe("account export inventory guard", () => {
  // Map each FK-referencing table → the manifest `contents` category that carries
  // its data, or `null` to declare it a deliberate non-export.
  const TABLE_DISPOSITION: Record<string, string | null> = {
    // Exported (data appears in the bundle):
    learner: "learners",
    enrollment: "enrollments",
    skill_state: "skillState",
    attempt: "attempts", // also feeds aiProvenance
    // Deliberate omissions (described in manifest.notExported):
    session: null, // auth session rows — not child data, security-sensitive
    account: null, // Better Auth credential/oauth rows — passwords/tokens
    publisher: null, // marketplace ownership (set null on delete) — not child data
    // Adventure 2.0 Phase A tables (Task 10 wires these into the export):
    star_ledger: "stars",
    learner_sticker: "stickers",
    learner_interest: "interests",
    learner_quest: "quests",
  };

  /** All pgTable objects exported from the schema module. */
  function allTables(): PgTable[] {
    const exports = Object.values(schema as Record<string, unknown>);
    return exports.filter((v): v is PgTable => is(v, PgTable));
  }

  /** Names of tables whose FKs reference `learner` or `user`. */
  function tablesReferencingLearnerOrUser(): string[] {
    const targets = new Set<string>([getTableName(schema.learner), getTableName(schema.user)]);
    const names: string[] = [];
    for (const table of allTables()) {
      const config = getTableConfig(table);
      const refs = config.foreignKeys.some((fk) =>
        targets.has(getTableName(fk.reference().foreignTable)),
      );
      if (refs) names.push(config.name);
    }
    return names;
  }

  it("accounts for every table that FK-references learner or user", () => {
    const referencing = tablesReferencingLearnerOrUser();
    // Sanity: the known child-data tables must be among them (guards the
    // introspection itself from silently finding nothing).
    for (const expected of ["learner", "enrollment", "attempt", "skill_state"]) {
      expect(referencing).toContain(expected);
    }

    const contents = new Set<string>(EXPORT_CONTENTS);
    const undecided = referencing.filter((name) => {
      if (!(name in TABLE_DISPOSITION)) return true; // brand-new table, no decision
      const disposition = TABLE_DISPOSITION[name];
      // Exported tables must name a real manifest category.
      if (disposition !== null && !contents.has(disposition)) return true;
      return false;
    });
    expect(undecided).toEqual([]);
  });

  it("keeps the deletion_audit table OUT of the export (audit log, not user data)", () => {
    // deletion_audit intentionally has no FK to user (must survive the delete),
    // so it won't appear in tablesReferencingLearnerOrUser — assert it's also not
    // a `contents` category, i.e. it is never exported to the parent.
    expect([...EXPORT_CONTENTS]).not.toContain("deletionAudit");
    expect([...EXPORT_CONTENTS]).not.toContain("deletion_audit");
  });
});
