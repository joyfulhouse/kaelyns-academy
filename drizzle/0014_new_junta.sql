ALTER TABLE "attempt" ADD COLUMN "completion_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_learner_completion_uq" ON "attempt" USING btree ("learner_id","completion_id");