CREATE TABLE "rewards" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"title" text NOT NULL,
	"xp_target" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"given_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "student_badges" (
	"student_id" text NOT NULL,
	"badge_id" text NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_badges_student_id_badge_id_pk" PRIMARY KEY("student_id","badge_id")
);
--> statement-breakpoint
CREATE TABLE "xp_events" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"kind" text NOT NULL,
	"amount" integer NOT NULL,
	"ref_key" text NOT NULL,
	"date" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "weekly_goal" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_badges" ADD CONSTRAINT "student_badges_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_events" ADD CONSTRAINT "xp_events_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rewards_student" ON "rewards" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "xp_events_student_ref" ON "xp_events" USING btree ("student_id","ref_key");--> statement-breakpoint
CREATE INDEX "xp_events_student_date" ON "xp_events" USING btree ("student_id","date");