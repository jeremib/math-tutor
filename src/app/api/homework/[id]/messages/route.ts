import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getStudent } from "@/lib/auth";
import { sessionMessages, tutorReply, TutorUnavailableError } from "@/lib/tutor";

const MAX_MESSAGES = 80;
const body = z.object({ text: z.string().trim().min(1).max(1000) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getStudent();
  if (!auth) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  if (!auth.student.homeworkEnabled) return NextResponse.json({ error: "Homework help is turned off." }, { status: 403 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Type a message first." }, { status: 400 });

  const session = db.select().from(schema.homeworkSessions)
    .where(and(eq(schema.homeworkSessions.id, (await params).id), eq(schema.homeworkSessions.studentId, auth.student.id))).get();
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (sessionMessages(session.id).length >= MAX_MESSAGES) {
    return NextResponse.json({ error: "This conversation is getting long. Start a new one for the next problem!" }, { status: 400 });
  }

  try {
    const { reply, solved } = await tutorReply(session, auth.student, parsed.data.text);
    return NextResponse.json({ reply, solved });
  } catch (error) {
    if (error instanceof TutorUnavailableError) return NextResponse.json({ error: error.message }, { status: 503 });
    throw error;
  }
}
