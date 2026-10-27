import "server-only";
import { and, asc, count, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { GRADE_LABELS, SKILLS, SKILLS_BY_ID } from "./curriculum";
import { askStructured, imageBlock } from "./ai";
import { PRACTICE_RULES, PracticeSchema, checkedPractice } from "./coach";
import { readUpload, type ImageType } from "./tutor";

/** Skill id for quiz problems that don't match anything in the curriculum. */
export const QUIZ_SKILL = "quiz-prep";
const MAX_TOPICS = 6;
const PER_TOPIC = 4;

const PrepSchema = z.object({
  title: z.string().describe("A short name for the quiz, like \"Fractions quiz\" or \"Unit 4 test\"."),
  topics: z.array(z.object({
    name: z.string().describe("The topic in a few words, as a student would recognize it."),
    skillId: z.enum(["none", ...SKILLS.map((s) => s.id)]).describe("The closest curriculum skill, or none if nothing fits."),
    problems: z.array(PracticeSchema).describe(`${PER_TOPIC + 1} practice problems on this topic, easiest first.`),
  })).describe(`The main topics the quiz covers, at most ${MAX_TOPICS}.`),
});

const SKILL_LIST = SKILLS.map((s) => `- ${s.id}: ${s.name} (${GRADE_LABELS[s.grade]})`).join("\n");

/** Reads the study guide and writes the quiz's practice problems, which upcoming drills then mix in. */
export async function buildTestPrep(prepId: string) {
  const db = await getDb();
  const [found] = await db.select({ prep: schema.testPreps, student: schema.students })
    .from(schema.testPreps).innerJoin(schema.students, eq(schema.students.id, schema.testPreps.studentId))
    .where(eq(schema.testPreps.id, prepId));
  if (!found || found.prep.status !== "pending") return;
  const { prep, student } = found;

  try {
    const result = await askStructured({
      system: `You are a math tutor helping a ${GRADE_LABELS[student.grade] ?? ""} student get ready for a quiz. From their study guide or notes, work out the main topics the quiz covers, match each to the closest skill in this curriculum, and write practice problems for each topic.

Curriculum:
${SKILL_LIST}

${PRACTICE_RULES}
- match the style and difficulty of the study guide, if there is one.`,
      schema: PrepSchema,
      effort: "medium",
      content: [
        ...(prep.imagePath && prep.imageType ? [imageBlock({ data: readUpload(prep.imagePath), type: prep.imageType as ImageType })] : []),
        { type: "text", text: [
          prep.imagePath ? "The picture is the study guide." : "",
          prep.notes ? `Notes about the quiz: ${prep.notes}` : "",
          `Quiz title so far: ${prep.title}`,
        ].filter(Boolean).join("\n") },
      ],
    });
    if (!result?.topics.length) throw new Error("no topics found");

    const topics = result.topics.slice(0, MAX_TOPICS).map((t) => ({ name: t.name.trim().slice(0, 80), skillId: t.skillId === "none" ? null : t.skillId }));
    const drafts = result.topics.slice(0, MAX_TOPICS).flatMap((t, i) => t.problems.map((p) => ({ ...p, topic: i })));
    const checked = await checkedPractice(drafts);
    // Up to PER_TOPIC per topic, keeping the easiest-first order.
    const perTopic = new Map<number, number>();
    const kept = checked.filter((p) => {
      const n = perTopic.get(p.topic) ?? 0;
      perTopic.set(p.topic, n + 1);
      return n < PER_TOPIC;
    });

    await db.transaction(async (tx) => {
      if (kept.length) {
        await tx.insert(schema.practiceProblems).values(kept.map((p) => ({
          studentId: student.id, source: "test_prep" as const, testPrepId: prep.id, skillId: topics[p.topic].skillId ?? QUIZ_SKILL,
          prompt: p.prompt, answer: p.answer, answerKind: p.answerKind, hint: p.hint, explanation: p.explanation,
        })));
      }
      await tx.update(schema.testPreps).set({
        status: kept.length ? "ready" : "failed",
        topics,
        title: prep.title || result.title.trim().slice(0, 80),
      }).where(eq(schema.testPreps.id, prep.id));
    });
  } catch (error) {
    console.error("test prep failed", error);
    await db.update(schema.testPreps).set({ status: "failed" }).where(eq(schema.testPreps.id, prep.id));
  }
}

/** A student's quiz preps with practice progress, upcoming first. */
export async function testPrepsFor(studentId: string, today: string) {
  const db = await getDb();
  const [preps, queued, answered] = await Promise.all([
    db.select().from(schema.testPreps).where(eq(schema.testPreps.studentId, studentId))
      .orderBy(desc(gte(schema.testPreps.quizDate, today)), asc(schema.testPreps.quizDate)).limit(20),
    db.select({ prepId: schema.practiceProblems.testPrepId, total: count(), unused: sql<number>`count(*) filter (where ${schema.practiceProblems.usedAt} is null)`.mapWith(Number) })
      .from(schema.practiceProblems).where(and(eq(schema.practiceProblems.studentId, studentId), isNotNull(schema.practiceProblems.testPrepId)))
      .groupBy(schema.practiceProblems.testPrepId),
    db.select({
      prepId: schema.drillProblems.testPrepId,
      done: sql<number>`count(*) filter (where ${schema.drillProblems.solved} is not null)`.mapWith(Number),
      right: sql<number>`count(*) filter (where ${schema.drillProblems.firstTryCorrect})`.mapWith(Number),
    }).from(schema.drillProblems).innerJoin(schema.drills, eq(schema.drills.id, schema.drillProblems.drillId))
      .where(and(eq(schema.drills.studentId, studentId), isNotNull(schema.drillProblems.testPrepId)))
      .groupBy(schema.drillProblems.testPrepId),
  ]);
  const q = new Map(queued.map((r) => [r.prepId, r]));
  const a = new Map(answered.map((r) => [r.prepId, r]));
  return preps.map((p) => {
    const daysLeft = Math.round((Date.parse(p.quizDate) - Date.parse(today)) / 86_400_000);
    return {
      ...p,
      daysLeft,
      upcoming: daysLeft >= 0,
      total: q.get(p.id)?.total ?? 0,
      waiting: q.get(p.id)?.unused ?? 0,
      answered: a.get(p.id)?.done ?? 0,
      right: a.get(p.id)?.right ?? 0,
      topicNames: p.topics.map((t) => (t.skillId ? SKILLS_BY_ID.get(t.skillId)?.name ?? t.name : t.name)),
    };
  });
}
