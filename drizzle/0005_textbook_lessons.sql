ALTER TABLE "textbooks" DROP COLUMN "practice_chapters";--> statement-breakpoint
ALTER TABLE "textbooks" ADD COLUMN "practice_requested_at" timestamp with time zone;