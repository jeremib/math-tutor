import { NextResponse } from "next/server";
import { getStudent } from "@/lib/auth";
import { tutorError } from "@/lib/ai";
import { explainHint } from "@/lib/hint-why";

/** Has Claude explain why a drill problem's hint works, after the student asked for the hint. */
export async function POST(_req: Request, { params }: { params: Promise<{ problemId: string }> }) {
  const session = await getStudent();
  if (!session) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const { student } = session;
  if (!student.aiEnabled) return NextResponse.json({ why: null });
  try {
    const why = await explainHint(student.id, student.grade, (await params).problemId);
    if (why === undefined) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ why });
  } catch (error) {
    return NextResponse.json({ error: tutorError(error).message }, { status: 503 });
  }
}
