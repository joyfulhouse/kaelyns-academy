ALTER TABLE "attempt" ADD COLUMN "program_slug" text;--> statement-breakpoint
ALTER TABLE "attempt" ADD COLUMN "unit_key" text;--> statement-breakpoint
ALTER TABLE "attempt" ADD COLUMN "program_version_id" text;--> statement-breakpoint
ALTER TABLE "oral_reading_verification" ADD COLUMN "program_version_id" text;--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_program_version_id_program_version_id_fk" FOREIGN KEY ("program_version_id") REFERENCES "public"."program_version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oral_reading_verification" ADD CONSTRAINT "oral_reading_verification_program_version_id_program_version_id_fk" FOREIGN KEY ("program_version_id") REFERENCES "public"."program_version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
WITH "journal_emitted_skills" AS MATERIALIZED (
	SELECT DISTINCT
		"journal_attempt"."learner_id",
		"journal_evidence"."value" ->> 'skill' AS "skill"
	FROM "attempt" AS "journal_attempt"
	CROSS JOIN LATERAL jsonb_array_elements(
		CASE
			WHEN jsonb_typeof("journal_attempt"."score" -> 'skillEvidence') = 'array'
				THEN "journal_attempt"."score" -> 'skillEvidence'
			ELSE '[]'::jsonb
		END
	) AS "journal_evidence"("value")
	WHERE "journal_attempt"."kind" = 'journal-prompt'
		AND jsonb_typeof("journal_evidence"."value") = 'object'
		AND NULLIF("journal_evidence"."value" ->> 'skill', '') IS NOT NULL
)
DELETE FROM "skill_state" AS "state"
USING "journal_emitted_skills" AS "journal"
WHERE "state"."learner_id" = "journal"."learner_id"
	AND "state"."skill" = "journal"."skill"
	AND jsonb_typeof("state"."evidence") = 'array'
	AND NOT EXISTS (
		SELECT 1
		FROM "attempt" AS "non_journal_attempt"
		CROSS JOIN LATERAL jsonb_array_elements(
			CASE
				WHEN jsonb_typeof("non_journal_attempt"."score" -> 'skillEvidence') = 'array'
					THEN "non_journal_attempt"."score" -> 'skillEvidence'
				ELSE '[]'::jsonb
			END
		) AS "non_journal_evidence"("value")
		WHERE "non_journal_attempt"."learner_id" = "state"."learner_id"
			AND "non_journal_attempt"."kind" <> 'journal-prompt'
			AND jsonb_typeof("non_journal_evidence"."value") = 'object'
			AND "non_journal_evidence"."value" ->> 'skill' = "state"."skill"
	)
	AND NOT EXISTS (
		SELECT 1
		FROM jsonb_array_elements("state"."evidence") AS "malformed_evidence"("value")
		WHERE jsonb_typeof("malformed_evidence"."value") <> 'object'
			OR "malformed_evidence"."value" ->> 'day' IS NULL
			OR "malformed_evidence"."value" ->> 'outcome' NOT IN ('not_yet', 'emerging', 'solid')
			OR COALESCE("malformed_evidence"."value" ->> 'source', 'play') NOT IN ('play', 'baseline')
	)
	AND NOT EXISTS (
		SELECT 1
		FROM jsonb_array_elements(
			CASE
				WHEN jsonb_typeof("state"."evidence") = 'array' THEN "state"."evidence"
				ELSE '[]'::jsonb
			END
		) AS "existing_evidence"("value")
		WHERE "existing_evidence"."value" ->> 'source' = 'baseline'
	);--> statement-breakpoint

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
