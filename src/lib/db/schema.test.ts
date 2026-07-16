import { describe, it, expect } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { getTableName } from "drizzle-orm";
import {
  account,
  attempt,
  checkpointResult,
  deletionAudit,
  enrollment,
  generatedActivity,
  learner,
  oralReadingVerification,
  parentPin,
  programVersion,
  publisher,
  reviewSchedule,
  session,
  skillState,
  user,
} from "./schema";

/**
 * Cascade-map guard (P6 / spec §8 account delete). The whole-account hard delete
 * (`deleteAccount`) hangs the entire child-data graph + auth rows off a single
 * `DELETE FROM "user"`, relying ENTIRELY on Postgres FK `ON DELETE` behavior.
 * This pure test asserts that behavior is what the cascade map claims, so a
 * schema change that (e.g.) flips publisher.ownerUserId to cascade — which would
 * make a published program vanish when its author closes their account — or
 * drops a cascade that would orphan child data, fails CI here, not in production.
 */

/** The `onDelete` action of the FK from `table`.`column` (or undefined if none). */
function fkOnDelete(
  table: Parameters<typeof getTableConfig>[0],
  columnName: string,
): string | undefined {
  const config = getTableConfig(table);
  for (const fk of config.foreignKeys) {
    const ref = fk.reference();
    if (ref.columns.some((c) => c.name === columnName)) return fk.onDelete;
  }
  return undefined;
}

describe("account-delete cascade map (FK ON DELETE)", () => {
  it("cascades the child-data graph off user → learner → enrollment/attempt/skill_state", () => {
    expect(fkOnDelete(learner, "account_id")).toBe("cascade");
    expect(fkOnDelete(enrollment, "learner_id")).toBe("cascade");
    expect(fkOnDelete(attempt, "learner_id")).toBe("cascade");
    expect(fkOnDelete(skillState, "learner_id")).toBe("cascade");
  });

  it("cascades checkpoint_result off learner (Adventure 2.0 C1 baseline/mid/final results)", () => {
    expect(fkOnDelete(checkpointResult, "learner_id")).toBe("cascade");
  });

  it("cascades generated_activity off learner (Adventure 2.0 B3 AI-generated shelf items)", () => {
    expect(fkOnDelete(generatedActivity, "learner_id")).toBe("cascade");
  });

  it("cascades review_schedule off learner (Phase 3 spaced repetition)", () => {
    expect(fkOnDelete(reviewSchedule, "learner_id")).toBe("cascade");
  });

  it("cascades short-lived oral-reading witnesses off learner", () => {
    expect(fkOnDelete(oralReadingVerification, "learner_id")).toBe("cascade");
  });

  it("cascades the Better Auth session + account credential rows off user", () => {
    expect(fkOnDelete(session, "user_id")).toBe("cascade");
    expect(fkOnDelete(account, "user_id")).toBe("cascade");
  });

  it("cascades the parent PIN row off user", () => {
    expect(fkOnDelete(parentPin, "account_id")).toBe("cascade");
  });

  it("SET NULL (never cascade) for publisher.ownerUserId — published programs survive", () => {
    // The load-bearing exception: a published program must not vanish because its
    // author closed their account; ownership nulls out instead.
    expect(fkOnDelete(publisher, "owner_user_id")).toBe("set null");
  });

  it("deletion_audit has NO foreign key to user (must survive the delete it records)", () => {
    const targets = new Set<string>([getTableName(user), getTableName(learner)]);
    const config = getTableConfig(deletionAudit);
    const refsUserOrLearner = config.foreignKeys.some((fk) =>
      targets.has(getTableName(fk.reference().foreignTable)),
    );
    expect(refsUserOrLearner).toBe(false);
  });
});

describe("parent_pin schema", () => {
  it("stores the derived hash and durable account-scoped attempt budget", () => {
    expect(Object.keys(parentPin)).toEqual(
      expect.arrayContaining([
        "accountId",
        "pinHash",
        "failedAttempts",
        "lockedUntil",
        "updatedAt",
      ]),
    );
  });
});

describe("attempt completion idempotency schema", () => {
  it("stores a nullable completion id with one unique key per learner", () => {
    expect(attempt.completionId.notNull).toBe(false);

    const completionIndex = getTableConfig(attempt).indexes.find(
      (index) => index.config.name === "attempt_learner_completion_uq",
    );
    expect(completionIndex?.config.unique).toBe(true);
    expect(
      completionIndex?.config.columns.map((column) =>
        "name" in column ? column.name : undefined,
      ),
    ).toEqual(["learner_id", "completion_id"]);
  });
});

describe("attempt durable content identity schema", () => {
  it("stores nullable program, unit, and version identity for legacy-safe replay", () => {
    expect(attempt.programSlug.notNull).toBe(false);
    expect(attempt.unitKey.notNull).toBe(false);
    expect(attempt.programVersionId.notNull).toBe(false);
    expect(fkOnDelete(attempt, "program_version_id")).toBe("set null");
    expect(
      getTableConfig(attempt).foreignKeys.some(
        (foreignKey) =>
          getTableName(foreignKey.reference().foreignTable) === getTableName(programVersion),
      ),
    ).toBe(true);
  });
});

describe("oral_reading_verification schema", () => {
  it("stores only bounded canonical facts and an atomic completion claim", () => {
    expect(Object.keys(oralReadingVerification)).toEqual(
      expect.arrayContaining([
        "id",
        "learnerId",
        "programSlug",
        "programVersionId",
        "unitKey",
        "activityId",
        "mode",
        "result",
        "perWord",
        "correctCount",
        "totalWords",
        "wcpm",
        "expiresAt",
        "consumedCompletionId",
        "createdAt",
      ]),
    );
    expect(Object.keys(oralReadingVerification)).not.toEqual(
      expect.arrayContaining(["audio", "transcript", "target", "passage"]),
    );
    expect(oralReadingVerification.expiresAt.notNull).toBe(true);
    expect(oralReadingVerification.programVersionId.notNull).toBe(false);
    expect(oralReadingVerification.consumedCompletionId.notNull).toBe(false);
    expect(fkOnDelete(oralReadingVerification, "program_version_id")).toBe("set null");

    const completionIndex = getTableConfig(oralReadingVerification).indexes.find(
      (index) => index.config.name === "oral_reading_verification_learner_completion_uq",
    );
    expect(completionIndex?.config.unique).toBe(true);
    expect(
      completionIndex?.config.columns.map((column) =>
        "name" in column ? column.name : undefined,
      ),
    ).toEqual(["learner_id", "consumed_completion_id"]);
  });
});

describe("checkpoint_result schema", () => {
  it("exposes the Phase C capture columns", () => {
    const cols = Object.keys(checkpointResult);
    for (const c of [
      "id",
      "learnerId",
      "enrollmentId",
      "unitId",
      "phase",
      "scores",
      "status",
      "createdAt",
      "appliedAt",
    ]) {
      expect(cols).toContain(c);
    }
  });
});

describe("generated_activity schema", () => {
  it("exposes the B3 shelf columns", () => {
    const cols = Object.keys(generatedActivity);
    for (const c of [
      "id",
      "learnerId",
      "programSlug",
      "programVersionId",
      "unitKey",
      "lessonId",
      "kind",
      "title",
      "config",
      "skillTags",
      "genModel",
      "genRoute",
      "genAt",
      "createdAt",
    ]) {
      expect(cols).toContain(c);
    }
    expect(fkOnDelete(generatedActivity, "program_version_id")).toBe("set null");
  });
});

describe("review_schedule schema", () => {
  it("exposes the spaced-repetition columns", () => {
    const cols = Object.keys(reviewSchedule);
    for (const c of [
      "id",
      "learnerId",
      "skill",
      "programSlug",
      "intervalIndex",
      "nextReviewOn",
      "lastReviewedOn",
      "lastOutcome",
      "updatedAt",
    ]) {
      expect(cols).toContain(c);
    }
  });
});
