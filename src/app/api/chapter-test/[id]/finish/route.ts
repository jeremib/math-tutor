import { NextResponse } from "next/server";
import { getStudent } from "@/lib/auth";
import { finishChapterTest } from "@/lib/chapter-test";

/** Scores a finished test prep and writes the readiness report. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStudent();
  if (!session) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const done = await finishChapterTest(session.student, session.family.timezone, (await params).id);
  if (!done) return NextResponse.json({ error: "Finish every problem first." }, { status: 400 });
  return NextResponse.json(done);
}
