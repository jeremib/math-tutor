CREATE TABLE "photo_handoffs" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"image_path" text,
	"image_type" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "photo_handoffs" ADD CONSTRAINT "photo_handoffs_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "photo_handoff_student" ON "photo_handoffs" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "photo_handoff_image" ON "photo_handoffs" USING btree ("image_path");