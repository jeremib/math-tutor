CREATE TABLE "chapter_test_problems" (
	"id" text PRIMARY KEY NOT NULL,
	"test_id" text NOT NULL,
	"position" integer NOT NULL,
	"concept" integer NOT NULL,
	"prompt" text NOT NULL,
	"answer" text NOT NULL,
	"answer_kind" text NOT NULL,
	"hint" text NOT NULL,
	"explanation" text NOT NULL,
	"tries" integer DEFAULT 0 NOT NULL,
	"used_hint" boolean DEFAULT false NOT NULL,
	"last_answer" text,
	"wrong_answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"solved" boolean,
	"first_try_correct" boolean,
	"answered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chapter_tests" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"textbook_id" text NOT NULL,
	"title" text NOT NULL,
	"lessons" jsonb NOT NULL,
	"concepts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "chapter_test_problems" ADD CONSTRAINT "chapter_test_problems_test_id_chapter_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."chapter_tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_tests" ADD CONSTRAINT "chapter_tests_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_tests" ADD CONSTRAINT "chapter_tests_textbook_id_textbooks_id_fk" FOREIGN KEY ("textbook_id") REFERENCES "public"."textbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chapter_test_problems_test" ON "chapter_test_problems" USING btree ("test_id");--> statement-breakpoint
CREATE INDEX "chapter_tests_student" ON "chapter_tests" USING btree ("student_id");