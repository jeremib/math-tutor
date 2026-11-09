import "server-only";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/db";
import type { ChapterTestConcept, ChapterTestResult } from "@/db/schema";
import { GRADE_LABELS } from "./curriculum";
import { askStructured } from "./ai";
import { checkAnswer } from "./answers";
import { PRACTICE_RULES, PracticeSchema, checkedPractice } from "./coach";
import { awardForTestPrep, type AwardSummary } from "./achievements";
import { MAX_TRIES } from "./learning";
import { textbookFor } from "./textbook";
import { chapterLessons } from "./textbook-plan";
import { MAX_CONCEPTS, PER_CONCEPT, READY_AT, cleanSelection, interleave, scoreTest, testTitle, type LessonRef } from "./chapter-test-plan";

type Student = typeof schema.students.$inferSelect;
type TestProblem = typeof schema.chapterTestProblems.$inferSelect;

/** Starts a test prep on the picked lessons of the student's textbook; the problems are written after the response. */
export async function createChapterTest(student: Student, picked: LessonRef[]) {
  const book = await textbookFor(student.id);
  if (!book || book.status !== "ready") return { error: "Your textbook isn't set up yet." };
  const lessons = cleanSelection(picked, book.chapters);
  if (!lessons.length) return { error: "Pick at least one lesson to practice." };
  const db = await getDb();
  const [test] = await db.insert(schema.chapterTests)
    .values({ studentId: student.id, textbookId: book.id, title: testTitle(lessons, book.chapters), lessons }).returning();
  after(() => buildChapterTest(test.id));
  return { id: test.id };
}

const TestSchema = z.object({
  concepts: z.array(z.object({
    name: z.string().describe("The idea in a few words, as a student would recognize it."),
    lesson: z.number().int().describe("The number of the listed lesson that teaches it."),
    keyIdea: z.string().describe("The one thing to remember about this idea, in one or two short sentences."),
    tips: z.array(z.string()).describe("2 or 3 short test tips for this idea: a common mistake to avoid, a way to check the answer, or a strategy."),
    problems: z.array(PracticeSchema).describe(`${PER_CONCEPT + 1} test-style problems on this idea, easiest first.`),
  })).describe(`The main ideas a test on these lessons would check, in lesson order. At most ${MAX_CONCEPTS}.`),
});

/** Has Claude pick the ideas to drill and write checked, test-style problems for each. */
export async function buildChapterTest(testId: string) {
  const db = await getDb();
  const [found] = await db.select({ test: schema.chapterTests, student: schema.students, book: schema.textbooks })
    .from(schema.chapterTests)
    .innerJoin(schema.students, eq(schema.students.id, schema.chapterTests.studentId))
    .innerJoin(schema.textbooks, eq(schema.textbooks.id, schema.chapterTests.textbookId))
    .where(eq(schema.chapterTests.id, testId));
  if (!found || found.test.status !== "pending") return;
  const { test, student, book } = found;
  const listed = test.lessons.map((l) => ({ ...l, chapterTitle: book.chapters[l.chapter]?.title ?? "", title: chapterLessons(book.chapters[l.chapter])[l.lesson] ?? "" }));
  const grade = GRADE_LABELS[book.grade ?? student.grade] ?? GRADE_LABELS[student.grade] ?? "";

  try {
    const result = await askStructured({
      effort: "medium",
      schema: TestSchema,
      system: `You help a ${grade} student, ${student.name}, get ready for a test on lessons from their school math textbook. Work out the main ideas a test on these lessons would check, then for each write the one thing to remember, a few test tips, and test-style practice problems like the ones in the book.

Cover every listed lesson with at least one idea, unless there are more lessons than ideas allowed; then group close lessons together. Keep each idea to what its lesson teaches, at this grade.

Write for a ${grade} reader: short sentences, plain words, encouraging. Write math in plain text like 3/4, 2 × 5, x^2, never LaTeX.

${PRACTICE_RULES}
- start easy and build to the kind of problem a test would end with.`,
      content: [{ type: "text", text: [
        `Textbook: ${book.title}${book.publisher ? ` (${book.publisher})` : ""}`,
        "Lessons on the test:",
        ...listed.map((l, i) => `${i + 1}. ${l.chapterTitle} — ${l.title}`),
      ].join("\n") }],
    });
    const raw = (result?.concepts ?? []).slice(0, MAX_CONCEPTS);
    const drafts = raw.flatMap((c, i) => c.problems.map((p) => ({ ...p, concept: i })));
    const checked = await checkedPractice(drafts);

    // Keep concepts with at least one checked problem, up to PER_CONCEPT each, easiest first.
    const concepts: ChapterTestConcept[] = [];
    const byConcept: (typeof checked)[] = [];
    raw.forEach((c, i) => {
      const problems = checked.filter((p) => p.concept === i).slice(0, PER_CONCEPT);
      if (!problems.length) return;
      const ref = listed[Math.min(Math.max(c.lesson - 1, 0), listed.length - 1)];
      concepts.push({
        name: c.name.trim().slice(0, 80), chapter: ref.chapter, lesson: ref.lesson,
        keyIdea: c.keyIdea.trim().slice(0, 400), tips: c.tips.map((t) => t.trim().slice(0, 300)).filter(Boolean).slice(0, 3),
      });
      byConcept.push(problems.map((p) => ({ ...p, concept: concepts.length - 1 })));
    });
    const ordered = interleave(byConcept);

    await db.transaction(async (tx) => {
      if (ordered.length) {
        await tx.insert(schema.chapterTestProblems).values(ordered.map((p, position) => ({
          testId, position, concept: p.concept, prompt: p.prompt, answer: p.answer, answerKind: p.answerKind, hint: p.hint, explanation: p.explanation,
        })));
      }
      await tx.update(schema.chapterTests).set({ status: ordered.length ? "ready" : "failed", concepts }).where(eq(schema.chapterTests.id, testId));
    });
  } catch (error) {
    console.error("chapter test prep failed", error);
    await db.update(schema.chapterTests).set({ status: "failed" }).where(eq(schema.chapterTests.id, testId));
  }
}

/** A student's test preps, newest first. */
export async function chapterTestsFor(studentId: string, limit = 20) {
  return (await getDb()).select().from(schema.chapterTests)
    .where(eq(schema.chapterTests.studentId, studentId)).orderBy(desc(schema.chapterTests.createdAt)).limit(limit);
}

/** A test prep and its problems, if it's the student's. */
export async function loadChapterTest(studentId: string, testId: string) {
  const db = await getDb();
  const [test] = await db.select().from(schema.chapterTests)
    .where(and(eq(schema.chapterTests.id, testId), eq(schema.chapterTests.studentId, studentId)));
  if (!test) return null;
  const problems = await db.select().from(schema.chapterTestProblems)
    .where(eq(schema.chapterTestProblems.testId, testId)).orderBy(asc(schema.chapterTestProblems.position));
  return { test, problems };
}

/** What the student sees of a problem: the answer stays hidden until it's finished. */
export function testProblemView(p: TestProblem) {
  const done = p.solved !== null;
  return {
    id: p.id, concept: p.concept, prompt: p.prompt, tries: p.tries, usedHint: p.usedHint, lastAnswer: p.lastAnswer,
    done, solved: p.solved, firstTryCorrect: p.firstTryCorrect,
    hint: p.usedHint || done ? p.hint : null,
    answer: done ? p.answer : null,
    explanation: done ? p.explanation : null,
  };
}

/** Applies an answer or a hint request to a test prep problem. */
export async function actOnTestProblem(studentId: string, problemId: string, action: { type: "answer"; answer: string } | { type: "hint" }) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [found] = await tx.select({ problem: schema.chapterTestProblems, test: schema.chapterTests })
      .from(schema.chapterTestProblems).innerJoin(schema.chapterTests, eq(schema.chapterTests.id, schema.chapterTestProblems.testId))
      .where(eq(schema.chapterTestProblems.id, problemId)).for("update");
    if (!found || found.test.studentId !== studentId) return null;
    const { problem } = found;
    if (problem.solved !== null) return { problem: testProblemView(problem), correct: problem.solved };
    if (action.type === "hint") {
      const [updated] = await tx.update(schema.chapterTestProblems).set({ usedHint: true }).where(eq(schema.chapterTestProblems.id, problemId)).returning();
      return { problem: testProblemView(updated), correct: null };
    }
    const answer = action.answer.slice(0, 50);
    const correct = checkAnswer(problem.answerKind, problem.answer, answer);
    const tries = problem.tries + 1;
    const finished = correct || tries >= MAX_TRIES;
    const [updated] = await tx.update(schema.chapterTestProblems).set({
      tries, lastAnswer: answer,
      ...(correct ? {} : { wrongAnswers: [...problem.wrongAnswers, answer] }),
      ...(finished ? { solved: correct, firstTryCorrect: correct && tries === 1 && !problem.usedHint, answeredAt: new Date() } : {}),
    }).where(eq(schema.chapterTestProblems.id, problemId)).returning();
    return { problem: testProblemView(updated), correct };
  });
}

const AdviceSchema = z.object({
  advice: z.string().describe("3 or 4 short sentences to the student: how ready they look, what they did well, and exactly what to review before the test."),
});

/** Plain advice for when Claude can't write it. */
function fallbackAdvice(concepts: ChapterTestConcept[], result: Omit<ChapterTestResult, "advice">) {
  const weak = concepts.filter((_, i) => result.concepts[i].total && result.concepts[i].score < READY_AT).map((c) => c.name);
  if (!weak.length) return "You look ready! Get a good night's sleep and check your work on test day.";
  return `Nice work getting through it. Before the test, review: ${weak.join(", ")}. Read the lesson again, then try another test prep on just those.`;
}

/**
 * Scores a finished test prep, has Claude write advice on what to review, and awards XP. Runs once;
 * later calls return the saved result.
 */
export async function finishChapterTest(student: Student, timezone: string, testId: string): Promise<{ result: ChapterTestResult; rewards: AwardSummary | null } | null> {
  const loaded = await loadChapterTest(student.id, testId);
  if (!loaded || loaded.test.status !== "ready") return null;
  const { test, problems } = loaded;
  if (test.result) return { result: test.result, rewards: null };
  if (!problems.length || problems.some((p) => p.solved === null)) return null;

  const scored = scoreTest(test.concepts.length, problems);
  let advice = "";
  try {
    const misses = problems.filter((p) => !p.firstTryCorrect)
      .map((p) => `- ${test.concepts[p.concept]?.name}: ${p.prompt} (answer ${p.answer}; they said ${p.wrongAnswers.map((a) => JSON.stringify(a)).join(", ") || "it right after a hint"})`);
    const reply = await askStructured({
      effort: "low",
      schema: AdviceSchema,
      system: `You are a warm math coach. A ${GRADE_LABELS[student.grade] ?? ""} student, ${student.name}, just finished practice for a test. From their results, tell them how ready they look and what to review. Be specific about which ideas and which mistakes, and kind. Plain words, short sentences, math in plain text like 3/4.`,
      content: [{ type: "text", text: [
        `Test prep: ${test.title}`,
        `Overall: ${Math.round(scored.score * 100)}% ready.`,
        "By idea:",
        ...test.concepts.map((c, i) => `- ${c.name}: ${scored.concepts[i].right} of ${scored.concepts[i].total} right on the first try, ${Math.round(scored.concepts[i].score * 100)}%`),
        misses.length ? `Problems they missed or needed help on:\n${misses.join("\n")}` : "They got every problem right on the first try.",
      ].join("\n") }],
    });
    advice = reply?.advice.trim().slice(0, 800) ?? "";
  } catch (error) {
    console.error("test prep advice failed", error);
  }
  const result: ChapterTestResult = { ...scored, advice: advice || fallbackAdvice(test.concepts, scored) };

  const db = await getDb();
  const [saved] = await db.update(schema.chapterTests).set({ result, finishedAt: new Date() })
    .where(and(eq(schema.chapterTests.id, testId), isNull(schema.chapterTests.result))).returning();
  if (!saved) {
    const again = await loadChapterTest(student.id, testId);
    return again?.test.result ? { result: again.test.result, rewards: null } : null;
  }
  return { result, rewards: await awardForTestPrep(student.id, timezone, testId) };
}
