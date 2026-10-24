CREATE TABLE "drill_problems" (
	"id" text PRIMARY KEY NOT NULL,
	"drill_id" text NOT NULL,
	"position" integer NOT NULL,
	"skill_id" text NOT NULL,
	"prompt" text NOT NULL,
	"answer" text NOT NULL,
	"answer_kind" text NOT NULL,
	"choices" jsonb,
	"hint" text NOT NULL,
	"explanation" text NOT NULL,
	"tries" integer DEFAULT 0 NOT NULL,
	"used_hint" boolean DEFAULT false NOT NULL,
	"last_answer" text,
	"first_try_correct" boolean,
	"solved" boolean,
	"answered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "drills" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"date" text NOT NULL,
	"total" integer NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "families" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "families_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "homework_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "homework_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"title" text NOT NULL,
	"problem_text" text,
	"image_path" text,
	"image_type" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parents" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parents_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_skills" (
	"student_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"mastery" double precision DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"correct" integer DEFAULT 0 NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"mastered_at" timestamp with time zone,
	"last_practiced_at" timestamp with time zone,
	CONSTRAINT "student_skills_student_id_skill_id_pk" PRIMARY KEY("student_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"name" text NOT NULL,
	"username" text NOT NULL,
	"pin_hash" text NOT NULL,
	"grade" integer NOT NULL,
	"avatar" text DEFAULT '🦊' NOT NULL,
	"daily_problems" integer DEFAULT 8 NOT NULL,
	"focus_skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"homework_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drill_problems" ADD CONSTRAINT "drill_problems_drill_id_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."drills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drills" ADD CONSTRAINT "drills_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_messages" ADD CONSTRAINT "homework_messages_session_id_homework_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."homework_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_sessions" ADD CONSTRAINT "homework_sessions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parents" ADD CONSTRAINT "parents_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_skills" ADD CONSTRAINT "student_skills_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drill_problems_drill" ON "drill_problems" USING btree ("drill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drills_student_date" ON "drills" USING btree ("student_id","date");--> statement-breakpoint
CREATE INDEX "homework_messages_session" ON "homework_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "homework_student" ON "homework_sessions" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "homework_image" ON "homework_sessions" USING btree ("image_path");--> statement-breakpoint
CREATE INDEX "parents_family" ON "parents" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "students_family_username" ON "students" USING btree ("family_id","username");