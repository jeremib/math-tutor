CREATE TABLE "lesson_guides" (
	"id" text PRIMARY KEY NOT NULL,
	"textbook_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"guide" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_guides" ADD CONSTRAINT "lesson_guides_textbook_id_textbooks_id_fk" FOREIGN KEY ("textbook_id") REFERENCES "public"."textbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_guides_skill" ON "lesson_guides" USING btree ("skill_id");