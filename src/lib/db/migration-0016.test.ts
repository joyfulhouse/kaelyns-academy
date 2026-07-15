import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

function migrationSql(): string {
  const drizzleDir = resolve(process.cwd(), "drizzle");
  const filename = readdirSync(drizzleDir).find((entry) => entry.startsWith("0016_") && entry.endsWith(".sql"));
  expect(filename, "expected a generated 0016 Drizzle migration").toBeDefined();
  return readFileSync(resolve(drizzleDir, filename!), "utf8");
}

describe("0016 durable identity and journal privacy migration", () => {
  it("adds nullable content identity and SET NULL version references", () => {
    const sql = migrationSql();

    expect(sql).toContain('ALTER TABLE "attempt" ADD COLUMN "program_slug" text');
    expect(sql).toContain('ALTER TABLE "attempt" ADD COLUMN "unit_key" text');
    expect(sql).toContain('ALTER TABLE "attempt" ADD COLUMN "program_version_id" text');
    expect(sql).toContain(
      'FOREIGN KEY ("program_version_id") REFERENCES "public"."program_version"("id") ON DELETE set null',
    );
    expect(sql).toContain(
      'ALTER TABLE "oral_reading_verification" ADD COLUMN "program_version_id" text',
    );
  });

  it("scrubs every journal response and canonicalizes participation scores", () => {
    const sql = migrationSql();

    expect(sql).toContain("WHERE kind = 'journal-prompt'");
    for (const key of ["markCount", "textLength", "usedDictation", "mode", "didDraw"]) {
      expect(sql).toContain(`'${key}'`);
    }
    for (const legacyKey of ["text", "transcript", "strokes", "drawingDataUrl"]) {
      expect(sql).toContain(`'${legacyKey}'`);
    }
    expect(sql).toContain("'skillEvidence', '[]'::jsonb");
    expect(sql).toContain("'correct', 1");
    expect(sql).toContain("'total', 1");
  });

  it("deletes only journal-only mastery and preserves every ambiguous history", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE program_version (id text PRIMARY KEY);
        CREATE TABLE attempt (
          id text PRIMARY KEY,
          learner_id text NOT NULL,
          kind text NOT NULL,
          response jsonb,
          score jsonb NOT NULL
        );
        CREATE TABLE oral_reading_verification (id text PRIMARY KEY);
        CREATE TABLE skill_state (
          id text PRIMARY KEY,
          learner_id text NOT NULL,
          skill text NOT NULL,
          outcome text NOT NULL,
          evidence jsonb NOT NULL
        );

        INSERT INTO attempt (id, learner_id, kind, response, score) VALUES
          ('journal-only', 'learner-1', 'journal-prompt',
            '{"text":"private"}',
            '{"stars":3,"skillEvidence":[{"skill":"skill.only","outcome":"solid"}]}'),
          ('journal-mixed', 'learner-1', 'journal-prompt',
            '{"drawingDataUrl":"data:image/png;base64,private","didDraw":true}',
            '{"stars":3,"skillEvidence":[{"skill":"skill.mixed","outcome":"solid"}]}'),
          ('journal-baseline', 'learner-1', 'journal-prompt',
            '{}',
            '{"stars":3,"skillEvidence":[{"skill":"skill.baseline","outcome":"solid"}]}'),
          ('journal-malformed', 'learner-1', 'journal-prompt',
            '{}',
            '{"stars":3,"skillEvidence":[{"skill":"skill.malformed","outcome":"solid"}]}'),
          ('legitimate-mixed', 'learner-1', 'reading-comprehension',
            '{"choiceIndex":0}',
            '{"stars":2,"skillEvidence":[{"skill":"skill.mixed","outcome":"emerging"}]}');

        INSERT INTO skill_state (id, learner_id, skill, outcome, evidence) VALUES
          ('only', 'learner-1', 'skill.only', 'solid',
            '[{"day":"2026-07-01","outcome":"solid"}]'),
          ('mixed', 'learner-1', 'skill.mixed', 'solid',
            '[{"day":"2026-07-01","outcome":"solid"},{"day":"2026-07-02","outcome":"emerging"}]'),
          ('baseline', 'learner-1', 'skill.baseline', 'solid',
            '[{"day":"2026-07-01","outcome":"solid","source":"baseline"}]'),
          ('malformed', 'learner-1', 'skill.malformed', 'solid',
            '{"legacy":"ambiguous"}'),
          ('unrelated', 'learner-1', 'skill.unrelated', 'emerging',
            '[{"day":"2026-07-01","outcome":"emerging"}]');
      `);

      await db.exec(migrationSql().replaceAll("--> statement-breakpoint", ""));

      const remaining = await db.query<{ id: string }>("SELECT id FROM skill_state ORDER BY id");
      expect(remaining.rows.map(({ id }) => id)).toEqual([
        "baseline",
        "malformed",
        "mixed",
        "unrelated",
      ]);

      const migratedJournal = await db.query<{ response: unknown; score: unknown }>(
        "SELECT response, score FROM attempt WHERE id = 'journal-only'",
      );
      expect(migratedJournal.rows[0]).toEqual({
        response: {
          markCount: 0,
          textLength: 7,
          usedDictation: false,
          mode: "type",
          didDraw: false,
        },
        score: { correct: 1, total: 1, stars: 3, skillEvidence: [] },
      });
    } finally {
      await db.close();
    }
  });
});
