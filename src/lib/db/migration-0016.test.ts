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
          day text NOT NULL DEFAULT '2026-07-01',
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
        CREATE TABLE review_schedule (
          id text PRIMARY KEY,
          learner_id text NOT NULL,
          skill text NOT NULL
        );

        INSERT INTO attempt (id, learner_id, kind, response, score) VALUES
          ('journal-only', 'learner-clean', 'journal-prompt',
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
          ('journal-empty', 'learner-1', 'journal-prompt',
            '{}',
            '{"stars":3,"skillEvidence":[{"skill":"skill.empty","outcome":"solid"}]}'),
          ('journal-array-malformed', 'learner-1', 'journal-prompt',
            '{}',
            '{"stars":3,"skillEvidence":[{"skill":"skill.array-malformed","outcome":"solid"}]}'),
          ('journal-invalid-witness', 'learner-journal-invalid', 'journal-prompt',
            '{}',
            '{"stars":3,"skillEvidence":[{"skill":"skill.invalid-witness"}]}'),
          ('journal-bad-day', 'learner-1', 'journal-prompt',
            '{}',
            '{"stars":3,"skillEvidence":[{"skill":"skill.bad-day","outcome":"solid"}]}'),
          ('journal-nonstring-skill', 'learner-journal-nonstring', 'journal-prompt',
            '{}',
            '{"stars":3,"skillEvidence":[{"skill":123,"outcome":"solid"}]}'),
          ('journal-correlation-mismatch', 'learner-1', 'journal-prompt',
            '{}',
            '{"stars":3,"skillEvidence":[{"skill":"skill.correlation-mismatch","outcome":"solid"}]}'),
          ('journal-correlation-multiplicity', 'learner-1', 'journal-prompt',
            '{}',
            '{"stars":3,"skillEvidence":[{"skill":"skill.correlation-multiplicity","outcome":"solid"}]}'),
          ('journal-correlation-inverse-a', 'learner-1', 'journal-prompt',
            '{}',
            '{"stars":3,"skillEvidence":[{"skill":"skill.correlation-inverse","outcome":"solid"}]}'),
          ('journal-correlation-inverse-b', 'learner-1', 'journal-prompt',
            '{}',
            '{"stars":3,"skillEvidence":[{"skill":"skill.correlation-inverse","outcome":"solid"}]}'),
          ('journal-correlation-outcome', 'learner-1', 'journal-prompt',
            '{}',
            '{"stars":3,"skillEvidence":[{"skill":"skill.correlation-outcome","outcome":"solid"}]}'),
          ('journal-extra-key', 'learner-1', 'journal-prompt',
            '{}',
            '{"stars":3,"skillEvidence":[{"skill":"skill.extra-key","outcome":"solid"}]}'),
          ('journal-source-play', 'learner-1', 'journal-prompt',
            '{}',
            '{"stars":3,"skillEvidence":[{"skill":"skill.source-play","outcome":"solid"}]}'),
          ('journal-malformed-nonjournal', 'learner-2', 'journal-prompt',
            '{}',
            '{"stars":3,"skillEvidence":[{"skill":"skill.malformed-nonjournal","outcome":"solid"}]}'),
          ('journal-malformed-nonjournal-nonarray', 'learner-3', 'journal-prompt',
            '{}',
            '{"stars":3,"skillEvidence":[{"skill":"skill.malformed-nonjournal-nonarray","outcome":"solid"}]}'),
          ('journal-malformed-nonjournal-array', 'learner-4', 'journal-prompt',
            '{}',
            '{"stars":3,"skillEvidence":[{"skill":"skill.malformed-nonjournal-array","outcome":"solid"}]}'),
          ('journal-malformed-ledger-valid', 'learner-8', 'journal-prompt',
            '{}',
            '{"stars":3,"skillEvidence":[{"skill":"skill.malformed-journal-ledger","outcome":"solid"}]}'),
          ('journal-malformed-ledger-bad', 'learner-8', 'journal-prompt',
            '{}',
            '{"stars":3,"skillEvidence":[42]}'),
          ('legitimate-empty', 'learner-clean', 'reading-comprehension',
            '{}',
            '{"stars":2,"skillEvidence":[]}'),
          ('legitimate-malformed', 'learner-2', 'reading-comprehension',
            '{}',
            '{"stars":2}'),
          ('legitimate-malformed-nonarray', 'learner-3', 'reading-comprehension',
            '{}',
            '{"stars":2,"skillEvidence":{"skill":"skill.malformed-nonjournal-nonarray"}}'),
          ('legitimate-malformed-array', 'learner-4', 'reading-comprehension',
            '{}',
            '{"stars":2,"skillEvidence":[42]}'),
          ('legitimate-mixed', 'learner-1', 'reading-comprehension',
            '{"choiceIndex":0}',
            '{"stars":2,"skillEvidence":[{"skill":"skill.mixed","outcome":"emerging"}]}');

        INSERT INTO attempt (id, learner_id, kind, day, response, score)
        SELECT
          'journal-overflow-' || n,
          'learner-5',
          'journal-prompt',
          '2026-07-' || lpad(n::text, 2, '0'),
          '{}',
          jsonb_build_object(
            'stars', 3,
            'skillEvidence', jsonb_build_array(
              jsonb_build_object('skill', 'skill.overflow-cap', 'outcome', 'solid')
            )
          )
        FROM generate_series(1, 25) AS series(n);

        INSERT INTO attempt (id, learner_id, kind, day, response, score)
        SELECT
          'journal-max-history-' || n,
          'learner-9',
          'journal-prompt',
          '2026-06-' || lpad(n::text, 2, '0'),
          '{}',
          jsonb_build_object(
            'stars', 3,
            'skillEvidence', jsonb_build_array(
              jsonb_build_object('skill', 'skill.max-history-cap', 'outcome', 'solid')
            )
          )
        FROM generate_series(1, 24) AS series(n);

        INSERT INTO skill_state (id, learner_id, skill, outcome, evidence) VALUES
          ('only', 'learner-clean', 'skill.only', 'solid',
            '[{"day":"2026-07-01","outcome":"solid"}]'),
          ('mixed', 'learner-1', 'skill.mixed', 'solid',
            '[{"day":"2026-07-01","outcome":"solid"},{"day":"2026-07-02","outcome":"emerging"}]'),
          ('baseline', 'learner-1', 'skill.baseline', 'solid',
            '[{"day":"2026-07-01","outcome":"solid","source":"baseline"}]'),
          ('malformed', 'learner-1', 'skill.malformed', 'solid',
            '{"legacy":"ambiguous"}'),
          ('empty', 'learner-1', 'skill.empty', 'solid', '[]'),
          ('array-malformed', 'learner-1', 'skill.array-malformed', 'solid',
            '[{"day":"2026-07-01"},{"day":"2026-07-02","outcome":"solid","source":null},{"day":"","outcome":"solid"}]'),
          ('invalid-witness', 'learner-journal-invalid', 'skill.invalid-witness', 'solid',
            '[{"day":"2026-07-01","outcome":"solid"}]'),
          ('bad-day', 'learner-1', 'skill.bad-day', 'solid',
            '[{"day":123,"outcome":"solid"},{"day":{"x":1},"outcome":"solid"},{"day":"2026-02-30","outcome":"solid"}]'),
          ('nonstring-skill', 'learner-journal-nonstring', '123', 'solid',
            '[{"day":"2026-07-01","outcome":"solid"}]'),
          ('correlation-mismatch', 'learner-1', 'skill.correlation-mismatch', 'solid',
            '[{"day":"2026-07-02","outcome":"solid"}]'),
          ('correlation-multiplicity', 'learner-1', 'skill.correlation-multiplicity', 'solid',
            '[{"day":"2026-07-01","outcome":"solid"},{"day":"2026-07-01","outcome":"solid"}]'),
          ('correlation-inverse', 'learner-1', 'skill.correlation-inverse', 'solid',
            '[{"day":"2026-07-01","outcome":"solid"}]'),
          ('correlation-outcome', 'learner-1', 'skill.correlation-outcome', 'emerging',
            '[{"day":"2026-07-01","outcome":"emerging"}]'),
          ('extra-key', 'learner-1', 'skill.extra-key', 'solid',
            '[{"day":"2026-07-01","outcome":"solid","legacy":"ambiguous"}]'),
          ('source-play', 'learner-1', 'skill.source-play', 'solid',
            '[{"day":"2026-07-01","outcome":"solid","source":"play"}]'),
          ('malformed-nonjournal', 'learner-2', 'skill.malformed-nonjournal', 'solid',
            '[{"day":"2026-07-01","outcome":"solid"}]'),
          ('malformed-nonjournal-nonarray', 'learner-3', 'skill.malformed-nonjournal-nonarray', 'solid',
            '[{"day":"2026-07-01","outcome":"solid"}]'),
          ('malformed-nonjournal-array', 'learner-4', 'skill.malformed-nonjournal-array', 'solid',
            '[{"day":"2026-07-01","outcome":"solid"}]'),
          ('malformed-journal-ledger', 'learner-8', 'skill.malformed-journal-ledger', 'solid',
            '[{"day":"2026-07-01","outcome":"solid"}]'),
          ('unrelated', 'learner-1', 'skill.unrelated', 'emerging',
            '[{"day":"2026-07-01","outcome":"emerging"}]');

        INSERT INTO skill_state (id, learner_id, skill, outcome, evidence)
        SELECT
          'overflow-cap',
          'learner-5',
          'skill.overflow-cap',
          'solid',
          jsonb_agg(
            jsonb_build_object(
              'day', '2026-07-' || lpad(n::text, 2, '0'),
              'outcome', 'solid'
            )
            ORDER BY n
          )
        FROM generate_series(2, 25) AS series(n);

        INSERT INTO skill_state (id, learner_id, skill, outcome, evidence)
        SELECT
          'max-history-cap',
          'learner-9',
          'skill.max-history-cap',
          'solid',
          jsonb_agg(
            jsonb_build_object(
              'day', '2026-06-' || lpad(n::text, 2, '0'),
              'outcome', 'solid'
            )
            ORDER BY n
          )
        FROM generate_series(1, 24) AS series(n);

        INSERT INTO review_schedule (id, learner_id, skill) VALUES
          ('only', 'learner-clean', 'skill.only'),
          ('mixed', 'learner-1', 'skill.mixed'),
          ('baseline', 'learner-1', 'skill.baseline'),
          ('malformed', 'learner-1', 'skill.malformed'),
          ('empty', 'learner-1', 'skill.empty'),
          ('array-malformed', 'learner-1', 'skill.array-malformed'),
          ('invalid-witness', 'learner-journal-invalid', 'skill.invalid-witness'),
          ('bad-day', 'learner-1', 'skill.bad-day'),
          ('nonstring-skill', 'learner-journal-nonstring', '123'),
          ('correlation-mismatch', 'learner-1', 'skill.correlation-mismatch'),
          ('correlation-multiplicity', 'learner-1', 'skill.correlation-multiplicity'),
          ('correlation-inverse', 'learner-1', 'skill.correlation-inverse'),
          ('correlation-outcome', 'learner-1', 'skill.correlation-outcome'),
          ('extra-key', 'learner-1', 'skill.extra-key'),
          ('source-play', 'learner-1', 'skill.source-play'),
          ('malformed-nonjournal', 'learner-2', 'skill.malformed-nonjournal'),
          ('malformed-nonjournal-nonarray', 'learner-3', 'skill.malformed-nonjournal-nonarray'),
          ('malformed-nonjournal-array', 'learner-4', 'skill.malformed-nonjournal-array'),
          ('malformed-journal-ledger', 'learner-8', 'skill.malformed-journal-ledger'),
          ('max-history-cap', 'learner-9', 'skill.max-history-cap'),
          ('overflow-cap', 'learner-5', 'skill.overflow-cap'),
          ('unrelated', 'learner-1', 'skill.unrelated');
      `);

      await db.exec(migrationSql().replaceAll("--> statement-breakpoint", ""));

      const remaining = await db.query<{ id: string }>("SELECT id FROM skill_state ORDER BY id");
      expect(remaining.rows.map(({ id }) => id)).toEqual([
        "array-malformed",
        "bad-day",
        "baseline",
        "correlation-inverse",
        "correlation-mismatch",
        "correlation-multiplicity",
        "correlation-outcome",
        "empty",
        "extra-key",
        "invalid-witness",
        "malformed",
        "malformed-journal-ledger",
        "malformed-nonjournal",
        "malformed-nonjournal-array",
        "malformed-nonjournal-nonarray",
        "max-history-cap",
        "mixed",
        "nonstring-skill",
        "overflow-cap",
        "source-play",
        "unrelated",
      ]);

      const remainingReviews = await db.query<{ id: string }>(
        "SELECT id FROM review_schedule ORDER BY id",
      );
      expect(remainingReviews.rows.map(({ id }) => id)).toEqual([
        "array-malformed",
        "bad-day",
        "baseline",
        "correlation-inverse",
        "correlation-mismatch",
        "correlation-multiplicity",
        "correlation-outcome",
        "empty",
        "extra-key",
        "invalid-witness",
        "malformed",
        "malformed-journal-ledger",
        "malformed-nonjournal",
        "malformed-nonjournal-array",
        "malformed-nonjournal-nonarray",
        "max-history-cap",
        "mixed",
        "nonstring-skill",
        "overflow-cap",
        "source-play",
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
