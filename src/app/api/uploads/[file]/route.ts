import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getParent, getStudent } from "@/lib/auth";
import { readUpload } from "@/lib/tutor";

/** Finds the student an uploaded file belongs to: a homework photo, a work drawing, a study guide or a textbook photo. */
async function owner(file: string): Promise<{ studentId: string; familyId: string; type: string } | null> {
  const db = await getDb();
  const s = schema;
  const [session] = await db.select({ studentId: s.students.id, familyId: s.students.familyId, type: s.homeworkSessions.imageType })
    .from(s.homeworkSessions).innerJoin(s.students, eq(s.students.id, s.homeworkSessions.studentId))
    .where(eq(s.homeworkSessions.imagePath, file));
  if (session) return { ...session, type: session.type ?? "application/octet-stream" };
  const [message] = await db.select({ studentId: s.students.id, familyId: s.students.familyId, type: s.homeworkMessages.imageType })
    .from(s.homeworkMessages)
    .innerJoin(s.homeworkSessions, eq(s.homeworkSessions.id, s.homeworkMessages.sessionId))
    .innerJoin(s.students, eq(s.students.id, s.homeworkSessions.studentId))
    .where(eq(s.homeworkMessages.imagePath, file));
  if (message) return { ...message, type: message.type ?? "application/octet-stream" };
  const [drill] = await db.select({ studentId: s.students.id, familyId: s.students.familyId })
    .from(s.drillProblems)
    .innerJoin(s.drills, eq(s.drills.id, s.drillProblems.drillId))
    .innerJoin(s.students, eq(s.students.id, s.drills.studentId))
    .where(eq(s.drillProblems.workImagePath, file));
  // Saved names end in the image subtype, e.g. ".png".
  if (drill) return { ...drill, type: `image/${file.split(".").pop()}` };
  const [prep] = await db.select({ studentId: s.students.id, familyId: s.students.familyId, type: s.testPreps.imageType })
    .from(s.testPreps).innerJoin(s.students, eq(s.students.id, s.testPreps.studentId))
    .where(eq(s.testPreps.imagePath, file));
  if (prep) return { ...prep, type: prep.type ?? "application/octet-stream" };
  const [book] = await db.select({ studentId: s.students.id, familyId: s.students.familyId, images: s.textbooks.images })
    .from(s.textbooks).innerJoin(s.students, eq(s.students.id, s.textbooks.studentId))
    .where(sql`${s.textbooks.images} @> ${JSON.stringify([{ path: file }])}::jsonb`);
  const image = book?.images.find((i) => i.path === file);
  if (book && image) return { studentId: book.studentId, familyId: book.familyId, type: image.type };
  return null;
}

/** Serves an uploaded image to the student it belongs to or a parent in their family. */
export async function GET(_: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const row = await owner(file);
  if (!row) return new NextResponse("Not found", { status: 404 });

  const [parent, student] = await Promise.all([getParent(), getStudent()]);
  const allowed = parent?.family.id === row.familyId || student?.student.id === row.studentId;
  if (!allowed) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(readUpload(file)), {
    headers: { "Content-Type": row.type, "Cache-Control": "private, max-age=3600" },
  });
}
