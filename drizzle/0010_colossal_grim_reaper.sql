CREATE TABLE "checkpoint_result" (
	"id" text PRIMARY KEY NOT NULL,
	"learner_id" text NOT NULL,
	"enrollment_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"phase" text NOT NULL,
	"scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "checkpoint_result" ADD CONSTRAINT "checkpoint_result_learner_id_learner_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learner"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoint_result" ADD CONSTRAINT "checkpoint_result_enrollment_id_enrollment_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "checkpoint_result_learner_unit_phase_uq" ON "checkpoint_result" USING btree ("learner_id","unit_id","phase");--> statement-breakpoint
CREATE INDEX "checkpoint_result_learner_idx" ON "checkpoint_result" USING btree ("learner_id");