import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { getStudent } from "@/lib/auth";
import { IMAGE_TYPES, saveUpload, tutorReply, TutorUnavailableError, type ImageType } from "@/lib/tutor";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Starts a homework session from a photo and/or typed problem, and returns the tutor's first message. */
export async function POST(req: Request) {
  const session = await getStudent();
  if (!session) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const { student } = session;
  if (!student.homeworkEnabled) return NextResponse.json({ error: "Homework help is turned off." }, { status: 403 });

  const form = await req.formData();
  const text = String(form.get("text") ?? "").trim().slice(0, 2000);
  const image = form.get("image");
  const hasImage = image instanceof File && image.size > 0;
  if (!text && !hasImage) return NextResponse.json({ error: "Add a photo or type your problem." }, { status: 400 });

  let imagePath: string | null = null;
  let imageType: ImageType | null = null;
  if (hasImage) {
    if (!IMAGE_TYPES.includes(image.type as ImageType)) return NextResponse.json({ error: "Please use a JPG, PNG, GIF or WebP photo." }, { status: 400 });
    if (image.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "That photo is too big (max 5 MB)." }, { status: 400 });
    imageType = image.type as ImageType;
    imagePath = saveUpload(Buffer.from(await image.arrayBuffer()), imageType);
  }

  const title = text ? text.split("\n")[0].slice(0, 80) : `Photo problem · ${new Date().toLocaleDateString()}`;
  const hw = db.insert(schema.homeworkSessions).values({ studentId: student.id, title, problemText: text || null, imagePath, imageType }).returning().get();

  const opening = hasImage
    ? `Here's a photo of my homework problem.${text ? ` ${text}` : ""}`
    : `Here's my homework problem: ${text}`;
  try {
    await tutorReply(hw, student, opening);
  } catch (error) {
    if (error instanceof TutorUnavailableError) return NextResponse.json({ id: hw.id, warning: error.message });
    throw error;
  }
  return NextResponse.json({ id: hw.id });
}
