CREATE INDEX "attempt_learner_generated_idx" ON "attempt" USING btree ("learner_id","generated");--> statement-breakpoint
CREATE INDEX "learner_account_idx" ON "learner" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "skill_state_learner_idx" ON "skill_state" USING btree ("learner_id");