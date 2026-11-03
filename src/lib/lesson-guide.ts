import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import type { LessonGuide } from "@/db/schema";
import { GRADE_LABELS } from "./curriculum";
import { askStructured } from "./ai";
import { textbookFor } from "./textbook";
import { chapterLessons, cleanGuide, lessonSkillId } from "./textbook-plan";
import { VISUAL_KINDS } from "./visuals";

type Student = typeof schema.students.$inferSelect;

/** A lesson in the student's textbook, by chapter and lesson index, or null if there's no such lesson. */
export async function bookLesson(studentId: string, chapterIndex: number, lessonIndex: number) {
  const book = await textbookFor(studentId);
  const chapter = book?.status === "ready" ? book.chapters[chapterIndex] : undefined;
  if (!book || !chapter) return null;
  const lessons = chapterLessons(chapter);
  const title = lessons[lessonIndex];
  if (title === undefined) return null;
  return { book, chapter, chapterIndex, lessonIndex, lessons, title, skillId: lessonSkillId(book.id, chapterIndex, lessonIndex) };
}

export type BookLesson = NonNullable<Awaited<ReturnType<typeof bookLesson>>>;

export async function savedGuide(skillId: string): Promise<LessonGuide | null> {
  const [row] = await (await getDb()).select().from(schema.lessonGuides).where(eq(schema.lessonGuides.skillId, skillId));
  return row?.guide ?? null;
}

const GuideSchema = z.object({
  bigIdea: z.string().describe("The lesson's main idea in one or two short sentences, spoken to the student."),
  sections: z.array(z.object({
    heading: z.string().describe("A short, friendly heading."),
    body: z.string().describe("A few short sentences or a short list that teaches one piece of the idea. May include one [[VISUAL {json}]] line."),
  })).describe("2 to 4 short sections that teach the lesson step by step, from what the student already knows to the new idea."),
  examples: z.array(z.object({
    problem: z.string().describe("A worked example like the ones in this lesson."),
    steps: z.array(z.string()).describe("Each step of the solution, one short sentence each, saying what to do and why."),
    answer: z.string().describe("The final answer."),
  })).describe("2 worked examples, the second a little harder than the first."),
  watchOut: z.array(z.string()).describe("1 to 3 common mistakes to watch out for, each one short sentence."),
  check: z.array(z.object({
    question: z.string().describe("A quick question that checks the student understood the lesson."),
    choices: z.array(z.string()).describe("3 or 4 answer choices. Wrong choices should be mistakes students really make."),
    answer: z.number().int().describe("The index (from 0) of the correct choice."),
    why: z.string().describe("One or two sentences explaining why the correct choice is right."),
  })).describe("3 quick-check questions, easiest first."),
  videoSearch: z.string().describe("A few words to search Khan Academy for a video on this lesson's idea, like \"adding fractions with unlike denominators\"."),
});

/** Asks Claude to write a mini-lesson for one textbook lesson, at the student's grade. */
async function writeGuide(student: Student, lesson: BookLesson): Promise<LessonGuide | null> {
  const grade = GRADE_LABELS[lesson.book.grade ?? student.grade] ?? GRADE_LABELS[student.grade] ?? "";
  const before = lesson.lessons.slice(Math.max(0, lesson.lessonIndex - 2), lesson.lessonIndex);
  const after = lesson.lessons.slice(lesson.lessonIndex + 1, lesson.lessonIndex + 2);
  const raw = await askStructured({
    effort: "medium",
    schema: GuideSchema,
    system: `You write short, clear mini-lessons for a ${grade} student, ${student.name}, to read before practicing a lesson from their school math textbook.

Teach the lesson's idea the way a great teacher would at the board: start from something the student already knows, introduce the new idea with a simple example, then build up. Match what this lesson in this book covers and its usual methods and vocabulary, at this grade. Don't teach later lessons' material.

Write for a ${grade} reader: short sentences, everyday words, friendly and encouraging, speaking to the student as "you". Write math in plain text (like 3/4, 2 × 5, x^2, √9), never LaTeX. Every number in the examples and check questions must be correct; work each one out before writing it.

You can draw a picture model inside a section body. Put it on its own line as [[VISUAL {json}]], using one of these:
${VISUAL_KINDS}
Use a picture only where it helps the student see the idea, and at most one per section. Skip pictures for ideas these can't show.`,
    content: [{ type: "text", text: [
      `Textbook: ${lesson.book.title}${lesson.book.publisher ? ` (${lesson.book.publisher})` : ""}`,
      `Chapter: ${lesson.chapter.title}`,
      before.length ? `Earlier lessons: ${before.join("; ")}` : "",
      `Write the mini-lesson for: ${lesson.title}`,
      after.length ? `Next lesson (don't teach this yet): ${after.join("; ")}` : "",
    ].filter(Boolean).join("\n") }],
  });
  return raw ? cleanGuide(raw) : null;
}

/** Guides being written in this process, so two visits don't both ask Claude. */
const writing = new Map<string, Promise<LessonGuide | null>>();

/** The lesson's saved guide, writing and saving it first if there isn't one yet. */
export async function guideFor(student: Student, lesson: BookLesson): Promise<LessonGuide | null> {
  const saved = await savedGuide(lesson.skillId);
  if (saved) return saved;
  let pending = writing.get(lesson.skillId);
  if (!pending) {
    pending = (async () => {
      const guide = await writeGuide(student, lesson);
      if (guide && guide.sections.length) {
        await (await getDb()).insert(schema.lessonGuides).values({ textbookId: lesson.book.id, skillId: lesson.skillId, guide })
          .onConflictDoNothing();
      }
      return guide;
    })().finally(() => writing.delete(lesson.skillId));
    writing.set(lesson.skillId, pending);
  }
  return pending;
}

/** Deletes a book's lesson guides, for when its chapter list is replaced (guides are keyed by lesson position). */
export async function clearLessonGuides(textbookId: string) {
  await (await getDb()).delete(schema.lessonGuides).where(eq(schema.lessonGuides.textbookId, textbookId));
}
