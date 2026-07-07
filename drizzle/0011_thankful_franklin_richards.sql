CREATE TABLE "generated_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"learner_id" text NOT NULL,
	"program_slug" text NOT NULL,
	"unit_key" text NOT NULL,
	"lesson_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"config" jsonb NOT NULL,
	"skill_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"gen_model" text NOT NULL,
	"gen_route" text NOT NULL,
	"gen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generated_activity" ADD CONSTRAINT "generated_activity_learner_id_learner_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learner"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generated_activity_learner_lesson_idx" ON "generated_activity" USING btree ("learner_id","lesson_id");--> statement-breakpoint
CREATE INDEX "generated_activity_learner_idx" ON "generated_activity" USING btree ("learner_id");