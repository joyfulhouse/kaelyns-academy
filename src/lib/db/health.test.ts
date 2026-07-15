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

  it("reports every column when a whole required table is absent (unmigrated table)", () => {
    // The real canary failure mode: a required table missing from prod entirely
    // (the `live[table] ?? []` branch). All its columns must be reported missing.
    expect(missingColumns({ session: ["id", "user_id", "token"] }, {})).toEqual([
      "session.id",
      "session.user_id",
      "session.token",
    ]);
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
    expect(REQUIRED_COLUMNS.parent_pin).toEqual(
      expect.arrayContaining([
        "account_id",
        "pin_hash",
        "failed_attempts",
        "locked_until",
        "updated_at",
      ]),
    );
  });

  it("covers the new curriculum marketplace tables", () => {
    expect(REQUIRED_COLUMNS.publisher).toEqual(expect.arrayContaining(["id", "name", "kind"]));
    expect(REQUIRED_COLUMNS.program).toEqual(expect.arrayContaining(["id", "slug", "status"]));
    expect(REQUIRED_COLUMNS.program_version).toEqual(
      expect.arrayContaining(["id", "program_id", "version", "status", "title"]),
    );
    expect(REQUIRED_COLUMNS.unit).toEqual(
      expect.arrayContaining(["id", "program_version_id", "unit_key", "order_key", "title"]),
    );
    expect(REQUIRED_COLUMNS.lesson).toEqual(
      expect.arrayContaining(["id", "unit_id", "lesson_key", "order_key", "title"]),
    );
    expect(REQUIRED_COLUMNS.activity).toEqual(
      expect.arrayContaining(["id", "lesson_id", "activity_key", "order_key", "kind", "title", "config"]),
    );
    expect(REQUIRED_COLUMNS.skill).toEqual(
      expect.arrayContaining(["id", "slug", "domain", "label"]),
    );
    expect(REQUIRED_COLUMNS.enrollment).toEqual(
      expect.arrayContaining(["config", "status", "program_version_id", "updated_at"]),
    );
  });

  it("covers the P6 write-dependent schema (migration 0008): attempt provenance + deletion_audit", () => {
    // recordAttempt writes gen_* on every insert; deleteAccount writes deletion_audit.
    // A skipped 0008 must 503, not fail those writes at runtime.
    expect(REQUIRED_COLUMNS.attempt).toEqual(
      expect.arrayContaining(["gen_model", "gen_route", "gen_at"]),
    );
    expect(REQUIRED_COLUMNS.deletion_audit).toEqual(
      expect.arrayContaining([
        "id",
        "user_id",
        "deleted_at",
        "learner_count",
        "attempt_count",
        "requested_by",
      ]),
    );
  });

  it("flags a 0008-skipped database as drifted (provenance cols + deletion_audit missing)", () => {
    // Prod after 0007 but before 0008: attempt lacks gen_*, no deletion_audit table.
    // missingColumns must report them so /api/health returns 503 before traffic.
    const live = {
      attempt: [
        "id",
        "learner_id",
        "activity_id",
        "kind",
        "generated",
        "score",
        "response",
        "day",
        "created_at",
      ],
      // deletion_audit absent entirely (the `live[table] ?? []` branch)
    };
    const missing = missingColumns(
      { attempt: REQUIRED_COLUMNS.attempt, deletion_audit: REQUIRED_COLUMNS.deletion_audit },
      live,
    );
    expect(missing).toEqual(
      expect.arrayContaining([
        "attempt.gen_model",
        "attempt.gen_route",
        "attempt.gen_at",
        "deletion_audit.id",
        "deletion_audit.user_id",
      ]),
    );
  });
});
