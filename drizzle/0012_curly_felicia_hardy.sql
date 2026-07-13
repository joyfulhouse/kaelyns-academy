CREATE TABLE "review_schedule" (
	"id" text PRIMARY KEY NOT NULL,
	"learner_id" text NOT NULL,
	"skill" text NOT NULL,
	"program_slug" text NOT NULL,
	"interval_index" integer DEFAULT 0 NOT NULL,
	"next_review_on" date NOT NULL,
	"last_reviewed_on" date,
	"last_outcome" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_schedule" ADD CONSTRAINT "review_schedule_learner_id_learner_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learner"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_schedule_learner_skill_uq" ON "review_schedule" USING btree ("learner_id","skill");--> statement-breakpoint
CREATE INDEX "review_schedule_learner_next_idx" ON "review_schedule" USING btree ("learner_id","next_review_on");