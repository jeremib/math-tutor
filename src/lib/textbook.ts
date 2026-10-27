import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import type { TextbookImage } from "@/db/schema";
import { GRADE_LABELS, SKILLS } from "./curriculum";
import { askStructured, imageBlock, researchWeb } from "./ai";
import { PRACTICE_RULES, PracticeSchema, checkedPractice } from "./coach";
import { readUpload, type ImageType } from "./tutor";
import { MAX_CHAPTERS, MAX_CHAPTER_SKILLS, cleanChapters } from "./textbook-plan";

/** Skill id for textbook problems that don't match anything in the curriculum. */
export const TEXTBOOK_SKILL = "textbook";
const PER_CHAPTER = 5;

const SKILL_LIST = SKILLS.map((s) => `- ${s.id}: ${s.name} (${GRADE_LABELS[s.grade]})`).join("\n");

const BookSchema = z.object({
  found: z.boolean().describe("True only if you have this book's real chapter list, from the photos or a source you found for this exact book."),
  title: z.string().describe("The book's full title as published, including the grade or level if it has one."),
  publisher: z.string().describe("The publisher, or empty if unknown."),
  grade: z.number().int().describe("The grade the book is for: 0 for kindergarten, 1–8, or -1 if unknown."),
  chapters: z.array(z.object({
    title: z.string().describe("The chapter, unit or module title as the book prints it, with its number, like \"Chapter 4: Divide by 1-Digit Numbers\"."),
    lessons: z.array(z.string()).describe("The lesson titles in this chapter, in order. Empty if you don't have them."),
    skillIds: z.array(z.enum(SKILLS.map((s) => s.id) as [string, ...string[]])).describe(`Up to ${MAX_CHAPTER_SKILLS} curriculum skills that practice this chapter's math, most central first. Empty if none fit.`),
    coverage: z.enum(["full", "partial", "none"]).describe("How much of the chapter's math those skills cover. full: practicing them is practicing the chapter. partial: some lessons aren't covered. none: no skill fits."),
  })).describe(`The book's top-level chapters, units or modules, in order. At most ${MAX_CHAPTERS}. Empty if not found.`),
  sources: z.array(z.string()).describe("URLs of the pages the chapter list came from, from the research notes. Empty when it came from the photos."),
  note: z.string().describe("One or two plain sentences to the parent: what you found and anything to double-check, such as a different edition. If not found, what you tried."),
});

const MATCH_RULES = `Match each chapter to the skills in this curriculum that practice the same math:
${SKILL_LIST}

A chapter can match skills from other grades. Geometry, measurement, data and word-problem chapters often have no good match; that's fine, use coverage "none".`;

/** Searches the web for the book's chapter list. Returns Claude's notes, which may say it wasn't found. */
async function researchChapters(book: typeof schema.textbooks.$inferSelect, cover: TextbookImage[], grade: number) {
  return researchWeb({
    system: `You help a parent find the chapter list of their child's school math textbook. The child is in ${GRADE_LABELS[grade] ?? "elementary school"}.

Identify the exact book, then search for its table of contents, the publisher's scope and sequence, or a school's pacing guide for it. Only report a chapter list you actually found for this specific book and grade. Never reconstruct one from what books like it usually cover.

Write up what you found: the book's full title, publisher and grade, then every top-level chapter (or unit, module or topic, whatever the book calls them) in order with its lessons, then the URLs you used. If you couldn't find the real chapter list, say NOT FOUND and what you tried.`,
    maxSearches: 6,
    content: [
      ...cover.map((i) => imageBlock({ data: readUpload(i.path), type: i.type as ImageType })),
      { type: "text", text: [
        cover.length ? "The picture is the book's cover." : "",
        book.title ? `The parent says the book is: ${book.title}` : "",
        book.publisher ? `Publisher or series: ${book.publisher}` : "",
      ].filter(Boolean).join("\n") },
    ],
  });
}

/** Identifies a student's textbook and maps its chapters to curriculum skills, from the web or table-of-contents photos. */
export async function lookUpTextbook(textbookId: string) {
  const db = await getDb();
  const [book] = await db.select().from(schema.textbooks).where(eq(schema.textbooks.id, textbookId));
  if (!book || book.status !== "pending") return;
  const [student] = await db.select().from(schema.students).where(eq(schema.students.id, book.studentId));
  if (!student) return;

  const cover = book.images.filter((i) => i.kind === "cover");
  const toc = book.images.filter((i) => i.kind === "toc");
  const fromPhotos = toc.length > 0;
  try {
    // Photos are read directly; otherwise Claude searches first and the findings are structured after.
    const research = fromPhotos ? null : await researchChapters(book, cover, student.grade);
    const result = research === "" ? null : await askStructured({
      system: `You help a parent set up math practice that follows their child's school textbook. ${fromPhotos
        ? "Read the book's top-level chapters (or units, modules or topics) and their lessons from the table-of-contents photos, in order. If there is more than one photo, they are consecutive pages."
        : "Turn the research notes into the book's chapter list. Use only chapters the notes actually report; if they say it wasn't found, set found to false."}

${MATCH_RULES}`,
      schema: BookSchema,
      effort: "medium",
      content: fromPhotos ? [
        ...[...cover, ...toc].map((i) => imageBlock({ data: readUpload(i.path), type: i.type as ImageType })),
        { type: "text", text: [
          cover.length ? "The first picture is the book's cover; the rest are the table of contents." : "The pictures are the table of contents.",
          book.title ? `The parent says the book is: ${book.title}` : "",
          book.publisher ? `Publisher or series: ${book.publisher}` : "",
        ].filter(Boolean).join("\n") },
      ] : [{ type: "text", text: `Research notes:\n\n${research}` }],
    });
    const chapters = result?.found ? cleanChapters(result.chapters) : [];
    const grade = result && result.grade >= 0 && result.grade <= 8 ? result.grade : null;
    await db.update(schema.textbooks).set({
      status: chapters.length ? "ready" : fromPhotos ? "failed" : "needs_toc",
      title: result?.title.trim().slice(0, 160) || book.title,
      publisher: result?.publisher.trim().slice(0, 120) || book.publisher,
      grade: grade ?? book.grade,
      source: chapters.length ? (fromPhotos ? "photos" : "web") : null,
      sources: chapters.length && !fromPhotos ? (result?.sources ?? []).filter((u) => /^https?:\/\//.test(u)).slice(0, 5) : [],
      chapters,
      note: result?.note.trim().slice(0, 500) || null,
    }).where(eq(schema.textbooks.id, book.id));
  } catch (error) {
    console.error("textbook lookup failed", error);
    await db.update(schema.textbooks).set({
      // Web search may not be enabled for the API key; photos of the table of contents still work.
      status: fromPhotos ? "failed" : "needs_toc",
      note: null,
    }).where(eq(schema.textbooks.id, book.id));
  }
}

/** Writes checked practice problems for the parts of a chapter the curriculum's skills don't cover. */
export async function buildChapterPractice(textbookId: string, chapterIndex: number) {
  const db = await getDb();
  const [found] = await db.select({ book: schema.textbooks, student: schema.students })
    .from(schema.textbooks).innerJoin(schema.students, eq(schema.students.id, schema.textbooks.studentId))
    .where(eq(schema.textbooks.id, textbookId));
  const chapter = found?.book.chapters[chapterIndex];
  if (!found || !chapter || !found.student.aiEnabled) return;
  const { book, student } = found;

  try {
    const covered = chapter.skillIds.map((id) => SKILLS.find((s) => s.id === id)?.name).filter(Boolean);
    const result = await askStructured({
      system: `You write practice problems that follow a ${GRADE_LABELS[book.grade ?? student.grade] ?? ""} student's math textbook chapter.

${PRACTICE_RULES}
- match what the chapter's lessons teach, in the style a student would see in class.
- go easiest first.`,
      schema: z.object({ problems: z.array(PracticeSchema).describe(`${PER_CHAPTER + 2} practice problems.`) }),
      effort: "medium",
      content: [{ type: "text", text: [
        `Book: ${book.title}${book.publisher ? ` (${book.publisher})` : ""}`,
        `Chapter: ${chapter.title}`,
        chapter.lessons.length ? `Lessons:\n${chapter.lessons.map((l) => `- ${l}`).join("\n")}` : "",
        covered.length ? `The student already practices these separately, so focus on the chapter's other lessons: ${covered.join(", ")}` : "",
      ].filter(Boolean).join("\n\n") }],
    });
    const kept = (await checkedPractice(result?.problems ?? [])).slice(0, PER_CHAPTER);
    if (kept.length) {
      await db.insert(schema.practiceProblems).values(kept.map((p) => ({
        studentId: student.id, source: "textbook" as const, textbookId: book.id, skillId: TEXTBOOK_SKILL,
        prompt: p.prompt, answer: p.answer, answerKind: p.answerKind, hint: p.hint, explanation: p.explanation,
      })));
    }
  } catch (error) {
    console.error("textbook practice failed", error);
    // Let the parent try again by picking the chapter later.
    const [latest] = await db.select({ done: schema.textbooks.practiceChapters }).from(schema.textbooks).where(eq(schema.textbooks.id, textbookId));
    if (latest) {
      await db.update(schema.textbooks).set({ practiceChapters: latest.done.filter((i) => i !== chapterIndex) })
        .where(eq(schema.textbooks.id, textbookId));
    }
  }
}

export async function textbookFor(studentId: string) {
  const db = await getDb();
  const [book] = await db.select().from(schema.textbooks).where(eq(schema.textbooks.studentId, studentId));
  return book ?? null;
}
