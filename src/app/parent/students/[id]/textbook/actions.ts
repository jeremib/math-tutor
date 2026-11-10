"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { familyStudent, requireParent } from "@/lib/auth";
import { SKILLS_BY_ID } from "@/lib/curriculum";
import { resetUnstartedDrill } from "@/lib/learning";
import { clearLessonProgress, refillChapterPractice, startPlacingSkills, startWritingChapter, textbookFor } from "@/lib/textbook";
import { MAX_CHAPTER_SKILLS, chapterFocus, chapterLessons, needsChapterPractice } from "@/lib/textbook-plan";

async function familyTextbook(form: FormData) {
  const { family } = await requireParent();
  const student = await familyStudent(family.id, String(form.get("studentId")));
  const book = student ? await textbookFor(student.id) : null;
  return student && book?.status === "ready" ? { student, book, family } : null;
}

const refresh = (studentId: string) => {
  revalidatePath(`/parent/students/${studentId}/textbook`);
  revalidatePath(`/parent/students/${studentId}`);
  revalidatePath(`/parent/students/${studentId}/setup`);
};

/**
 * Points drills at a chapter, and optionally a lesson in it to skip ahead to: its skills become the focus,
 * and Claude writes problems for the lessons they don't cover.
 */
export async function startChapter(form: FormData) {
  const found = await familyTextbook(form);
  const index = Number(form.get("chapter"));
  const chapter = found?.book.chapters[index];
  if (!found || !chapter) return;
  const { student, book, family } = found;
  const lesson = Number(form.get("lesson") ?? 0);
  const currentLesson = Number.isInteger(lesson) && lesson > 0 && lesson < chapterLessons(chapter).length ? lesson : null;
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.update(schema.textbooks).set({ currentChapter: index, currentLesson }).where(eq(schema.textbooks.id, book.id));
    await tx.update(schema.students).set({ focusSkills: chapterFocus(chapter) }).where(eq(schema.students.id, student.id));
  });
  // Today's drill may have been built for another lesson; rebuild it if it hasn't been started.
  await resetUnstartedDrill(student.id, family.timezone);
  if (student.aiEnabled) startPlacingSkills({ ...book, currentChapter: index, currentLesson });
  await refillChapterPractice(student);
  refresh(student.id);
  // The setup wizard moves on to its next step.
  if (form.get("then") === "setup") redirect(`/parent/students/${student.id}/setup?step=plan`);
}

/** Lets a parent fix which skills practice a chapter. */
export async function setChapterSkills(form: FormData) {
  const found = await familyTextbook(form);
  const index = Number(form.get("chapter"));
  if (!found || !found.book.chapters[index]) return;
  const { student, book, family } = found;
  const skillIds = [...new Set(form.getAll("skill").map(String))].filter((id) => SKILLS_BY_ID.has(id)).slice(0, MAX_CHAPTER_SKILLS);
  const chapters = book.chapters.map((c, i) => (i === index ? {
    // Which lesson teaches each skill is worked out again for the new list.
    ...c, skillIds, skillLessons: undefined,
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
  if (book.currentChapter === index) {
    await resetUnstartedDrill(student.id, family.timezone);
    if (student.aiEnabled) startPlacingSkills({ ...book, chapters });
    await refillChapterPractice(student);
  }
  refresh(student.id);
}

/** Has Claude write practice problems for one chapter's lessons. */
export async function writeChapterProblems(form: FormData) {
  const found = await familyTextbook(form);
  const index = Number(form.get("chapter"));
  const chapter = found?.book.chapters[index];
  if (!found || !chapter || !found.student.aiEnabled || !needsChapterPractice(chapter)) return;
  await startWritingChapter(found.book.id, index);
  refresh(found.student.id);
}

/** Removes the textbook and its unused practice problems. Focus skills stay until changed. */
export async function removeTextbook(form: FormData) {
  const { family } = await requireParent();
  const student = await familyStudent(family.id, String(form.get("studentId")));
  if (!student) return;
  const book = await textbookFor(student.id);
  if (!book) return;
  await clearLessonProgress(book.id, student.id);
  await (await getDb()).delete(schema.textbooks).where(eq(schema.textbooks.id, book.id));
  refresh(student.id);
}
