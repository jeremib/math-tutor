import { NextResponse } from "next/server";
import { getStudent } from "@/lib/auth";
import { createHandoff, publicOrigin } from "@/lib/handoff";

/** Starts a link the student opens on their phone to take a homework photo for this computer. */
export async function POST(req: Request) {
  const session = await getStudent();
  if (!session) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  if (!session.student.aiEnabled) return NextResponse.json({ error: "The AI tutor is turned off." }, { status: 403 });
  const { token, url, qr, expiresAt } = await createHandoff(session.student.id, publicOrigin(req));
  return NextResponse.json({ token, url, qr, expiresAt: expiresAt.toISOString() });
}
