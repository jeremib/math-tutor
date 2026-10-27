import "server-only";
import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { GRADE_LABELS, SKILLS_BY_ID } from "./curriculum";
import { askStructured } from "./ai";
import { awardForExplanation } from "./achievements";
import { sessionMessages } from "./tutor";

export type TeachBackSource = "misconception" | "homework";

const HOMEWORK_QUESTION = "How did you solve this problem? Explain it like you're teaching a friend.";
/** Tries a student gets at one explanation before it stops being suggested. */
const MAX_TRIES = 3;
/** Solved homework stays suggested for teach-back this long. */
const HOMEWORK_WINDOW_DAYS = 7;

type Student = typeof schema.students.$inferSelect;

/** What to explain: the question, plus context Claude needs to judge the answer. */
async function teachBackItem(studentId: string, source: TeachBackSource, sourceId: string) {
  const db = await getDb();
  if (source === "misconception") {
    const [m] = await db.select().from(schema.misconceptions)
      .where(and(eq(schema.misconceptions.id, sourceId), eq(schema.misconceptions.studentId, studentId)));
    if (!m?.resolvedAt || !m.teachBackQuestion) return null;
    return {
      title: SKILLS_BY_ID.get(m.skillId)?.name ?? "A tricky idea",
      question: m.teachBackQuestion,
      context: `The student used to make this mistake: ${m.label} They have since practiced and fixed it.`,
    };
  }
  const [h] = await db.select().from(schema.homeworkSessions)
    .where(and(eq(schema.homeworkSessions.id, sourceId), eq(schema.homeworkSessions.studentId, studentId)));
  if (h?.status !== "solved") return null;
  const transcript = (await sessionMessages(h.id)).map((m) => `${m.role === "user" ? "Student" : "Tutor"}: ${m.content}`).join("\n");
  return {
    title: h.title,
    question: HOMEWORK_QUESTION,
    context: `The student solved this homework problem with a tutor. The conversation:\n${transcript}`,
  };
}

export async function teachBackPage(student: Student, source: TeachBackSource, sourceId: string) {
  const item = await teachBackItem(student.id, source, sourceId);
  if (!item) return null;
  const db = await getDb();
  const attempts = await db.select().from(schema.explanations)
    .where(and(eq(schema.explanations.studentId, student.id), eq(schema.explanations.source, source), eq(schema.explanations.sourceId, sourceId)))
    .orderBy(desc(schema.explanations.createdAt));
  return { ...item, attempts };
}

/** Explanations the student could do now: fixed misconceptions and recently solved homework. */
export async function pendingTeachBacks(studentId: string) {
  const db = await getDb();
  const since = new Date(Date.now() - HOMEWORK_WINDOW_DAYS * 86_400_000);
  const [fixed, solved, done] = await Promise.all([
    db.select().from(schema.misconceptions)
      .where(and(eq(schema.misconceptions.studentId, studentId), isNotNull(schema.misconceptions.resolvedAt), isNotNull(schema.misconceptions.teachBackQuestion)))
      .orderBy(desc(schema.misconceptions.resolvedAt)).limit(10),
    db.select().from(schema.homeworkSessions)
      .where(and(eq(schema.homeworkSessions.studentId, studentId), eq(schema.homeworkSessions.status, "solved"), gte(schema.homeworkSessions.updatedAt, since)))
      .orderBy(desc(schema.homeworkSessions.updatedAt)).limit(10),
    db.select({ sourceId: schema.explanations.sourceId, verdict: schema.explanations.verdict }).from(schema.explanations)
      .where(eq(schema.explanations.studentId, studentId)),
  ]);
  const tries = new Map<string, number>();
  const finished = new Set<string>();
  for (const e of done) {
    tries.set(e.sourceId, (tries.get(e.sourceId) ?? 0) + 1);
    if (e.verdict !== "not_yet") finished.add(e.sourceId);
  }
  const open = (id: string) => !finished.has(id) && (tries.get(id) ?? 0) < MAX_TRIES;
  return [
    ...fixed.filter((m) => open(m.id)).map((m) => ({ source: "misconception" as const, id: m.id, question: m.teachBackQuestion! })),
    ...solved.filter((h) => open(h.id)).map((h) => ({ source: "homework" as const, id: h.id, question: `${HOMEWORK_QUESTION} (${h.title})` })),
  ].slice(0, 3);
}

/** The latest explanation for each source, for parent views. */
export async function latestExplanations(studentId: string, sourceIds: string[]) {
  if (!sourceIds.length) return new Map<string, typeof schema.explanations.$inferSelect>();
  const db = await getDb();
  const rows = await db.select().from(schema.explanations)
    .where(and(eq(schema.explanations.studentId, studentId), inArray(schema.explanations.sourceId, sourceIds)))
    .orderBy(desc(schema.explanations.createdAt));
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.sourceId)) latest.set(r.sourceId, r);
  return latest;
}

const VerdictSchema = z.object({
  verdict: z.enum(["got_it", "partly", "not_yet"]).describe(
    "got_it: the explanation shows they understand the key idea, even if the wording is simple. partly: on the right track but missing or muddling a key step. not_yet: wrong, off topic, or too vague to tell.",
  ),
  feedback: z.string().describe("2–3 short, warm sentences to the student: what they explained well (be specific), and for partly/not_yet, one question or nudge toward what's missing. Don't lecture or give a full explanation."),
});

/** Judges a student's explanation, records it, and awards XP for the first good one. */
export async function judgeExplanation(student: Student, timezone: string, source: TeachBackSource, sourceId: string, answer: string) {
  const item = await teachBackItem(student.id, source, sourceId);
  if (!item) return null;
  const level = GRADE_LABELS[student.grade] ?? `grade ${student.grade}`;
  const result = await askStructured({
    system: `You are a warm math tutor. A ${level} student is explaining a math idea back in their own words, which helps them remember it. Judge whether the explanation shows real understanding of the key idea. Be generous about wording, spelling and grammar, since they may be young or speaking aloud; judge the math idea. Write the feedback for a ${level} reader.`,
    schema: VerdictSchema,
    effort: "low",
    content: [{ type: "text", text: `${item.context}\n\nQuestion: ${item.question}\n\nThe student's explanation: ${JSON.stringify(answer)}` }],
  });
  if (!result) return null;
  const db = await getDb();
  const [row] = await db.insert(schema.explanations).values({
    studentId: student.id, source, sourceId, question: item.question, answer, verdict: result.verdict, feedback: result.feedback.trim(),
  }).returning();
  const rewards = result.verdict === "not_yet" ? null : await awardForExplanation(student.id, timezone, `${source}:${sourceId}`);
  return { explanation: row, rewards };
}
