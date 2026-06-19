import { describe, it, expect } from "vitest";
import { missingColumns, REQUIRED_COLUMNS } from "./health";

describe("missingColumns", () => {
  const required = { health_check: ["id", "note", "checked_at"] };
  it("returns [] when all present", () => {
    const live = { health_check: ["id", "note", "checked_at", "extra"] };
    expect(missingColumns(required, live)).toEqual([]);
  });
  it("reports missing as table.column", () => {
    const live = { health_check: ["id"] };
    expect(missingColumns(required, live)).toEqual(["health_check.note", "health_check.checked_at"]);
  });
  it("flags a single required column missing from an otherwise-present table", () => {
    const live = { learner: ["id", "account_id", "display_name", "birth_month"] };
    // settings/created_at/updated_at/avatar are now required but absent → reported.
    expect(missingColumns({ learner: REQUIRED_COLUMNS.learner }, live)).toContain(
      "learner.settings",
    );
  });
});

describe("REQUIRED_COLUMNS coverage (schema-drift canary)", () => {
  it("covers the previously-omitted tutor columns the app queries", () => {
    expect(REQUIRED_COLUMNS.learner).toEqual(
      expect.arrayContaining(["settings", "created_at", "updated_at", "avatar"]),
    );
    expect(REQUIRED_COLUMNS.enrollment).toEqual(expect.arrayContaining(["status", "started_at"]));
    expect(REQUIRED_COLUMNS.attempt).toEqual(
      expect.arrayContaining(["generated", "response", "created_at"]),
    );
    expect(REQUIRED_COLUMNS.skill_state).toEqual(expect.arrayContaining(["updated_at"]));
  });

  it("includes the Better Auth tables with their key columns", () => {
    expect(REQUIRED_COLUMNS.user).toEqual(
      expect.arrayContaining(["id", "email", "email_verified"]),
    );
    expect(REQUIRED_COLUMNS.session).toEqual(expect.arrayContaining(["id", "user_id", "token"]));
    expect(REQUIRED_COLUMNS.account).toEqual(
      expect.arrayContaining(["id", "user_id", "provider_id", "account_id"]),
    );
    expect(REQUIRED_COLUMNS.verification).toEqual(
      expect.arrayContaining(["id", "identifier", "value"]),
    );
  });
});
