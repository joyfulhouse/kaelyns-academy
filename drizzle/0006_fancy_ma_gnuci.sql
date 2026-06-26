-- Expand-only: two additive b-tree indexes covering the publisher/program FKs
-- (publisher.owner_user_id, program.publisher_id) that had no covering index.
-- No drops/renames/column changes. Plain (non-CONCURRENT) CREATE INDEX is used
-- deliberately: the deploy applies migrations transactionally and CREATE INDEX
-- CONCURRENTLY cannot run inside a transaction block; the brief share-lock is
-- negligible at the current single-pilot-learner data volume (see 0005 for the
-- rationale and the migration-runner switch path). IF NOT EXISTS keeps the
-- migration safe to re-run / re-apply after journal drift, matching 0004/0005.
CREATE INDEX IF NOT EXISTS "program_publisher_idx" ON "program" USING btree ("publisher_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publisher_owner_user_idx" ON "publisher" USING btree ("owner_user_id");
