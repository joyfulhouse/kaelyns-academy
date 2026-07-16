ALTER TABLE "attempt" ADD COLUMN "program_slug" text;--> statement-breakpoint
ALTER TABLE "attempt" ADD COLUMN "unit_key" text;--> statement-breakpoint
ALTER TABLE "attempt" ADD COLUMN "program_version_id" text;--> statement-breakpoint
ALTER TABLE "oral_reading_verification" ADD COLUMN "program_version_id" text;--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_program_version_id_program_version_id_fk" FOREIGN KEY ("program_version_id") REFERENCES "public"."program_version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oral_reading_verification" ADD CONSTRAINT "oral_reading_verification_program_version_id_program_version_id_fk" FOREIGN KEY ("program_version_id") REFERENCES "public"."program_version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
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

-- Mixed histories are intentionally preserved wholesale. Legacy skill_state
-- evidence has day/outcome/source but no attempt id or activity kind, so any row
-- with non-journal ledger evidence or a baseline entry is ambiguous and cannot
-- be surgically rewritten without risking legitimate mastery.
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
	WHERE kind = 'journal-prompt'
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
WHERE "attempt"."id" = "journal_summary"."id";

-- Future surgical repair of preserved mixed histories requires per-evidence
-- attempt provenance (or a full replay ledger that also captures placement events).
