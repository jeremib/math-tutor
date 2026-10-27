import { NextResponse, after } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import type { TextbookImage } from "@/db/schema";
import { familyStudent, getParent } from "@/lib/auth";
import { clearLessonProgress, lookUpTextbook, textbookFor } from "@/lib/textbook";
import { saveImageField, saveImageFields } from "@/lib/tutor";

const MAX_TOC_PHOTOS = 4;

const fields = z.object({
  studentId: z.string(),
  title: z.string().trim().max(160).optional(),
  publisher: z.string().trim().max(120).optional(),
});

/**
 * Sets a student's textbook from its title and/or cover, or adds table-of-contents photos
 * to the one they have, then looks up its chapters in the background.
 */
export async function POST(req: Request) {
  const parent = await getParent();
  if (!parent) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const { family } = parent;
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const parsed = fields.safeParse({
    studentId: form.get("studentId"), title: form.get("title") ?? undefined, publisher: form.get("publisher") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
  const data = parsed.data;
  const student = await familyStudent(family.id, data.studentId);
  if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });
  if (!student.aiEnabled) return NextResponse.json({ error: "Turn on the AI tutor to set up a textbook." }, { status: 403 });

  const cover = await saveImageField(form, "cover");
  if (cover && "error" in cover) return NextResponse.json({ error: cover.error }, { status: 400 });
  const toc = await saveImageFields(form, "toc", MAX_TOC_PHOTOS);
  if ("error" in toc) return NextResponse.json({ error: toc.error }, { status: 400 });

  const existing = await textbookFor(student.id);
  const title = data.title || existing?.title || "";
  if (!title && !cover && !toc.length) {
    return NextResponse.json({ error: "Type the book's title or add a photo of its cover." }, { status: 400 });
  }
  // New photos replace the old ones of the same kind.
  const images: TextbookImage[] = [
    ...(cover ? [{ path: cover.imagePath, type: cover.imageType, kind: "cover" as const }] : existing?.images.filter((i) => i.kind === "cover") ?? []),
    ...(toc.length ? toc.map((t) => ({ path: t.imagePath, type: t.imageType, kind: "toc" as const })) : existing?.images.filter((i) => i.kind === "toc") ?? []),
  ];
  const values = {
    title, publisher: data.publisher || existing?.publisher || null, images,
    status: "pending" as const, chapters: [], currentChapter: null, writingChapters: {}, note: null, source: null, sources: [],
  };

  const db = await getDb();
  // A new chapter list makes the old list's unused problems meaningless.
  if (existing) {
    await db.delete(schema.practiceProblems)
      .where(and(eq(schema.practiceProblems.textbookId, existing.id), isNull(schema.practiceProblems.usedAt)));
    await clearLessonProgress(existing.id, student.id);
  }
  const [book] = await db.insert(schema.textbooks).values({ studentId: student.id, ...values })
    .onConflictDoUpdate({ target: schema.textbooks.studentId, set: values }).returning();
  // Searching the web or reading the photos takes a little while, so it runs after the response.
  after(() => lookUpTextbook(book.id));
  return NextResponse.json({ id: book.id });
}
