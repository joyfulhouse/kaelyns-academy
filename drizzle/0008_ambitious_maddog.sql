-- Expand-only (P6 COPPA: AI provenance + account-deletion audit). Backward-
-- compatible and idempotent so it is safe to PRE-APPLY in-cluster before the
-- dependent code deploys (migrate-before-traffic) and safe for the migrate
-- initContainer to re-run after journal drift. Matches the house style (0006/0007).
--
-- 1) attempt.gen_model/gen_route/gen_at — all NULLABLE, no default, no backfill.
--    Authored + pre-existing generated rows stay null (UI shows "model not
--    recorded"). NOT added to REQUIRED_COLUMNS: they're nullable provenance, so
--    they must NOT trip the schema-drift 503 canary.
-- 2) deletion_audit — NO foreign key to "user" (it records the deletion of that
--    very user, so an FK+cascade would erase the audit it just wrote). user_id
--    is a plain column; the row survives the cascade.
-- No drops, no renames, no type changes → no destructive DDL.
CREATE TABLE IF NOT EXISTS "deletion_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"learner_count" integer DEFAULT 0 NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"requested_by" text DEFAULT 'parent' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attempt" ADD COLUMN IF NOT EXISTS "gen_model" text;--> statement-breakpoint
ALTER TABLE "attempt" ADD COLUMN IF NOT EXISTS "gen_route" text;--> statement-breakpoint
ALTER TABLE "attempt" ADD COLUMN IF NOT EXISTS "gen_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deletion_audit_user_idx" ON "deletion_audit" USING btree ("user_id");
