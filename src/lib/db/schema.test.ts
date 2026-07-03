import { describe, it, expect } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { getTableName } from "drizzle-orm";
import {
  account,
  attempt,
  checkpointResult,
  deletionAudit,
  enrollment,
  learner,
  publisher,
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

  it("cascades the Better Auth session + account credential rows off user", () => {
    expect(fkOnDelete(session, "user_id")).toBe("cascade");
    expect(fkOnDelete(account, "user_id")).toBe("cascade");
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
