CREATE TABLE "textbooks" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"title" text NOT NULL,
	"publisher" text,
	"grade" integer,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source" text,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"chapters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_chapter" integer,
	"practice_chapters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "practice_problems" ADD COLUMN "textbook_id" text;--> statement-breakpoint
ALTER TABLE "textbooks" ADD CONSTRAINT "textbooks_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "textbooks_student" ON "textbooks" USING btree ("student_id");--> statement-breakpoint
ALTER TABLE "practice_problems" ADD CONSTRAINT "practice_problems_textbook_id_textbooks_id_fk" FOREIGN KEY ("textbook_id") REFERENCES "public"."textbooks"("id") ON DELETE cascade ON UPDATE no action;