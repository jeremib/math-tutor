import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudent } from "@/lib/auth";
import { TutorUnavailableError, tutorError } from "@/lib/ai";
import { judgeExplanation } from "@/lib/teachback";

const body = z.object({
  source: z.enum(["misconception", "homework"]),
  sourceId: z.string().min(1).max(100),
  answer: z.string().trim().min(3, "Say a bit more!").max(1500),
});

/** Judges a student's explain-it-back answer. */
export async function POST(req: Request) {
  const auth = await getStudent();
  if (!auth) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  if (!auth.student.aiEnabled) return NextResponse.json({ error: "The AI tutor is turned off." }, { status: 403 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
  const { source, sourceId, answer } = parsed.data;
  try {
    const result = await judgeExplanation(auth.student, auth.family.timezone, source, sourceId, answer);
    if (!result) return NextResponse.json({ error: "Math Buddy couldn't check that one. Try again." }, { status: 404 });
    return NextResponse.json({ verdict: result.explanation.verdict, feedback: result.explanation.feedback, rewards: result.rewards });
  } catch (error) {
    const e = tutorError(error);
    if (e instanceof TutorUnavailableError) return NextResponse.json({ error: e.message }, { status: 503 });
    throw error;
  }
}
