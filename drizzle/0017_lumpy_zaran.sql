ALTER TABLE "generated_activity" ADD COLUMN "program_version_id" text;--> statement-breakpoint
ALTER TABLE "generated_activity" ADD CONSTRAINT "generated_activity_program_version_id_program_version_id_fk" FOREIGN KEY ("program_version_id") REFERENCES "public"."program_version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- A rejected old-pod write must abort its whole transaction without raising from
-- the parameterized attempt statement. Each guard inserts one of these fixed,
-- pre-seeded reasons. Both known writers use an explicit transaction and leave
-- constraints deferred, so the duplicate is detected only at their parameterless
-- COMMIT; the error contains no child response parameters, and every downstream
-- fold is rolled back with the suppressed attempt.
CREATE TABLE "attempt_write_abort_signal" (
	"reason" text NOT NULL,
	CONSTRAINT "attempt_write_abort_signal_uq" UNIQUE("reason") DEFERRABLE INITIALLY DEFERRED
);--> statement-breakpoint
INSERT INTO "attempt_write_abort_signal" ("reason") VALUES
	('generated_one_shot'),
	('unsafe_journal');--> statement-breakpoint
-- A durable generated shelf row is one-shot even while an old application
-- image is running. Lock the learner-owned shelf row to serialize concurrent
-- first submits. Same-token retries reach the completion-id conflict handler;
-- every other later attempt schedules a transaction abort before being suppressed.
-- Generated attempts without a real owned shelf row remain unaffected.
CREATE FUNCTION "attempt_generated_one_shot_guard"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW."generated" IS DISTINCT FROM true THEN
		RETURN NEW;
	END IF;

	PERFORM 1
	FROM "generated_activity" AS "shelf"
	WHERE "shelf"."id" = NEW."activity_id"
		AND "shelf"."learner_id" = NEW."learner_id"
	FOR UPDATE;

	IF NOT FOUND THEN
		RETURN NEW;
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "attempt" AS "prior_attempt"
		WHERE "prior_attempt"."learner_id" = NEW."learner_id"
			AND "prior_attempt"."activity_id" = NEW."activity_id"
			AND "prior_attempt"."generated" = true
	) THEN
		IF NEW."completion_id" IS NOT NULL AND EXISTS (
			SELECT 1
			FROM "attempt" AS "same_completion"
			WHERE "same_completion"."learner_id" = NEW."learner_id"
				AND "same_completion"."completion_id" = NEW."completion_id"
		) THEN
			RETURN NEW;
		END IF;

		INSERT INTO "attempt_write_abort_signal" ("reason")
		VALUES ('generated_one_shot');
		RETURN NULL;
	END IF;

	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "attempt_generated_one_shot_guard_trg"
	BEFORE INSERT ON "attempt"
	FOR EACH ROW EXECUTE FUNCTION "attempt_generated_one_shot_guard"();--> statement-breakpoint
-- Install the old-pod guard before the CHECK. Unsafe journal DML becomes a
-- row-level no-op, while a fixed deferred duplicate schedules a COMMIT failure.
-- The parameterized statement never raises, so raw response values cannot enter
-- telemetry; the commit failure rolls back every old-writer mastery/review fold.
-- Safe summary-only writes proceed to the independent CHECK below.
CREATE FUNCTION "attempt_journal_summary_guard"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW."kind" <> 'journal-prompt' THEN
		RETURN NEW;
	END IF;

	IF COALESCE(
		jsonb_typeof(NEW."response") = 'object'
		AND CASE
			WHEN jsonb_typeof(NEW."response") = 'object'
				THEN NEW."response" ?& ARRAY['markCount', 'textLength', 'usedDictation', 'mode', 'didDraw']
			ELSE false
		END
		AND CASE
			WHEN jsonb_typeof(NEW."response") = 'object'
				THEN NEW."response" - ARRAY['markCount', 'textLength', 'usedDictation', 'mode', 'didDraw']::text[]
			ELSE NULL
		END IS NOT DISTINCT FROM '{}'::jsonb
		AND CASE
			WHEN jsonb_typeof(NEW."response" -> 'markCount') = 'number'
				THEN (NEW."response" ->> 'markCount')::numeric BETWEEN 0 AND 200
					AND trunc((NEW."response" ->> 'markCount')::numeric) = (NEW."response" ->> 'markCount')::numeric
			ELSE false
		END
		AND CASE
			WHEN jsonb_typeof(NEW."response" -> 'textLength') = 'number'
				THEN (NEW."response" ->> 'textLength')::numeric BETWEEN 0 AND 2000
					AND trunc((NEW."response" ->> 'textLength')::numeric) = (NEW."response" ->> 'textLength')::numeric
			ELSE false
		END
		AND NEW."response" -> 'usedDictation' IN ('true'::jsonb, 'false'::jsonb)
		AND NEW."response" ->> 'mode' IN ('draw', 'scribe', 'type', 'dictate')
		AND NEW."response" -> 'didDraw' IN ('true'::jsonb, 'false'::jsonb)
		AND jsonb_typeof(NEW."score") = 'object'
		AND CASE
			WHEN jsonb_typeof(NEW."score") = 'object'
				THEN NEW."score" ?& ARRAY['correct', 'total', 'stars', 'skillEvidence']
			ELSE false
		END
		AND CASE
			WHEN jsonb_typeof(NEW."score") = 'object'
				THEN NEW."score" - ARRAY['correct', 'total', 'stars', 'skillEvidence']::text[]
			ELSE NULL
		END IS NOT DISTINCT FROM '{}'::jsonb
		AND NEW."score" -> 'correct' = '1'::jsonb
		AND NEW."score" -> 'total' = '1'::jsonb
		AND CASE
			WHEN jsonb_typeof(NEW."score" -> 'stars') = 'number'
				THEN (NEW."score" ->> 'stars')::numeric BETWEEN 1 AND 3
					AND trunc((NEW."score" ->> 'stars')::numeric) = (NEW."score" ->> 'stars')::numeric
			ELSE false
		END
		AND NEW."score" -> 'skillEvidence' = '[]'::jsonb
	, false) THEN
		RETURN NEW;
	END IF;

	INSERT INTO "attempt_write_abort_signal" ("reason")
	VALUES ('unsafe_journal');
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "attempt_journal_summary_guard_trg"
	BEFORE INSERT OR UPDATE ON "attempt"
	FOR EACH ROW EXECUTE FUNCTION "attempt_journal_summary_guard"();--> statement-breakpoint
-- NOT VALID tolerates existing rows while still providing an independent
-- defense if the trigger is ever disabled. Creating the trigger takes the table
-- lock first, so cleanup below sees every old transaction that was already in flight.
	ALTER TABLE "attempt" ADD CONSTRAINT "attempt_journal_summary_only_ck" CHECK ("attempt"."kind" <> 'journal-prompt' OR COALESCE(
	        jsonb_typeof("attempt"."response") = 'object'
	        AND CASE
	          WHEN jsonb_typeof("attempt"."response") = 'object'
	            THEN "attempt"."response" ?& ARRAY['markCount', 'textLength', 'usedDictation', 'mode', 'didDraw']
	          ELSE false
	        END
	        AND CASE
	          WHEN jsonb_typeof("attempt"."response") = 'object'
	            THEN "attempt"."response" - ARRAY['markCount', 'textLength', 'usedDictation', 'mode', 'didDraw']::text[]
	          ELSE NULL
	        END IS NOT DISTINCT FROM '{}'::jsonb
        AND CASE
          WHEN jsonb_typeof("attempt"."response" -> 'markCount') = 'number'
            THEN ("attempt"."response" ->> 'markCount')::numeric BETWEEN 0 AND 200
              AND trunc(("attempt"."response" ->> 'markCount')::numeric) = ("attempt"."response" ->> 'markCount')::numeric
          ELSE false
        END
        AND CASE
          WHEN jsonb_typeof("attempt"."response" -> 'textLength') = 'number'
            THEN ("attempt"."response" ->> 'textLength')::numeric BETWEEN 0 AND 2000
              AND trunc(("attempt"."response" ->> 'textLength')::numeric) = ("attempt"."response" ->> 'textLength')::numeric
          ELSE false
        END
        AND "attempt"."response" -> 'usedDictation' IN ('true'::jsonb, 'false'::jsonb)
        AND "attempt"."response" ->> 'mode' IN ('draw', 'scribe', 'type', 'dictate')
	        AND "attempt"."response" -> 'didDraw' IN ('true'::jsonb, 'false'::jsonb)
	        AND jsonb_typeof("attempt"."score") = 'object'
	        AND CASE
	          WHEN jsonb_typeof("attempt"."score") = 'object'
	            THEN "attempt"."score" ?& ARRAY['correct', 'total', 'stars', 'skillEvidence']
	          ELSE false
	        END
	        AND CASE
	          WHEN jsonb_typeof("attempt"."score") = 'object'
	            THEN "attempt"."score" - ARRAY['correct', 'total', 'stars', 'skillEvidence']::text[]
	          ELSE NULL
	        END IS NOT DISTINCT FROM '{}'::jsonb
        AND "attempt"."score" -> 'correct' = '1'::jsonb
        AND "attempt"."score" -> 'total' = '1'::jsonb
        AND CASE
          WHEN jsonb_typeof("attempt"."score" -> 'stars') = 'number'
            THEN ("attempt"."score" ->> 'stars')::numeric BETWEEN 1 AND 3
              AND trunc(("attempt"."score" ->> 'stars')::numeric) = ("attempt"."score" ->> 'stars')::numeric
          ELSE false
        END
        AND "attempt"."score" -> 'skillEvidence' = '[]'::jsonb
      , false)) NOT VALID;--> statement-breakpoint
-- Historical journal prompts could emit mastery evidence before journal scoring
-- became participation-only. Delete derived mastery only when the bounded state
-- is an exact, untruncated multiset of well-formed journal ledger emissions and
-- every other ledger entry for the learner is usable enough to rule out mixed
-- provenance. The predicate fails closed on every malformed/ambiguous shape.
CREATE FUNCTION "journal_skill_state_is_exclusive"(
	"candidate_learner_id" text,
	"candidate_skill" text,
	"candidate_evidence" jsonb
) RETURNS boolean
LANGUAGE sql
STABLE
AS $function$
WITH "state_entries" AS MATERIALIZED (
	SELECT "entry"."value"
	FROM jsonb_array_elements(
		CASE
			WHEN jsonb_typeof("candidate_evidence") = 'array' THEN "candidate_evidence"
			ELSE '[]'::jsonb
		END
	) AS "entry"("value")
),
"state_events" AS MATERIALIZED (
	SELECT
		"value" ->> 'day' AS "day",
		"value" ->> 'outcome' AS "outcome",
		count(*) AS "event_count"
	FROM "state_entries"
	GROUP BY "value" ->> 'day', "value" ->> 'outcome'
),
"journal_entries" AS MATERIALIZED (
	SELECT
		"ledger_attempt"."day"::text AS "day",
		"entry"."value"
	FROM "attempt" AS "ledger_attempt"
	CROSS JOIN LATERAL jsonb_array_elements(
		CASE
			WHEN jsonb_typeof("ledger_attempt"."score" -> 'skillEvidence') = 'array'
				THEN "ledger_attempt"."score" -> 'skillEvidence'
			ELSE '[]'::jsonb
		END
	) AS "entry"("value")
	WHERE "ledger_attempt"."learner_id" = "candidate_learner_id"
		AND "ledger_attempt"."kind" = 'journal-prompt'
),
"journal_events" AS MATERIALIZED (
	SELECT
		"day",
		"value" ->> 'outcome' AS "outcome",
		count(*) AS "event_count"
	FROM "journal_entries"
	WHERE COALESCE(
		jsonb_typeof("value") = 'object'
		AND CASE
			WHEN jsonb_typeof("value") = 'object'
				THEN "value" ?& ARRAY['skill', 'outcome']
			ELSE false
		END
		AND CASE
			WHEN jsonb_typeof("value") = 'object'
				THEN "value" - ARRAY['skill', 'outcome']::text[]
			ELSE NULL
		END IS NOT DISTINCT FROM '{}'::jsonb
		AND jsonb_typeof("value" -> 'skill') = 'string'
		AND NULLIF(btrim("value" ->> 'skill'), '') IS NOT NULL
		AND jsonb_typeof("value" -> 'outcome') = 'string'
		AND "value" ->> 'outcome' IN ('not_yet', 'emerging', 'solid'),
		false
	)
		AND "value" ->> 'skill' = "candidate_skill"
	GROUP BY "day", "value" ->> 'outcome'
)
SELECT COALESCE(
	jsonb_typeof("candidate_evidence") = 'array'
	AND jsonb_array_length(
		CASE
			WHEN jsonb_typeof("candidate_evidence") = 'array' THEN "candidate_evidence"
			ELSE '[]'::jsonb
		END
	) BETWEEN 1 AND 23
	AND NOT EXISTS (
		SELECT 1
		FROM "state_entries"
		WHERE NOT COALESCE(
			jsonb_typeof("value") = 'object'
			AND CASE
				WHEN jsonb_typeof("value") = 'object'
					THEN "value" ?& ARRAY['day', 'outcome']
				ELSE false
			END
			AND CASE
				WHEN jsonb_typeof("value") = 'object'
					THEN "value" - ARRAY['day', 'outcome']::text[]
				ELSE NULL
			END IS NOT DISTINCT FROM '{}'::jsonb
			AND jsonb_typeof("value" -> 'day') = 'string'
			AND "value" ->> 'day' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
			AND pg_input_is_valid("value" ->> 'day', 'date')
			AND jsonb_typeof("value" -> 'outcome') = 'string'
			AND "value" ->> 'outcome' IN ('not_yet', 'emerging', 'solid'),
			false
		)
	)
	AND COALESCE((SELECT sum("event_count") FROM "journal_events"), 0) BETWEEN 1 AND 23
	AND NOT EXISTS (
		SELECT 1
		FROM "state_events" AS "state_event"
		FULL OUTER JOIN "journal_events" AS "journal_event"
			ON "state_event"."day" = "journal_event"."day"
			AND "state_event"."outcome" = "journal_event"."outcome"
		WHERE "state_event"."event_count" IS DISTINCT FROM "journal_event"."event_count"
	)
	AND NOT EXISTS (
		SELECT 1
		FROM "attempt" AS "journal_attempt"
		WHERE "journal_attempt"."learner_id" = "candidate_learner_id"
			AND "journal_attempt"."kind" = 'journal-prompt'
			AND (
				jsonb_typeof("journal_attempt"."score" -> 'skillEvidence') IS DISTINCT FROM 'array'
				OR EXISTS (
					SELECT 1
					FROM jsonb_array_elements(
						CASE
							WHEN jsonb_typeof("journal_attempt"."score" -> 'skillEvidence') = 'array'
								THEN "journal_attempt"."score" -> 'skillEvidence'
							ELSE '[]'::jsonb
						END
					) AS "journal_evidence"("value")
					WHERE NOT COALESCE(
						jsonb_typeof("journal_evidence"."value") = 'object'
						AND CASE
							WHEN jsonb_typeof("journal_evidence"."value") = 'object'
								THEN "journal_evidence"."value" ?& ARRAY['skill', 'outcome']
							ELSE false
						END
						AND CASE
							WHEN jsonb_typeof("journal_evidence"."value") = 'object'
								THEN "journal_evidence"."value" - ARRAY['skill', 'outcome']::text[]
							ELSE NULL
						END IS NOT DISTINCT FROM '{}'::jsonb
						AND jsonb_typeof("journal_evidence"."value" -> 'skill') = 'string'
						AND NULLIF(btrim("journal_evidence"."value" ->> 'skill'), '') IS NOT NULL
						AND jsonb_typeof("journal_evidence"."value" -> 'outcome') = 'string'
						AND "journal_evidence"."value" ->> 'outcome' IN ('not_yet', 'emerging', 'solid'),
						false
					)
				)
			)
	)
	AND NOT EXISTS (
		SELECT 1
		FROM "attempt" AS "non_journal_attempt"
		WHERE "non_journal_attempt"."learner_id" = "candidate_learner_id"
			AND "non_journal_attempt"."kind" <> 'journal-prompt'
			AND (
				jsonb_typeof("non_journal_attempt"."score" -> 'skillEvidence') IS DISTINCT FROM 'array'
				OR EXISTS (
					SELECT 1
					FROM jsonb_array_elements(
						CASE
							WHEN jsonb_typeof("non_journal_attempt"."score" -> 'skillEvidence') = 'array'
								THEN "non_journal_attempt"."score" -> 'skillEvidence'
							ELSE '[]'::jsonb
						END
					) AS "non_journal_evidence"("value")
					WHERE NOT COALESCE(
						jsonb_typeof("non_journal_evidence"."value") = 'object'
						AND CASE
							WHEN jsonb_typeof("non_journal_evidence"."value") = 'object'
								THEN "non_journal_evidence"."value" ?& ARRAY['skill', 'outcome']
							ELSE false
						END
						AND CASE
							WHEN jsonb_typeof("non_journal_evidence"."value") = 'object'
								THEN "non_journal_evidence"."value" - ARRAY['skill', 'outcome']::text[]
							ELSE NULL
						END IS NOT DISTINCT FROM '{}'::jsonb
						AND jsonb_typeof("non_journal_evidence"."value" -> 'skill') = 'string'
						AND NULLIF(btrim("non_journal_evidence"."value" ->> 'skill'), '') IS NOT NULL
						AND jsonb_typeof("non_journal_evidence"."value" -> 'outcome') = 'string'
						AND "non_journal_evidence"."value" ->> 'outcome' IN ('not_yet', 'emerging', 'solid'),
						false
					)
						OR "non_journal_evidence"."value" ->> 'skill' = "candidate_skill"
				)
			)
	),
	false
);
$function$;--> statement-breakpoint
-- Delete a review schedule before its matching state row, using the same
-- exact provenance predicate as the mastery cleanup.
DELETE FROM "review_schedule" AS "schedule"
WHERE EXISTS (
	SELECT 1
	FROM "skill_state" AS "state"
	WHERE "state"."learner_id" = "schedule"."learner_id"
		AND "state"."skill" = "schedule"."skill"
		AND "journal_skill_state_is_exclusive"(
			"state"."learner_id",
			"state"."skill",
			"state"."evidence"
		)
);--> statement-breakpoint
DELETE FROM "skill_state" AS "state"
WHERE "journal_skill_state_is_exclusive"(
	"state"."learner_id",
	"state"."skill",
	"state"."evidence"
);--> statement-breakpoint
DROP FUNCTION "journal_skill_state_is_exclusive"(text, text, jsonb);--> statement-breakpoint
WITH "journal_source" AS (
	SELECT
		"id",
		"response",
		"score",
		LEAST(
			200,
			GREATEST(
				CASE
					WHEN jsonb_typeof("response" -> 'markCount') = 'number'
						THEN LEAST(
							200::numeric,
							GREATEST(0::numeric, trunc(("response" ->> 'markCount')::numeric))
						)::integer
					ELSE 0
				END,
				CASE
					WHEN jsonb_typeof("response" -> 'strokes') = 'array'
						THEN LEAST(200, jsonb_array_length("response" -> 'strokes'))
					ELSE 0
				END,
				CASE
					WHEN "response" -> 'didDraw' = 'true'::jsonb
						OR (
							jsonb_typeof("response" -> 'drawingDataUrl') = 'string'
							AND char_length("response" ->> 'drawingDataUrl') > 0
						)
						THEN 1
					ELSE 0
				END
			)
		)::integer AS "mark_count",
		LEAST(
			2000,
			GREATEST(
				CASE
					WHEN jsonb_typeof("response" -> 'textLength') = 'number'
						THEN LEAST(
							2000::numeric,
							GREATEST(0::numeric, trunc(("response" ->> 'textLength')::numeric))
						)::integer
					ELSE 0
				END,
				CASE
					WHEN jsonb_typeof("response" -> 'text') = 'string'
						THEN char_length("response" ->> 'text')
					ELSE 0
				END,
				CASE
					WHEN jsonb_typeof("response" -> 'transcript') = 'string'
						THEN char_length("response" ->> 'transcript')
					ELSE 0
				END
			)
		)::integer AS "text_length"
	FROM "attempt"
	WHERE "kind" = 'journal-prompt'
),
"journal_facts" AS (
	SELECT
		*,
		"mark_count" > 0 AS "did_draw",
		"text_length" > 0
			AND COALESCE((
				"response" -> 'usedDictation' = 'true'::jsonb
					OR "response" ->> 'mode' = 'dictate'
					OR (
						jsonb_typeof("response" -> 'transcript') = 'string'
						AND char_length("response" ->> 'transcript') > 0
					)
			), false) AS "used_dictation"
	FROM "journal_source"
),
"journal_summary" AS (
	SELECT
		"id",
		jsonb_build_object(
			'markCount', "mark_count",
			'textLength', "text_length",
			'usedDictation', "used_dictation",
			'mode', CASE
				WHEN "response" ->> 'mode' = 'draw' AND "did_draw" THEN 'draw'
				WHEN "response" ->> 'mode' IN ('scribe', 'type') AND "text_length" > 0
					THEN "response" ->> 'mode'
				WHEN "response" ->> 'mode' = 'dictate' AND "used_dictation" THEN 'dictate'
				WHEN "used_dictation" THEN 'dictate'
				WHEN "text_length" > 0 THEN 'type'
				WHEN "did_draw" THEN 'draw'
				ELSE 'type'
			END,
			'didDraw', "did_draw"
		) AS "response",
		jsonb_build_object(
			'correct', 1,
			'total', 1,
			'stars', CASE
				WHEN jsonb_typeof("score" -> 'stars') = 'number'
					THEN LEAST(
						3::numeric,
						GREATEST(1::numeric, trunc(("score" ->> 'stars')::numeric))
					)::integer
				ELSE 1
			END,
			'skillEvidence', '[]'::jsonb
		) AS "score"
	FROM "journal_facts"
)
UPDATE "attempt"
SET
	"response" = "journal_summary"."response",
	"score" = "journal_summary"."score"
FROM "journal_summary"
WHERE "attempt"."id" = "journal_summary"."id";--> statement-breakpoint
ALTER TABLE "attempt" VALIDATE CONSTRAINT "attempt_journal_summary_only_ck";
