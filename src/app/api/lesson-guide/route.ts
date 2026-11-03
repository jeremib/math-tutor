import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudent } from "@/lib/auth";
import { tutorError } from "@/lib/ai";
import { bookLesson, guideFor, savedGuide } from "@/lib/lesson-guide";
import { tooManyAttempts } from "@/lib/rate-limit";

const body = z.object({ chapter: z.number().int().min(0), lesson: z.number().int().min(0) });

/** New guides a student can have written per hour; saved ones are free to reread. */
const GUIDES_PER_HOUR = 20;

/** Writes the mini-lesson for a lesson in the student's textbook, if it isn't written yet. */
export async function POST(req: Request) {
  const session = await getStudent();
  if (!session) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const { student } = session;
  if (!student.aiEnabled) return NextResponse.json({ error: "Ask a grown-up to turn on the AI tutor." }, { status: 403 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const lesson = await bookLesson(student.id, parsed.data.chapter, parsed.data.lesson);
  if (!lesson) return NextResponse.json({ error: "Lesson not found." }, { status: 404 });
  if (await savedGuide(lesson.skillId)) return NextResponse.json({ ok: true });
  if (tooManyAttempts(`lesson-guide:${student.id}`, GUIDES_PER_HOUR, 60 * 60_000)) {
    return NextResponse.json({ error: "That's a lot of new lessons for one hour! Try again a little later." }, { status: 429 });
  }
  try {
    const guide = await guideFor(student, lesson);
    if (!guide) return NextResponse.json({ error: "The tutor couldn't write this lesson. Please try again." }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: tutorError(error).message }, { status: 503 });
  }
}
