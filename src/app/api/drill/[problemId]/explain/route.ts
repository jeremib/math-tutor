import { NextResponse } from "next/server";
import { getStudent } from "@/lib/auth";
import { diagnoseMiss, workImage } from "@/lib/coach";
import { saveImageField } from "@/lib/tutor";

/** Asks Claude why the student missed a drill problem, optionally with a drawing of their work. */
export async function POST(req: Request, { params }: { params: Promise<{ problemId: string }> }) {
  const session = await getStudent();
  if (!session) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  if (!session.student.aiEnabled) return NextResponse.json({ status: "none", feedback: null });

  const form = await req.formData().catch(() => new FormData());
  const work = await saveImageField(form, "work");
  if (work && "error" in work) return NextResponse.json({ error: work.error }, { status: 400 });

  const { student } = session;
  const result = await diagnoseMiss(student.id, student.grade, (await params).problemId, work ? workImage(work.imagePath, work.imageType) : undefined);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(result);
}
