CREATE TABLE "misconceptions" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"tag" text NOT NULL,
	"label" text NOT NULL,
	"times_seen" integer DEFAULT 1 NOT NULL,
	"practiced_correct" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "practice_problems" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"source" text NOT NULL,
	"misconception_id" text,
	"homework_session_id" text,
	"skill_id" text NOT NULL,
	"prompt" text NOT NULL,
	"answer" text NOT NULL,
	"answer_kind" text NOT NULL,
	"hint" text NOT NULL,
	"explanation" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "drill_problems" ADD COLUMN "source" text DEFAULT 'curriculum' NOT NULL;--> statement-breakpoint
ALTER TABLE "drill_problems" ADD COLUMN "misconception_id" text;--> statement-breakpoint
ALTER TABLE "drill_problems" ADD COLUMN "wrong_answers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "drill_problems" ADD COLUMN "work_image_path" text;--> statement-breakpoint
ALTER TABLE "drill_problems" ADD COLUMN "feedback" text;--> statement-breakpoint
ALTER TABLE "drill_problems" ADD COLUMN "feedback_status" text;--> statement-breakpoint
ALTER TABLE "homework_messages" ADD COLUMN "image_path" text;--> statement-breakpoint
ALTER TABLE "homework_messages" ADD COLUMN "image_type" text;--> statement-breakpoint
ALTER TABLE "homework_sessions" ADD COLUMN "skill_id" text;--> statement-breakpoint
ALTER TABLE "homework_sessions" ADD COLUMN "practice_added" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "misconceptions" ADD CONSTRAINT "misconceptions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_problems" ADD CONSTRAINT "practice_problems_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_problems" ADD CONSTRAINT "practice_problems_misconception_id_misconceptions_id_fk" FOREIGN KEY ("misconception_id") REFERENCES "public"."misconceptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_problems" ADD CONSTRAINT "practice_problems_homework_session_id_homework_sessions_id_fk" FOREIGN KEY ("homework_session_id") REFERENCES "public"."homework_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "misconceptions_open_tag" ON "misconceptions" USING btree ("student_id","tag") WHERE "misconceptions"."resolved_at" is null;--> statement-breakpoint
CREATE INDEX "practice_problems_student" ON "practice_problems" USING btree ("student_id","used_at");--> statement-breakpoint
ALTER TABLE "drill_problems" ADD CONSTRAINT "drill_problems_misconception_id_misconceptions_id_fk" FOREIGN KEY ("misconception_id") REFERENCES "public"."misconceptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drill_problems_work_image" ON "drill_problems" USING btree ("work_image_path");--> statement-breakpoint
CREATE INDEX "homework_messages_image" ON "homework_messages" USING btree ("image_path");