import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudent } from "@/lib/auth";
import { createChapterTest } from "@/lib/chapter-test";
import { tooManyAttempts } from "@/lib/rate-limit";

const body = z.object({ lessons: z.array(z.object({ chapter: z.number().int().min(0), lesson: z.number().int().min(0) })).min(1).max(200) });

/** New test preps a student can start per hour; each one has Claude write a set of problems. */
const PER_HOUR = 6;

/** Starts a test prep on the lessons the student picked. */
export async function POST(req: Request) {
  const session = await getStudent();
  if (!session) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const { student } = session;
  if (!student.aiEnabled) return NextResponse.json({ error: "Ask a grown-up to turn on the AI tutor." }, { status: 403 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick at least one lesson to practice." }, { status: 400 });
  if (tooManyAttempts(`chapter-test:${student.id}`, PER_HOUR, 60 * 60_000)) {
    return NextResponse.json({ error: "That's a lot of test preps for one hour! Finish one you've started, or try again later." }, { status: 429 });
  }
  const made = await createChapterTest(student, parsed.data.lessons);
  if ("error" in made) return NextResponse.json(made, { status: 400 });
  return NextResponse.json(made);
}
