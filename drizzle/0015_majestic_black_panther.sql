CREATE TABLE "oral_reading_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"learner_id" text NOT NULL,
	"program_slug" text NOT NULL,
	"unit_key" text NOT NULL,
	"activity_id" text NOT NULL,
	"mode" text NOT NULL,
	"result" text NOT NULL,
	"per_word" jsonb,
	"correct_count" integer,
	"total_words" integer,
	"wcpm" integer,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_completion_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oral_reading_verification" ADD CONSTRAINT "oral_reading_verification_learner_id_learner_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learner"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oral_reading_verification_learner_expiry_idx" ON "oral_reading_verification" USING btree ("learner_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "oral_reading_verification_learner_completion_uq" ON "oral_reading_verification" USING btree ("learner_id","consumed_completion_id");