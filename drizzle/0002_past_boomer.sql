CREATE TABLE "attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"learner_id" text NOT NULL,
	"activity_id" text NOT NULL,
	"kind" text NOT NULL,
	"generated" boolean DEFAULT false NOT NULL,
	"score" jsonb NOT NULL,
	"response" jsonb,
	"day" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrollment" (
	"id" text PRIMARY KEY NOT NULL,
	"learner_id" text NOT NULL,
	"program_slug" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learner" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar" text,
	"birth_month" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_state" (
	"id" text PRIMARY KEY NOT NULL,
	"learner_id" text NOT NULL,
	"skill" text NOT NULL,
	"outcome" text DEFAULT 'not_yet' NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_learner_id_learner_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learner"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_learner_id_learner_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learner"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner" ADD CONSTRAINT "learner_account_id_user_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_state" ADD CONSTRAINT "skill_state_learner_id_learner_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learner"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempt_learner_created_idx" ON "attempt" USING btree ("learner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollment_learner_program_uq" ON "enrollment" USING btree ("learner_id","program_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_state_learner_skill_uq" ON "skill_state" USING btree ("learner_id","skill");