import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

function migrationSql(): string {
  const drizzleDir = resolve(process.cwd(), "drizzle");
  const filename = readdirSync(drizzleDir).find(
    (entry) => entry.startsWith("0017_") && entry.endsWith(".sql"),
  );
  expect(filename, "expected a generated 0017 Drizzle migration").toBeDefined();
  return readFileSync(resolve(drizzleDir, filename!), "utf8");
}

describe("0017 generated-version identity and durable journal privacy", () => {
  it("adds the generated activity version reference and journal guard", () => {
    const sql = migrationSql();

    expect(sql).toContain(
      'ALTER TABLE "generated_activity" ADD COLUMN "program_version_id" text',
    );
    expect(sql).toContain(
      'FOREIGN KEY ("program_version_id") REFERENCES "public"."program_version"("id") ON DELETE set null',
    );
    expect(sql).toContain('CONSTRAINT "attempt_journal_summary_only_ck" CHECK');
    expect(sql).toContain('CREATE TRIGGER "attempt_generated_one_shot_guard_trg"');
    expect(sql).toContain('CREATE TRIGGER "attempt_journal_summary_guard_trg"');
    expect(sql).toContain('FROM "generated_activity" AS "shelf"');
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("NOT VALID");
    expect(sql).toContain(
      'VALIDATE CONSTRAINT "attempt_journal_summary_only_ck"',
    );

    const generatedTrigger = sql.indexOf(
      'CREATE TRIGGER "attempt_generated_one_shot_guard_trg"',
    );
    const trigger = sql.indexOf('CREATE TRIGGER "attempt_journal_summary_guard_trg"');
    const guard = sql.indexOf('CONSTRAINT "attempt_journal_summary_only_ck" CHECK');
    const reviewCleanup = sql.indexOf('DELETE FROM "review_schedule"');
    const masteryCleanup = sql.indexOf('DELETE FROM "skill_state"');
    const scrub = sql.indexOf('WITH "journal_source"');
    const validate = sql.indexOf(
      'VALIDATE CONSTRAINT "attempt_journal_summary_only_ck"',
    );
    expect(generatedTrigger).toBeGreaterThanOrEqual(0);
    expect(trigger).toBeGreaterThan(generatedTrigger);
    expect(guard).toBeGreaterThan(trigger);
    expect(reviewCleanup).toBeGreaterThan(guard);
    expect(masteryCleanup).toBeGreaterThan(reviewCleanup);
    expect(scrub).toBeGreaterThan(masteryCleanup);
    expect(validate).toBeGreaterThan(scrub);
  });

  it("re-scrubs rolling writes and drops unsafe old-pod DML before persistence", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE program_version (id text PRIMARY KEY);
        CREATE TABLE generated_activity (
          id text PRIMARY KEY,
          learner_id text NOT NULL
        );
        CREATE TABLE attempt (
          id text PRIMARY KEY,
          learner_id text NOT NULL,
          activity_id text,
          completion_id text,
          kind text NOT NULL,
          day text NOT NULL DEFAULT '2026-07-15',
          generated boolean NOT NULL DEFAULT false,
          program_version_id text,
          response jsonb,
          score jsonb NOT NULL,
          UNIQUE (learner_id, completion_id)
        );
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
        INSERT INTO generated_activity (id, learner_id) VALUES
          ('shelf-first', 'learner-shelf'),
          ('shelf-legacy', 'learner-legacy'),
          ('generated-journal-existing', 'learner-journal-existing'),
          ('generated-journal-new', 'learner-journal-new');
        INSERT INTO attempt (id, learner_id, kind, response, score) VALUES
          ('rolling-legacy', 'learner-clean', 'journal-prompt',
            '{"text":"private idea","drawingDataUrl":"data:image/png;base64,private"}',
            '{"correct":1,"total":1,"stars":3,"skillEvidence":[{"skill":"writing.private","outcome":"solid"}]}'),
          ('blank-legacy', 'learner-1', 'journal-prompt', '{}',
            '{"stars":1,"skillEvidence":[]}'),
          ('journal-mixed', 'learner-1', 'journal-prompt', '{"text":"private mixed"}',
            '{"stars":3,"skillEvidence":[{"skill":"writing.mixed","outcome":"solid"}]}'),
          ('journal-baseline', 'learner-1', 'journal-prompt', '{}',
            '{"stars":3,"skillEvidence":[{"skill":"writing.baseline","outcome":"solid"}]}'),
          ('journal-malformed', 'learner-1', 'journal-prompt', '{}',
            '{"stars":3,"skillEvidence":[{"skill":"writing.malformed","outcome":"solid"}]}'),
          ('journal-empty', 'learner-1', 'journal-prompt', '{}',
            '{"stars":3,"skillEvidence":[{"skill":"writing.empty","outcome":"solid"}]}'),
          ('journal-array-malformed', 'learner-1', 'journal-prompt', '{}',
            '{"stars":3,"skillEvidence":[{"skill":"writing.array-malformed","outcome":"solid"}]}'),
          ('journal-invalid-witness', 'learner-journal-invalid', 'journal-prompt', '{}',
            '{"stars":3,"skillEvidence":[{"skill":"writing.invalid-witness"}]}'),
          ('journal-bad-day', 'learner-1', 'journal-prompt', '{}',
            '{"stars":3,"skillEvidence":[{"skill":"writing.bad-day","outcome":"solid"}]}'),
          ('journal-nonstring-skill', 'learner-journal-nonstring', 'journal-prompt', '{}',
            '{"stars":3,"skillEvidence":[{"skill":123,"outcome":"solid"}]}'),
          ('journal-correlation-mismatch', 'learner-1', 'journal-prompt', '{}',
            '{"stars":3,"skillEvidence":[{"skill":"writing.correlation-mismatch","outcome":"solid"}]}'),
          ('journal-correlation-multiplicity', 'learner-1', 'journal-prompt', '{}',
            '{"stars":3,"skillEvidence":[{"skill":"writing.correlation-multiplicity","outcome":"solid"}]}'),
          ('journal-correlation-inverse-a', 'learner-1', 'journal-prompt', '{}',
            '{"stars":3,"skillEvidence":[{"skill":"writing.correlation-inverse","outcome":"solid"}]}'),
          ('journal-correlation-inverse-b', 'learner-1', 'journal-prompt', '{}',
            '{"stars":3,"skillEvidence":[{"skill":"writing.correlation-inverse","outcome":"solid"}]}'),
          ('journal-correlation-outcome', 'learner-1', 'journal-prompt', '{}',
            '{"stars":3,"skillEvidence":[{"skill":"writing.correlation-outcome","outcome":"solid"}]}'),
          ('journal-extra-key', 'learner-1', 'journal-prompt', '{}',
            '{"stars":3,"skillEvidence":[{"skill":"writing.extra-key","outcome":"solid"}]}'),
          ('journal-source-play', 'learner-1', 'journal-prompt', '{}',
            '{"stars":3,"skillEvidence":[{"skill":"writing.source-play","outcome":"solid"}]}'),
          ('journal-malformed-nonjournal', 'learner-2', 'journal-prompt', '{}',
            '{"stars":3,"skillEvidence":[{"skill":"writing.malformed-nonjournal","outcome":"solid"}]}'),
          ('journal-malformed-nonjournal-nonarray', 'learner-3', 'journal-prompt', '{}',
            '{"stars":3,"skillEvidence":[{"skill":"writing.malformed-nonjournal-nonarray","outcome":"solid"}]}'),
          ('journal-malformed-nonjournal-array', 'learner-4', 'journal-prompt', '{}',
            '{"stars":3,"skillEvidence":[{"skill":"writing.malformed-nonjournal-array","outcome":"solid"}]}'),
          ('journal-malformed-ledger-valid', 'learner-8', 'journal-prompt', '{}',
            '{"stars":3,"skillEvidence":[{"skill":"writing.malformed-journal-ledger","outcome":"solid"}]}'),
          ('journal-malformed-ledger-bad', 'learner-8', 'journal-prompt', '{}',
            '{"stars":3,"skillEvidence":[42]}'),
          ('legitimate-empty', 'learner-clean', 'reading-comprehension', '{}',
            '{"stars":2,"skillEvidence":[]}'),
          ('legitimate-malformed', 'learner-2', 'reading-comprehension', '{}',
            '{"stars":2}'),
          ('legitimate-malformed-nonarray', 'learner-3', 'reading-comprehension', '{}',
            '{"stars":2,"skillEvidence":{"skill":"writing.malformed-nonjournal-nonarray"}}'),
          ('legitimate-malformed-array', 'learner-4', 'reading-comprehension', '{}',
            '{"stars":2,"skillEvidence":[42]}'),
          ('legitimate-mixed', 'learner-1', 'reading-comprehension',
            '{"choiceIndex":0}',
            '{"stars":2,"skillEvidence":[{"skill":"writing.mixed","outcome":"emerging"}]}');

        INSERT INTO attempt (
          id,
          learner_id,
          activity_id,
          completion_id,
          kind,
          generated,
          program_version_id,
          response,
          score
        ) VALUES
          (
            'legacy-shelf-prior',
            'learner-legacy',
            'shelf-legacy',
            'legacy-completion',
            'number-sense',
            true,
            NULL,
            '{}',
            '{"correct":1,"total":1,"stars":2,"skillEvidence":[]}'
          ),
          (
            'generated-journal-prior',
            'learner-journal-existing',
            'generated-journal-existing',
            'generated-journal-completion',
            'journal-prompt',
            true,
            NULL,
            '{"text":"private generated journal"}',
            '{"stars":2,"skillEvidence":[]}'
          );

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
              jsonb_build_object('skill', 'writing.overflow-cap', 'outcome', 'solid')
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
              jsonb_build_object('skill', 'writing.max-history-cap', 'outcome', 'solid')
            )
          )
        FROM generate_series(1, 24) AS series(n);

        INSERT INTO skill_state (id, learner_id, skill, outcome, evidence) VALUES
          ('rolling-only', 'learner-clean', 'writing.private', 'solid',
            '[{"day":"2026-07-15","outcome":"solid"}]'),
          ('mixed', 'learner-1', 'writing.mixed', 'solid',
            '[{"day":"2026-07-14","outcome":"emerging"},{"day":"2026-07-15","outcome":"solid"}]'),
          ('baseline', 'learner-1', 'writing.baseline', 'solid',
            '[{"day":"2026-07-15","outcome":"solid","source":"baseline"}]'),
          ('malformed', 'learner-1', 'writing.malformed', 'solid',
            '{"legacy":"ambiguous"}'),
          ('empty', 'learner-1', 'writing.empty', 'solid', '[]');
        INSERT INTO skill_state (id, learner_id, skill, outcome, evidence) VALUES
          ('array-malformed', 'learner-1', 'writing.array-malformed', 'solid',
            '[{"day":"2026-07-01"},{"day":"2026-07-02","outcome":"solid","source":null},{"day":"","outcome":"solid"}]'),
          ('invalid-witness', 'learner-journal-invalid', 'writing.invalid-witness', 'solid',
            '[{"day":"2026-07-01","outcome":"solid"}]');
        INSERT INTO skill_state (id, learner_id, skill, outcome, evidence) VALUES
          ('bad-day', 'learner-1', 'writing.bad-day', 'solid',
            '[{"day":123,"outcome":"solid"},{"day":{"x":1},"outcome":"solid"},{"day":"2026-02-30","outcome":"solid"}]'),
          ('nonstring-skill', 'learner-journal-nonstring', '123', 'solid',
            '[{"day":"2026-07-01","outcome":"solid"}]');
        INSERT INTO skill_state (id, learner_id, skill, outcome, evidence) VALUES
          ('correlation-mismatch', 'learner-1', 'writing.correlation-mismatch', 'solid',
            '[{"day":"2026-07-14","outcome":"solid"}]'),
          ('correlation-multiplicity', 'learner-1', 'writing.correlation-multiplicity', 'solid',
            '[{"day":"2026-07-15","outcome":"solid"},{"day":"2026-07-15","outcome":"solid"}]'),
          ('correlation-inverse', 'learner-1', 'writing.correlation-inverse', 'solid',
            '[{"day":"2026-07-15","outcome":"solid"}]'),
          ('correlation-outcome', 'learner-1', 'writing.correlation-outcome', 'emerging',
            '[{"day":"2026-07-15","outcome":"emerging"}]'),
          ('extra-key', 'learner-1', 'writing.extra-key', 'solid',
            '[{"day":"2026-07-15","outcome":"solid","legacy":"ambiguous"}]'),
          ('source-play', 'learner-1', 'writing.source-play', 'solid',
            '[{"day":"2026-07-15","outcome":"solid","source":"play"}]'),
          ('malformed-nonjournal', 'learner-2', 'writing.malformed-nonjournal', 'solid',
            '[{"day":"2026-07-15","outcome":"solid"}]');

        INSERT INTO skill_state (id, learner_id, skill, outcome, evidence) VALUES
          ('malformed-nonjournal-nonarray', 'learner-3', 'writing.malformed-nonjournal-nonarray', 'solid',
            '[{"day":"2026-07-15","outcome":"solid"}]'),
          ('malformed-nonjournal-array', 'learner-4', 'writing.malformed-nonjournal-array', 'solid',
            '[{"day":"2026-07-15","outcome":"solid"}]'),
          ('malformed-journal-ledger', 'learner-8', 'writing.malformed-journal-ledger', 'solid',
            '[{"day":"2026-07-15","outcome":"solid"}]'),
          ('unrelated', 'learner-1', 'writing.unrelated', 'emerging',
            '[{"day":"2026-07-15","outcome":"emerging"}]');

        INSERT INTO skill_state (id, learner_id, skill, outcome, evidence)
        SELECT
          'overflow-cap',
          'learner-5',
          'writing.overflow-cap',
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
          'writing.max-history-cap',
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
          ('rolling-only', 'learner-clean', 'writing.private'),
          ('mixed', 'learner-1', 'writing.mixed'),
          ('baseline', 'learner-1', 'writing.baseline'),
          ('malformed', 'learner-1', 'writing.malformed'),
          ('empty', 'learner-1', 'writing.empty');
        INSERT INTO review_schedule (id, learner_id, skill) VALUES
          ('array-malformed', 'learner-1', 'writing.array-malformed'),
          ('invalid-witness', 'learner-journal-invalid', 'writing.invalid-witness');
        INSERT INTO review_schedule (id, learner_id, skill) VALUES
          ('bad-day', 'learner-1', 'writing.bad-day'),
          ('nonstring-skill', 'learner-journal-nonstring', '123');
        INSERT INTO review_schedule (id, learner_id, skill) VALUES
          ('correlation-mismatch', 'learner-1', 'writing.correlation-mismatch'),
          ('correlation-multiplicity', 'learner-1', 'writing.correlation-multiplicity'),
          ('correlation-inverse', 'learner-1', 'writing.correlation-inverse'),
          ('correlation-outcome', 'learner-1', 'writing.correlation-outcome'),
          ('extra-key', 'learner-1', 'writing.extra-key'),
          ('source-play', 'learner-1', 'writing.source-play'),
          ('malformed-nonjournal', 'learner-2', 'writing.malformed-nonjournal'),
          ('malformed-nonjournal-nonarray', 'learner-3', 'writing.malformed-nonjournal-nonarray'),
          ('malformed-nonjournal-array', 'learner-4', 'writing.malformed-nonjournal-array'),
          ('malformed-journal-ledger', 'learner-8', 'writing.malformed-journal-ledger'),
          ('max-history-cap', 'learner-9', 'writing.max-history-cap'),
          ('overflow-cap', 'learner-5', 'writing.overflow-cap'),
          ('unrelated', 'learner-1', 'writing.unrelated');
      `);

      await db.exec(migrationSql().replaceAll("--> statement-breakpoint", ""));

      const migrated = await db.query<{ response: unknown; score: unknown }>(
        "SELECT response, score FROM attempt WHERE id = 'rolling-legacy'",
      );
      expect(migrated.rows[0]).toEqual({
        response: {
          markCount: 1,
          textLength: 12,
          usedDictation: false,
          mode: "type",
          didDraw: true,
        },
        score: { correct: 1, total: 1, stars: 3, skillEvidence: [] },
      });

      const blank = await db.query<{ response: unknown; score: unknown }>(
        "SELECT response, score FROM attempt WHERE id = 'blank-legacy'",
      );
      expect(blank.rows[0]).toEqual({
        response: {
          markCount: 0,
          textLength: 0,
          usedDictation: false,
          mode: "type",
          didDraw: false,
        },
        score: { correct: 1, total: 1, stars: 1, skillEvidence: [] },
      });

      const migratedGeneratedJournal = await db.query<{
        generated: boolean;
        program_version_id: string | null;
        response: unknown;
        score: unknown;
      }>(`
        SELECT generated, program_version_id, response, score
        FROM attempt
        WHERE id = 'generated-journal-prior'
      `);
      expect(migratedGeneratedJournal.rows[0]).toEqual({
        generated: true,
        program_version_id: null,
        response: {
          markCount: 0,
          textLength: 25,
          usedDictation: false,
          mode: "type",
          didDraw: false,
        },
        score: { correct: 1, total: 1, stars: 2, skillEvidence: [] },
      });

      const remainingSkillState = await db.query<{ id: string }>(
        "SELECT id FROM skill_state ORDER BY id",
      );
      expect(remainingSkillState.rows.map(({ id }) => id)).toEqual([
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

      await db.exec("BEGIN");
      const oldPodInsert = await db.query<{ id: string }>(`
        INSERT INTO attempt (id, learner_id, kind, response, score) VALUES
          ('raw-text', 'learner-1', 'journal-prompt',
            '{"text":"must not reach storage or telemetry"}',
            '{"correct":1,"total":1,"stars":3,"skillEvidence":[{"skill":"writing.private","outcome":"solid"}]}')
        RETURNING id
      `);
      if (oldPodInsert.rows[0]) {
        await db.exec(`
          INSERT INTO skill_state (id, learner_id, skill, outcome, evidence)
          VALUES ('unsafe-fold', 'learner-1', 'writing.private', 'solid', '[]');
          INSERT INTO review_schedule (id, learner_id, skill)
          VALUES ('unsafe-fold', 'learner-1', 'writing.private');
        `);
      }
      await db.exec("COMMIT");

      expect(oldPodInsert.rows).toEqual([]);
      const unsafePersistence = await db.query<{ count: number }>(`
        SELECT (
          (SELECT count(*) FROM attempt WHERE id = 'raw-text')
          + (SELECT count(*) FROM skill_state WHERE id = 'unsafe-fold')
          + (SELECT count(*) FROM review_schedule WHERE id = 'unsafe-fold')
        )::int AS count
      `);
      expect(unsafePersistence.rows[0]?.count).toBe(0);

      const scalarResponse = await db.query<{ id: string }>(`
        INSERT INTO attempt (id, learner_id, kind, response, score) VALUES
          ('scalar-response', 'learner-1', 'journal-prompt',
            '42',
            '{"correct":1,"total":1,"stars":1,"skillEvidence":[]}')
        RETURNING id
      `);
      const scalarScore = await db.query<{ id: string }>(`
        INSERT INTO attempt (id, learner_id, kind, response, score) VALUES
          ('scalar-score', 'learner-1', 'journal-prompt',
            '{"markCount":0,"textLength":0,"usedDictation":false,"mode":"type","didDraw":false}',
            '42')
        RETURNING id
      `);
      expect(scalarResponse.rows).toEqual([]);
      expect(scalarScore.rows).toEqual([]);

      const firstShelf = await db.query<{ id: string }>(`
        INSERT INTO attempt (
          id, learner_id, activity_id, completion_id, kind, generated, response, score
        ) VALUES (
          'shelf-first-attempt',
          'learner-shelf',
          'shelf-first',
          'shelf-first-completion',
          'number-sense',
          true,
          '{}',
          '{"correct":1,"total":1,"stars":3,"skillEvidence":[]}'
        )
        RETURNING id
      `);
      const sameCompletionRetry = await db.query<{ id: string }>(`
        INSERT INTO attempt (
          id, learner_id, activity_id, completion_id, kind, generated, response, score
        ) VALUES (
          'shelf-same-token-retry',
          'learner-shelf',
          'shelf-first',
          'shelf-first-completion',
          'number-sense',
          true,
          '{}',
          '{"correct":0,"total":1,"stars":1,"skillEvidence":[]}'
        )
        RETURNING id
      `);
      const differentCompletion = await db.query<{ id: string }>(`
        INSERT INTO attempt (
          id, learner_id, activity_id, completion_id, kind, generated, response, score
        ) VALUES (
          'shelf-different-token',
          'learner-shelf',
          'shelf-first',
          'shelf-different-completion',
          'number-sense',
          true,
          '{}',
          '{"correct":0,"total":1,"stars":1,"skillEvidence":[]}'
        )
        RETURNING id
      `);
      expect(firstShelf.rows).toEqual([{ id: "shelf-first-attempt" }]);
      expect(sameCompletionRetry.rows).toEqual([]);
      expect(differentCompletion.rows).toEqual([]);
      const replayableOriginal = await db.query<{
        id: string;
        completion_id: string;
        score: unknown;
      }>(`
        SELECT id, completion_id, score
        FROM attempt
        WHERE learner_id = 'learner-shelf' AND activity_id = 'shelf-first'
      `);
      expect(replayableOriginal.rows).toEqual([
        {
          id: "shelf-first-attempt",
          completion_id: "shelf-first-completion",
          score: { correct: 1, total: 1, stars: 3, skillEvidence: [] },
        },
      ]);

      const legacySpent = await db.query<{ id: string }>(`
        INSERT INTO attempt (
          id, learner_id, activity_id, completion_id, kind, generated, response, score
        ) VALUES (
          'legacy-second-attempt',
          'learner-legacy',
          'shelf-legacy',
          'legacy-second-completion',
          'number-sense',
          true,
          '{}',
          '{"correct":1,"total":1,"stars":2,"skillEvidence":[]}'
        )
        RETURNING id
      `);
      expect(legacySpent.rows).toEqual([]);

      const nonShelfFirst = await db.query<{ id: string }>(`
        INSERT INTO attempt (
          id, learner_id, activity_id, completion_id, kind, generated, response, score
        ) VALUES (
          'non-shelf-first', 'learner-free', 'not-a-shelf-row', 'free-1',
          'number-sense', true, '{}',
          '{"correct":1,"total":1,"stars":2,"skillEvidence":[]}'
        ) RETURNING id
      `);
      const nonShelfSecond = await db.query<{ id: string }>(`
        INSERT INTO attempt (
          id, learner_id, activity_id, completion_id, kind, generated, response, score
        ) VALUES (
          'non-shelf-second', 'learner-free', 'not-a-shelf-row', 'free-2',
          'number-sense', true, '{}',
          '{"correct":1,"total":1,"stars":2,"skillEvidence":[]}'
        ) RETURNING id
      `);
      expect(nonShelfFirst.rows).toEqual([{ id: "non-shelf-first" }]);
      expect(nonShelfSecond.rows).toEqual([{ id: "non-shelf-second" }]);

      const authoredOnShelfId = await db.query<{ id: string }>(`
        INSERT INTO attempt (
          id, learner_id, activity_id, completion_id, kind, generated, response, score
        ) VALUES (
          'authored-on-shelf-id', 'learner-shelf', 'shelf-first', 'authored-1',
          'number-sense', false, '{}',
          '{"correct":1,"total":1,"stars":2,"skillEvidence":[]}'
        ) RETURNING id
      `);
      expect(authoredOnShelfId.rows).toEqual([{ id: "authored-on-shelf-id" }]);

      const unsafeGeneratedJournal = await db.query<{ id: string }>(`
        INSERT INTO attempt (
          id, learner_id, activity_id, completion_id, kind, generated, response, score
        ) VALUES (
          'unsafe-generated-journal',
          'learner-journal-new',
          'generated-journal-new',
          'unsafe-generated-journal-completion',
          'journal-prompt',
          true,
          '{"text":"must not persist"}',
          '{"correct":1,"total":1,"stars":2,"skillEvidence":[]}'
        ) RETURNING id
      `);
      expect(unsafeGeneratedJournal.rows).toEqual([]);

      await expect(
        db.exec(`
          INSERT INTO attempt (id, learner_id, kind, response, score) VALUES
            ('safe-summary', 'learner-1', 'journal-prompt',
              '{"markCount":0,"textLength":0,"usedDictation":false,"mode":"type","didDraw":false}',
              '{"correct":1,"total":1,"stars":1,"skillEvidence":[]}')
        `),
      ).resolves.not.toThrow();

      const beforeUnsafeUpdate = await db.query<{ response: unknown; score: unknown }>(
        "SELECT response, score FROM attempt WHERE id = 'safe-summary'",
      );
      const unsafeUpdate = await db.query<{ id: string }>(`
        UPDATE attempt
        SET response = '{"text":"update sentinel"}',
            score = '{"correct":1,"total":1,"stars":3,"skillEvidence":[{"skill":"writing.private","outcome":"solid"}]}'
        WHERE id = 'safe-summary'
        RETURNING id
      `);
      expect(unsafeUpdate.rows).toEqual([]);
      const afterUnsafeUpdate = await db.query<{ response: unknown; score: unknown }>(
        "SELECT response, score FROM attempt WHERE id = 'safe-summary'",
      );
      expect(afterUnsafeUpdate.rows).toEqual(beforeUnsafeUpdate.rows);

      await db.exec('ALTER TABLE attempt DISABLE TRIGGER "attempt_journal_summary_guard_trg"');
      await expect(
        db.exec(`
          INSERT INTO attempt (id, learner_id, kind, response, score) VALUES
            ('guard-defense', 'learner-1', 'journal-prompt',
              '{"text":"must still fail closed"}',
              '{"correct":1,"total":1,"stars":3,"skillEvidence":[]}')
        `),
      ).rejects.toThrow(/attempt_journal_summary_only_ck/i);
      await expect(
        db.exec(`
          INSERT INTO attempt (id, learner_id, kind, response, score) VALUES
            ('scalar-response-check', 'learner-1', 'journal-prompt',
              '42',
              '{"correct":1,"total":1,"stars":1,"skillEvidence":[]}')
        `),
      ).rejects.toThrow(/attempt_journal_summary_only_ck/i);
      await expect(
        db.exec(`
          INSERT INTO attempt (id, learner_id, kind, response, score) VALUES
            ('scalar-score-check', 'learner-1', 'journal-prompt',
              '{"markCount":0,"textLength":0,"usedDictation":false,"mode":"type","didDraw":false}',
              '42')
        `),
      ).rejects.toThrow(/attempt_journal_summary_only_ck/i);
    } finally {
      await db.close();
    }
  });
});
