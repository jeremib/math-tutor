import "server-only";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { GRADE_LABELS, SKILLS, SKILLS_BY_ID } from "./curriculum";
import { askStructured, imageBlock, type ImageInput } from "./ai";
import { buildMessages, readUpload, type ImageType } from "./tutor";
import { MAX_QUEUED_PER_MISCONCEPTION, normalizeTag, validateGenerated, type GeneratedProblem } from "./practice";

const PracticeSchema = z.object({
  prompt: z.string().describe("The problem, in plain text. Write math like 3/4, 2 × 5, x^2."),
  answer: z.string().describe("A single number, fraction (3/4), mixed number (1 1/2) or decimal. For quotient-and-remainder problems, like 7 R 2."),
  answerKind: z.enum(["number", "remainder"]),
  hint: z.string().describe("One short hint that nudges without giving the answer away."),
  explanation: z.string().describe("A short worked solution shown after the student answers."),
});

const PRACTICE_RULES = `Practice problems must:
- be answerable with one number, fraction, mixed number or decimal (answerKind "number"), or a quotient and remainder like 7 R 2 (answerKind "remainder"). No multiple choice, no units in the answer, no answers in words.
- use different numbers from the original problem.
- be right for the student's grade, and solvable in a minute or two.
- have an answer you have double-checked by working it out.`;

const DiagnosisSchema = z.object({
  kind: z.enum(["slip", "misconception", "unclear"]).describe(
    "slip: a one-off mistake like a typo or a small arithmetic error in otherwise sound work. misconception: a wrong idea about the math that will keep causing mistakes. unclear: you can't tell from the answers.",
  ),
  tag: z.string().describe("For a misconception: a short kebab-case name for it, such as adds-denominators or forgets-to-carry. Reuse an existing tag if it's the same mistake. Empty otherwise."),
  parentNote: z.string().describe("For a misconception: one plain sentence for a parent describing what the child is doing. Empty otherwise."),
  kidMessage: z.string().describe("2–3 short, kind sentences to the student about their specific answer: what likely happened and the one idea to remember. Don't scold."),
  practice: z.array(PracticeSchema).describe("For a misconception: 2 practice problems that target it. Empty otherwise."),
});

function diagnosisPrompt(grade: number) {
  const level = GRADE_LABELS[grade] ?? `grade ${grade}`;
  return `You are a math tutor reviewing a ${level} student's wrong answers on a practice problem. Work out why they answered the way they did.

Look for the reasoning that produces their exact wrong answer. For example, 1/3 + 1/4 answered as 2/7 means they added the tops and the bottoms. If a picture of their work is included, read it line by line and find the first step that went wrong.

Only call something a misconception when the wrong answer shows a real wrong idea. A one-off slip is a slip. When you can't tell, say unclear.

Write kidMessage to the student, for a ${level} reader: short sentences, warm, plain math like 3/4 and 2 × 5. Talk about their answer, not a generic rule.

${PRACTICE_RULES}`;
}

type DrillProblem = typeof schema.drillProblems.$inferSelect;

/**
 * Asks Claude why a student got a drill problem wrong. Records any misconception and
 * queues practice problems that target it. Runs once per problem.
 */
export async function diagnoseMiss(studentId: string, grade: number, problemId: string, work?: ImageInput & { path: string }) {
  const db = await getDb();
  const [found] = await db.select({ problem: schema.drillProblems })
    .from(schema.drillProblems).innerJoin(schema.drills, eq(schema.drills.id, schema.drillProblems.drillId))
    .where(and(eq(schema.drillProblems.id, problemId), eq(schema.drills.studentId, studentId)));
  if (!found) return null;
  const problem = found.problem;
  if (problem.solved === null || !problem.wrongAnswers.length) return { status: "none" as const, feedback: null };

  // Claim the problem so a double request can't diagnose (and queue practice) twice.
  const [claimed] = await db.update(schema.drillProblems)
    .set({ feedbackStatus: "pending", workImagePath: work?.path ?? null })
    .where(and(eq(schema.drillProblems.id, problemId), isNull(schema.drillProblems.feedbackStatus))).returning();
  if (!claimed) return { status: problem.feedbackStatus!, feedback: problem.feedback };

  try {
    const feedback = await runDiagnosis(studentId, grade, claimed, work);
    return { status: "done" as const, feedback };
  } catch (error) {
    console.error("diagnosis failed", error);
    await db.update(schema.drillProblems).set({ feedbackStatus: "failed" }).where(eq(schema.drillProblems.id, problemId));
    return { status: "failed" as const, feedback: null };
  }
}

async function runDiagnosis(studentId: string, grade: number, problem: DrillProblem, work?: ImageInput) {
  const db = await getDb();
  const skill = SKILLS_BY_ID.get(problem.skillId);
  const open = await db.select({ tag: schema.misconceptions.tag, label: schema.misconceptions.label }).from(schema.misconceptions)
    .where(and(eq(schema.misconceptions.studentId, studentId), isNull(schema.misconceptions.resolvedAt)));

  const result = await askStructured({
    system: diagnosisPrompt(grade),
    schema: DiagnosisSchema,
    effort: "medium",
    content: [
      ...(work ? [imageBlock(work)] : []),
      {
        type: "text",
        text: [
          `Skill: ${skill?.name ?? problem.skillId}${skill ? ` (${skill.description})` : ""}`,
          `Problem: ${problem.prompt}`,
          `Correct answer: ${problem.answer}`,
          `Worked solution: ${problem.explanation}`,
          `Student's wrong answers, in order: ${problem.wrongAnswers.map((a) => JSON.stringify(a)).join(", ")}`,
          problem.solved ? "They got it right on a later try." : "They did not get it right.",
          work ? "The picture shows the student's own work." : "",
          open.length ? `Misconceptions already noted for this student (reuse the tag if it's the same one):\n${open.map((m) => `- ${m.tag}: ${m.label}`).join("\n")}` : "",
        ].filter(Boolean).join("\n"),
      },
    ],
  });

  const feedback = result?.kidMessage.trim() || null;
  await db.transaction(async (tx) => {
    let misconceptionId: string | null = null;
    if (result?.kind === "misconception" && result.tag.trim() && result.parentNote.trim()) {
      const tag = normalizeTag(result.tag);
      const [row] = await tx.insert(schema.misconceptions)
        .values({ studentId, skillId: problem.skillId, tag, label: result.parentNote.trim().slice(0, 300) })
        .onConflictDoUpdate({
          target: [schema.misconceptions.studentId, schema.misconceptions.tag],
          targetWhere: sql`${schema.misconceptions.resolvedAt} is null`,
          set: { timesSeen: sql`${schema.misconceptions.timesSeen} + 1`, lastSeenAt: new Date() },
        })
        .returning();
      misconceptionId = row.id;

      const [{ queued }] = await tx.select({ queued: count() }).from(schema.practiceProblems)
        .where(and(eq(schema.practiceProblems.misconceptionId, row.id), isNull(schema.practiceProblems.usedAt)));
      const room = MAX_QUEUED_PER_MISCONCEPTION - queued;
      const practice = result.practice.map(validateGenerated).filter((p): p is GeneratedProblem => !!p).slice(0, Math.max(0, room));
      if (practice.length) {
        await tx.insert(schema.practiceProblems).values(practice.map((p) => ({
          ...p, studentId, source: "misconception" as const, misconceptionId: row.id, skillId: problem.skillId,
        })));
      }
    }
    await tx.update(schema.drillProblems).set({ feedback, feedbackStatus: "done", misconceptionId: misconceptionId ?? problem.misconceptionId })
      .where(eq(schema.drillProblems.id, problem.id));
  });
  return feedback;
}

const HomeworkPracticeSchema = z.object({
  skillId: z.enum(["none", ...SKILLS.map((s) => s.id)]).describe(
    "The curriculum skill this problem practices most. none if nothing in the list fits.",
  ),
  problems: z.array(PracticeSchema).describe("3 practice problems like the solved one."),
});

const SKILL_LIST = SKILLS.map((s) => `- ${s.id}: ${s.name} (${GRADE_LABELS[s.grade]}). ${s.description}`).join("\n");

/** After a homework problem is solved, writes practice problems like it and queues them for the next drill. */
export async function queueHomeworkPractice(sessionId: string) {
  const db = await getDb();
  const [found] = await db.select({ session: schema.homeworkSessions, student: schema.students })
    .from(schema.homeworkSessions).innerJoin(schema.students, eq(schema.students.id, schema.homeworkSessions.studentId))
    .where(eq(schema.homeworkSessions.id, sessionId));
  if (!found || found.session.status !== "solved") return;
  const { session, student } = found;
  // Claim the session so practice is only written once.
  const [claimed] = await db.update(schema.homeworkSessions).set({ skillId: "pending" })
    .where(and(eq(schema.homeworkSessions.id, sessionId), isNull(schema.homeworkSessions.skillId))).returning({ id: schema.homeworkSessions.id });
  if (!claimed) return;

  try {
    await writeHomeworkPractice(session, student);
  } catch (error) {
    console.error("homework practice failed", error);
    await db.update(schema.homeworkSessions).set({ skillId: "none" }).where(eq(schema.homeworkSessions.id, sessionId));
  }
}

async function writeHomeworkPractice(session: typeof schema.homeworkSessions.$inferSelect, student: typeof schema.students.$inferSelect) {
  const db = await getDb();
  const sessionId = session.id;

  const transcript = await buildMessages(session);
  const result = await askStructured({
    system: `You are a math tutor. A ${GRADE_LABELS[student.grade] ?? ""} student just solved a homework problem with your help. The conversation is below. Match the problem to the closest skill in this curriculum, then write practice problems like it so the idea sticks.

Curriculum:
${SKILL_LIST}

${PRACTICE_RULES}`,
    schema: HomeworkPracticeSchema,
    effort: "medium",
    content: [
      // The first message carries the homework photo, if there was one.
      ...transcript.flatMap((m) => typeof m.content === "string"
        ? [{ type: "text" as const, text: `${m.role === "user" ? "Student" : "Tutor"}: ${m.content}` }]
        : (m.content ?? []).map((b) => (b.type === "text" ? { ...b, text: `${m.role === "user" ? "Student" : "Tutor"}: ${b.text}` } : b))),
      { type: "text", text: "Now pick the skill and write the practice problems." },
    ],
  });
  if (!result || result.skillId === "none") {
    await db.update(schema.homeworkSessions).set({ skillId: "none" }).where(eq(schema.homeworkSessions.id, sessionId));
    return;
  }
  const practice = result.problems.map(validateGenerated).filter((p): p is GeneratedProblem => !!p).slice(0, 3);
  await db.transaction(async (tx) => {
    if (practice.length) {
      await tx.insert(schema.practiceProblems).values(practice.map((p) => ({
        ...p, studentId: student.id, source: "homework" as const, homeworkSessionId: sessionId, skillId: result.skillId,
      })));
    }
    await tx.update(schema.homeworkSessions).set({ skillId: result.skillId, practiceAdded: practice.length })
      .where(eq(schema.homeworkSessions.id, sessionId));
  });
}

/** Loads an uploaded work drawing for Claude. */
export function workImage(path: string, type: ImageType): ImageInput & { path: string } {
  return { data: readUpload(path), type, path };
}
