CREATE TABLE "interest" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"icon" text,
	"status" text DEFAULT 'published' NOT NULL,
	CONSTRAINT "interest_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "learner_interest" (
	"id" text PRIMARY KEY NOT NULL,
	"learner_id" text NOT NULL,
	"interest_id" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learner_quest" (
	"id" text PRIMARY KEY NOT NULL,
	"learner_id" text NOT NULL,
	"template_id" text NOT NULL,
	"program_slug" text NOT NULL,
	"assigned_on" date NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"target" jsonb NOT NULL,
	"progress" jsonb NOT NULL,
	"reward_stars" integer NOT NULL,
	"status" text DEFAULT 'offered' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learner_sticker" (
	"id" text PRIMARY KEY NOT NULL,
	"learner_id" text NOT NULL,
	"sticker_id" text NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quest_template" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reward_stars" integer DEFAULT 3 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quest_template_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "star_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"learner_id" text NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"ref_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sticker" (
	"id" text PRIMARY KEY NOT NULL,
	"pack_id" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"art_ref" text NOT NULL,
	"star_cost" integer NOT NULL,
	"sort_key" text DEFAULT 'a' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sticker_pack" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"theme" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"sort_key" text DEFAULT 'a' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sticker_pack_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "unit" ADD COLUMN "branch_key" text;--> statement-breakpoint
ALTER TABLE "learner_interest" ADD CONSTRAINT "learner_interest_learner_id_learner_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learner"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_interest" ADD CONSTRAINT "learner_interest_interest_id_interest_id_fk" FOREIGN KEY ("interest_id") REFERENCES "public"."interest"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_quest" ADD CONSTRAINT "learner_quest_learner_id_learner_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learner"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_quest" ADD CONSTRAINT "learner_quest_template_id_quest_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."quest_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_sticker" ADD CONSTRAINT "learner_sticker_learner_id_learner_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learner"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_sticker" ADD CONSTRAINT "learner_sticker_sticker_id_sticker_id_fk" FOREIGN KEY ("sticker_id") REFERENCES "public"."sticker"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_ledger" ADD CONSTRAINT "star_ledger_learner_id_learner_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learner"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sticker" ADD CONSTRAINT "sticker_pack_id_sticker_pack_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."sticker_pack"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "learner_interest_uq" ON "learner_interest" USING btree ("learner_id","interest_id","source");--> statement-breakpoint
CREATE INDEX "learner_quest_learner_day_idx" ON "learner_quest" USING btree ("learner_id","assigned_on");--> statement-breakpoint
CREATE UNIQUE INDEX "learner_quest_day_template_uq" ON "learner_quest" USING btree ("learner_id","program_slug","assigned_on","template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "learner_sticker_uq" ON "learner_sticker" USING btree ("learner_id","sticker_id");--> statement-breakpoint
CREATE INDEX "star_ledger_learner_created_idx" ON "star_ledger" USING btree ("learner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sticker_pack_slug_uq" ON "sticker" USING btree ("pack_id","slug");