import { NextResponse } from "next/server";
import { getDb, schema } from "@/db";
import { getStudent } from "@/lib/auth";
import { saveImageField, tutorReply, TutorUnavailableError } from "@/lib/tutor";

/** Starts a homework session from a photo and/or typed problem, and returns the tutor's first message. */
export async function POST(req: Request) {
  const session = await getStudent();
  if (!session) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const { student, family } = session;
  if (!student.homeworkEnabled) return NextResponse.json({ error: "Homework help is turned off." }, { status: 403 });

  const form = await req.formData();
  const text = String(form.get("text") ?? "").trim().slice(0, 2000);
  const image = await saveImageField(form, "image");
  if (image && "error" in image) return NextResponse.json({ error: image.error }, { status: 400 });
  if (!text && !image) return NextResponse.json({ error: "Add a photo or type your problem." }, { status: 400 });
  const hasImage = !!image;
  const imagePath = image?.imagePath ?? null;
  const imageType = image?.imageType ?? null;

  const title = text ? text.split("\n")[0].slice(0, 80) : `Photo problem · ${new Date().toLocaleDateString()}`;
  const db = await getDb();
  const [hw] = await db.insert(schema.homeworkSessions).values({ studentId: student.id, title, problemText: text || null, imagePath, imageType }).returning();

  const opening = hasImage
    ? `Here's a photo of my homework problem.${text ? ` ${text}` : ""}`
    : `Here's my homework problem: ${text}`;
  try {
    await tutorReply(hw, student, family.timezone, opening);
  } catch (error) {
    if (error instanceof TutorUnavailableError) return NextResponse.json({ id: hw.id, warning: error.message });
    throw error;
  }
  return NextResponse.json({ id: hw.id });
}
