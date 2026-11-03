import { NextResponse, after } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getStudent } from "@/lib/auth";
import { handoffPhoto } from "@/lib/handoff";
import { saveImageField, transcribeProblem, tutorReply, TutorUnavailableError, type ImageType } from "@/lib/tutor";

/** Starts a homework session from a photo and/or typed problem, and returns the tutor's first message. */
export async function POST(req: Request) {
  const session = await getStudent();
  if (!session) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const { student, family } = session;
  if (!student.aiEnabled) return NextResponse.json({ error: "The AI tutor is turned off." }, { status: 403 });

  const form = await req.formData();
  const text = String(form.get("text") ?? "").trim().slice(0, 2000);
  const db = await getDb();
  const photoFrom = String(form.get("photoFrom") ?? "");
  let image = await saveImageField(form, "image");
  if (image && "error" in image) return NextResponse.json({ error: image.error }, { status: 400 });
  const handoff = String(form.get("handoff") ?? "");
  if (!image && handoff) {
    // A photo taken on the student's phone for this computer.
    const sent = await handoffPhoto(handoff, student.id);
    if (!sent) return NextResponse.json({ error: "That phone photo isn't available anymore. Take a new one." }, { status: 400 });
    image = { imagePath: sent.imagePath!, imageType: sent.imageType as ImageType };
  }
  if (!image && photoFrom) {
    // Reuse the photo from an earlier session, e.g. a whole page with several problems.
    const [earlier] = await db.select({ imagePath: schema.homeworkSessions.imagePath, imageType: schema.homeworkSessions.imageType })
      .from(schema.homeworkSessions)
      .where(and(eq(schema.homeworkSessions.id, photoFrom), eq(schema.homeworkSessions.studentId, student.id), isNotNull(schema.homeworkSessions.imagePath)));
    if (!earlier) return NextResponse.json({ error: "That photo isn't available anymore. Take a new one." }, { status: 400 });
    image = { imagePath: earlier.imagePath!, imageType: earlier.imageType as ImageType };
  }
  if (!text && !image) return NextResponse.json({ error: "Add a photo or type your problem." }, { status: 400 });
  const hasImage = !!image;
  const imagePath = image?.imagePath ?? null;
  const imageType = image?.imageType ?? null;

  const title = text ? text.split("\n")[0].slice(0, 80) : `Photo problem · ${new Date().toLocaleDateString()}`;
  const [hw] = await db.insert(schema.homeworkSessions).values({ studentId: student.id, title, problemText: text || null, imagePath, imageType }).returning();

  if (hasImage) {
    after(async () => {
      try {
        await transcribeProblem(hw.id);
      } catch (error) {
        console.error("homework transcription failed", error);
      }
    });
  }

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
