import { NextResponse, after } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { familyStudent, getParent, getStudent } from "@/lib/auth";
import { localDate } from "@/lib/progress";
import { buildTestPrep } from "@/lib/testprep";
import { saveImageField } from "@/lib/tutor";

const MAX_DAYS_AHEAD = 60;

const fields = z.object({
  title: z.string().trim().max(80).optional(),
  quizDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the quiz date."),
  notes: z.string().trim().max(2000).optional(),
  studentId: z.string().optional(),
});

/** Starts quiz prep from a study guide photo and/or notes. A student adds their own; a parent names the student. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const parsed = fields.safeParse({
    title: form.get("title") ?? undefined, quizDate: form.get("quizDate"), notes: form.get("notes") ?? undefined, studentId: form.get("studentId") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
  const data = parsed.data;

  const [asStudent, asParent] = await Promise.all([getStudent(), getParent()]);
  const parentsChild = asParent && data.studentId ? await familyStudent(asParent.family.id, data.studentId) : null;
  const student = parentsChild ?? asStudent?.student;
  const family = parentsChild ? asParent!.family : asStudent?.family;
  if (!student || !family) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  if (!student.aiEnabled) return NextResponse.json({ error: "The AI tutor is turned off." }, { status: 403 });

  const today = localDate(family.timezone);
  const days = (Date.parse(data.quizDate) - Date.parse(today)) / 86_400_000;
  if (!(days >= 0 && days <= MAX_DAYS_AHEAD)) return NextResponse.json({ error: `Pick a date in the next ${MAX_DAYS_AHEAD} days.` }, { status: 400 });

  const image = await saveImageField(form, "image");
  if (image && "error" in image) return NextResponse.json({ error: image.error }, { status: 400 });
  if (!image && !data.notes) return NextResponse.json({ error: "Add a photo of the study guide or type what the quiz covers." }, { status: 400 });

  const db = await getDb();
  const [prep] = await db.insert(schema.testPreps).values({
    studentId: student.id, title: data.title || "", quizDate: data.quizDate, notes: data.notes || null,
    imagePath: image?.imagePath ?? null, imageType: image?.imageType ?? null,
  }).returning();
  // Reading the guide and writing problems takes a little while, so it runs after the response.
  after(() => buildTestPrep(prep.id));
  return NextResponse.json({ id: prep.id });
}
