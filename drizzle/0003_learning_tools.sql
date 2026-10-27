CREATE TABLE "explanations" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"verdict" text NOT NULL,
	"feedback" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fact_races" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"op" text NOT NULL,
	"seed" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"attempted" integer DEFAULT 0 NOT NULL,
	"correct" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_preps" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"title" text NOT NULL,
	"quiz_date" text NOT NULL,
	"notes" text,
	"image_path" text,
	"image_type" text,
	"topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"week_start" text NOT NULL,
	"report" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "drill_problems" ADD COLUMN "visual" jsonb;--> statement-breakpoint
ALTER TABLE "drill_problems" ADD COLUMN "test_prep_id" text;--> statement-breakpoint
ALTER TABLE "misconceptions" ADD COLUMN "teach_back_question" text;--> statement-breakpoint
ALTER TABLE "parents" ADD COLUMN "weekly_email" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "practice_problems" ADD COLUMN "test_prep_id" text;--> statement-breakpoint
ALTER TABLE "student_skills" ADD COLUMN "review_interval_days" double precision DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "student_skills" ADD COLUMN "next_review_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "voice_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "explanations" ADD CONSTRAINT "explanations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_races" ADD CONSTRAINT "fact_races_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_preps" ADD CONSTRAINT "test_preps_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "explanations_source" ON "explanations" USING btree ("student_id","source","source_id");--> statement-breakpoint
CREATE INDEX "fact_races_student" ON "fact_races" USING btree ("student_id","op");--> statement-breakpoint
CREATE INDEX "test_preps_student" ON "test_preps" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "test_preps_image" ON "test_preps" USING btree ("image_path");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_reports_family_week" ON "weekly_reports" USING btree ("family_id","week_start");--> statement-breakpoint
ALTER TABLE "drill_problems" ADD CONSTRAINT "drill_problems_test_prep_id_test_preps_id_fk" FOREIGN KEY ("test_prep_id") REFERENCES "public"."test_preps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_problems" ADD CONSTRAINT "practice_problems_test_prep_id_test_preps_id_fk" FOREIGN KEY ("test_prep_id") REFERENCES "public"."test_preps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Young students start with voice on.
UPDATE "students" SET "voice_enabled" = true WHERE "grade" <= 2;
