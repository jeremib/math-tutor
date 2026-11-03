import { NextResponse } from "next/server";
import { getStudent } from "@/lib/auth";
import { attachHandoffPhoto, liveHandoff, studentHandoff } from "@/lib/handoff";
import { tooManyAttempts } from "@/lib/rate-limit";
import { saveImageField } from "@/lib/tutor";

/** The computer checks whether the phone has sent a photo yet. */
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await getStudent();
  if (!session) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const row = await studentHandoff(token, session.student.id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    imageUrl: row.imagePath ? `/api/uploads/${row.imagePath}` : null,
    expired: row.expiresAt.getTime() < Date.now(),
  });
}

/** The phone sends its photo. It isn't logged in: the link's token is what allows it. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (tooManyAttempts(`handoff:${token}`, 10)) return NextResponse.json({ error: "Too many photos. Start again from your computer." }, { status: 429 });
  const row = await liveHandoff(token);
  if (!row) return NextResponse.json({ error: "This link has expired. Make a new one on your computer." }, { status: 404 });
  const image = await saveImageField(await req.formData(), "image");
  if (!image) return NextResponse.json({ error: "Take a photo first." }, { status: 400 });
  if ("error" in image) return NextResponse.json({ error: image.error }, { status: 400 });
  await attachHandoffPhoto(token, image);
  return NextResponse.json({ ok: true });
}
