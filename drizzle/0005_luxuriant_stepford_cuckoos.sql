-- Expand-only: three additive b-tree indexes; no drops/renames/column changes.
-- Plain (non-CONCURRENT) CREATE INDEX is used deliberately: the deploy applies
-- migrations via drizzle-kit's transactional `migrate`, and CREATE INDEX
-- CONCURRENTLY cannot run inside a transaction block. The brief share-lock on
-- writes is negligible at the current single-pilot-learner data volume. When
-- these tables grow, move to a non-transactional migration runner and switch to
-- CREATE INDEX CONCURRENTLY. IF NOT EXISTS keeps the migration safe to re-run.
CREATE INDEX IF NOT EXISTS "attempt_learner_generated_idx" ON "attempt" USING btree ("learner_id","generated");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learner_account_idx" ON "learner" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_state_learner_idx" ON "skill_state" USING btree ("learner_id");
