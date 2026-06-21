CREATE TABLE "activity" (
	"id" text PRIMARY KEY NOT NULL,
	"lesson_id" text NOT NULL,
	"activity_key" text NOT NULL,
	"order_key" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"blurb" text,
	"est_minutes" integer,
	"band" text DEFAULT 'ready' NOT NULL,
	"skill_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"standard_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"config" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson" (
	"id" text PRIMARY KEY NOT NULL,
	"unit_id" text NOT NULL,
	"lesson_key" text NOT NULL,
	"order_key" text NOT NULL,
	"title" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"publisher_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_version_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "program_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "program_version" (
	"id" text PRIMARY KEY NOT NULL,
	"program_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"age_band" text,
	"summary" text,
	"world" text,
	"locale" text,
	"languages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publisher" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'builtin' NOT NULL,
	"owner_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"domain" text NOT NULL,
	"label" text NOT NULL,
	"ready_indicator" text NOT NULL,
	"stretch_indicator" text,
	CONSTRAINT "skill_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "unit" (
	"id" text PRIMARY KEY NOT NULL,
	"program_version_id" text NOT NULL,
	"unit_key" text NOT NULL,
	"order_key" text NOT NULL,
	"title" text NOT NULL,
	"emoji" text,
	"world" text DEFAULT 'sunshine' NOT NULL,
	"big_idea" text,
	"phonics_focus" text,
	"math_focus" text,
	"project" text,
	"checkpoint" text
);
--> statement-breakpoint
ALTER TABLE "enrollment" ADD COLUMN "program_version_id" text;--> statement-breakpoint
ALTER TABLE "enrollment" ADD COLUMN "config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "enrollment" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_lesson_id_lesson_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lesson"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program" ADD CONSTRAINT "program_publisher_id_publisher_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publisher"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_version" ADD CONSTRAINT "program_version_program_id_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."program"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publisher" ADD CONSTRAINT "publisher_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit" ADD CONSTRAINT "unit_program_version_id_program_version_id_fk" FOREIGN KEY ("program_version_id") REFERENCES "public"."program_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_lesson_key_uq" ON "activity" USING btree ("lesson_id","activity_key");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_unit_key_uq" ON "lesson" USING btree ("unit_id","lesson_key");--> statement-breakpoint
CREATE UNIQUE INDEX "program_version_program_version_uq" ON "program_version" USING btree ("program_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "unit_pv_key_uq" ON "unit" USING btree ("program_version_id","unit_key");--> statement-breakpoint
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_program_version_id_program_version_id_fk" FOREIGN KEY ("program_version_id") REFERENCES "public"."program_version"("id") ON DELETE set null ON UPDATE no action;