import { NextResponse, after } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getStudent } from "@/lib/auth";
import { queueHomeworkPractice } from "@/lib/coach";
import { saveImageField, sessionMessages, tutorReply, TutorUnavailableError } from "@/lib/tutor";

const MAX_MESSAGES = 80;

/** Sends the student's message, and optionally a drawing of their work, as form data. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getStudent();
  if (!auth) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  if (!auth.student.homeworkEnabled) return NextResponse.json({ error: "Homework help is turned off." }, { status: 403 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const typed = String(form.get("text") ?? "").trim().slice(0, 1000);
  const hasWork = form.get("work") instanceof File;
  if (!typed && !hasWork) return NextResponse.json({ error: "Type a message first." }, { status: 400 });

  const db = await getDb();
  const [session] = await db.select().from(schema.homeworkSessions)
    .where(and(eq(schema.homeworkSessions.id, (await params).id), eq(schema.homeworkSessions.studentId, auth.student.id)));
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if ((await sessionMessages(session.id)).length >= MAX_MESSAGES) {
    return NextResponse.json({ error: "This conversation is getting long. Start a new one for the next problem!" }, { status: 400 });
  }

  const work = await saveImageField(form, "work");
  if (work && "error" in work) return NextResponse.json({ error: work.error }, { status: 400 });
  const text = typed || "Here's my work so far.";

  try {
    const { reply, solved, newlySolved, rewards } = await tutorReply(session, auth.student, auth.family.timezone, text, work ?? undefined);
    // Writing practice problems takes a few seconds, so it happens after the reply is sent.
    if (newlySolved) after(() => queueHomeworkPractice(session.id));
    return NextResponse.json({ reply, solved, rewards });
  } catch (error) {
    if (error instanceof TutorUnavailableError) return NextResponse.json({ error: error.message }, { status: 503 });
    throw error;
  }
}
