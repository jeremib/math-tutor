ALTER TABLE "textbooks" DROP COLUMN "practice_requested_at";--> statement-breakpoint
ALTER TABLE "textbooks" ADD COLUMN "writing_chapters" jsonb DEFAULT '{}'::jsonb NOT NULL;