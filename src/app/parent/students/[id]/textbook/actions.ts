"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { familyStudent, requireParent } from "@/lib/auth";
import { SKILLS_BY_ID } from "@/lib/curriculum";
import { buildChapterPractice, textbookFor } from "@/lib/textbook";
import { MAX_CHAPTER_SKILLS, chapterFocus, needsChapterPractice } from "@/lib/textbook-plan";

async function familyTextbook(form: FormData) {
  const { family } = await requireParent();
  const student = await familyStudent(family.id, String(form.get("studentId")));
  const book = student ? await textbookFor(student.id) : null;
  return student && book?.status === "ready" ? { student, book } : null;
}

const refresh = (studentId: string) => {
  revalidatePath(`/parent/students/${studentId}/textbook`);
  revalidatePath(`/parent/students/${studentId}`);
};

/** Points drills at a chapter: its skills become the focus, and Claude writes problems for what they don't cover. */
export async function startChapter(form: FormData) {
  const found = await familyTextbook(form);
  const index = Number(form.get("chapter"));
  const chapter = found?.book.chapters[index];
  if (!found || !chapter) return;
  const { student, book } = found;
  const db = await getDb();
  const writePractice = student.aiEnabled && needsChapterPractice(chapter) && !book.practiceChapters.includes(index);
  await db.transaction(async (tx) => {
    await tx.update(schema.textbooks).set({
      currentChapter: index,
      ...(writePractice ? { practiceChapters: [...book.practiceChapters, index] } : {}),
    }).where(eq(schema.textbooks.id, book.id));
    await tx.update(schema.students).set({ focusSkills: chapterFocus(chapter) }).where(eq(schema.students.id, student.id));
  });
  if (writePractice) after(() => buildChapterPractice(book.id, index));
  refresh(student.id);
}

/** Lets a parent fix which skills practice a chapter. */
export async function setChapterSkills(form: FormData) {
  const found = await familyTextbook(form);
  const index = Number(form.get("chapter"));
  if (!found || !found.book.chapters[index]) return;
  const { student, book } = found;
  const skillIds = [...new Set(form.getAll("skill").map(String))].filter((id) => SKILLS_BY_ID.has(id)).slice(0, MAX_CHAPTER_SKILLS);
  const chapters = book.chapters.map((c, i) => (i === index ? {
    ...c, skillIds,
    // The parent is choosing; keep Claude's coverage call unless that leaves nothing or adds the first skill.
    coverage: !skillIds.length ? "none" as const : c.coverage === "none" ? "partial" as const : c.coverage,
  } : c));
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.update(schema.textbooks).set({ chapters }).where(eq(schema.textbooks.id, book.id));
    if (book.currentChapter === index) {
      await tx.update(schema.students).set({ focusSkills: chapterFocus(chapters[index]) }).where(eq(schema.students.id, student.id));
    }
  });
  refresh(student.id);
}

/** Removes the textbook and its unused practice problems. Focus skills stay until changed. */
export async function removeTextbook(form: FormData) {
  const { family } = await requireParent();
  const student = await familyStudent(family.id, String(form.get("studentId")));
  if (!student) return;
  await (await getDb()).delete(schema.textbooks).where(eq(schema.textbooks.studentId, student.id));
  refresh(student.id);
}
