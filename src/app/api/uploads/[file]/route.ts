import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getParent, getStudent } from "@/lib/auth";
import { readUpload } from "@/lib/tutor";

/** Serves a homework photo to the student who uploaded it or a parent in their family. */
export async function GET(_: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const row = db.select({ session: schema.homeworkSessions, familyId: schema.students.familyId })
    .from(schema.homeworkSessions).innerJoin(schema.students, eq(schema.students.id, schema.homeworkSessions.studentId))
    .where(eq(schema.homeworkSessions.imagePath, file)).get();
  if (!row) return new NextResponse("Not found", { status: 404 });

  const [parent, student] = await Promise.all([getParent(), getStudent()]);
  const allowed = parent?.family.id === row.familyId || student?.student.id === row.session.studentId;
  if (!allowed) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(readUpload(file)), {
    headers: { "Content-Type": row.session.imageType ?? "application/octet-stream", "Cache-Control": "private, max-age=3600" },
  });
}
