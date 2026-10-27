import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb, schema, type Db } from "@/db";
import { SKILLS_BY_ID, seededRandom } from "./curriculum";
import { checkAnswer } from "./answers";
import { awardForProblem, type AwardSummary } from "./achievements";
import {
  chooseDrillSkills, computeStreak, earnedMastery, initialSkills, isMastered, localDate, scheduleReview, skillsToUnlock, updateMastery,
  type SkillState,
} from "./progress";
import { RESOLVE_AFTER, choosePractice, mixIntoDrill } from "./practice";
import { refillChapterPractice, textbookFor } from "./textbook";
import { chapterSkillPrefix, spreadByLesson, textbookShare } from "./textbook-plan";

type Student = typeof schema.students.$inferSelect;
/** A connection or an open transaction. */
type Tx = Pick<Db, "select" | "insert" | "update" | "delete">;

export async function seedStudentSkills(studentId: string, grade: number, tx?: Tx) {
  const db = tx ?? (await getDb());
  const now = new Date();
  const rows = initialSkills(grade).map((s) => ({
    studentId, skillId: s.skillId, unlockedAt: now,
    // Earlier-grade skills start as assumed knowledge; review drills will reveal gaps.
    mastery: s.mastered ? 0.8 : 0,
    masteredAt: s.mastered ? now : null,
  }));
  if (rows.length) await db.insert(schema.studentSkills).values(rows).onConflictDoNothing();
}

export async function skillRows(studentId: string, tx?: Tx) {
  const db = tx ?? (await getDb());
  return db.select().from(schema.studentSkills).where(eq(schema.studentSkills.studentId, studentId));
}

function toStates(rows: Awaited<ReturnType<typeof skillRows>>): SkillState[] {
  return rows.map((r) => ({
    skillId: r.skillId, mastery: r.mastery, attempts: r.attempts,
    mastered: r.masteredAt !== null, lastPracticedAt: r.lastPracticedAt?.getTime() ?? null,
    nextReviewAt: r.nextReviewAt?.getTime() ?? null, reviewIntervalDays: r.reviewIntervalDays,
  }));
}

/** Makes sure the student always has skills in progress, unlocking the next ones in the curriculum. */
async function unlockNext(studentId: string, tx: Tx) {
  const ids = skillsToUnlock(toStates(await skillRows(studentId, tx)));
  if (ids.length) {
    await tx.insert(schema.studentSkills).values(ids.map((skillId) => ({ studentId, skillId }))).onConflictDoNothing();
  }
}

export function parseFocus(student: Student): string[] {
  return Array.isArray(student.focusSkills) ? student.focusSkills.filter((id) => SKILLS_BY_ID.has(id)) : [];
}

export function todayFor(timezone: string) {
  return localDate(timezone);
}

/** Returns today's drill, creating it on first visit. */
export async function getOrCreateDrill(student: Student, timezone: string) {
  const db = await getDb();
  const date = todayFor(timezone);
  const where = and(eq(schema.drills.studentId, student.id), eq(schema.drills.date, date));
  const [existing] = await db.select().from(schema.drills).where(where);
  if (existing) return existing;

  // Drills follow the textbook chapter the class is on, if the parent picked one.
  const book = await textbookFor(student.id);
  const chapter = book?.status === "ready" && book.currentChapter !== null ? book.chapters[book.currentChapter] : undefined;
  const chapterPrefix = chapter ? chapterSkillPrefix(book!.id, book!.currentChapter!) : null;

  let created = false;
  const result = await db.transaction(async (tx) => {
    await unlockNext(student.id, tx);
    const focus = parseFocus(student);
    // Focus skills are practiced even if the curriculum hasn't reached them yet.
    if (focus.length) {
      await tx.insert(schema.studentSkills).values(focus.map((skillId) => ({ studentId: student.id, skillId }))).onConflictDoNothing();
    }
    const skills = chooseDrillSkills(toStates(await skillRows(student.id, tx)), student.dailyProblems, focus);

    // Two tabs opening the drill at once both get here; the unique index picks one winner.
    const [drill] = await tx.insert(schema.drills).values({ studentId: student.id, date, total: skills.length })
      .onConflictDoNothing().returning();
    if (!drill) return (await tx.select().from(schema.drills).where(where))[0];

    created = true;
    // Practice problems Claude wrote (from missed answers, solved homework, quiz prep and the textbook) take some of the slots.
    const queued = await tx.select({ p: schema.practiceProblems, quizDate: schema.testPreps.quizDate }).from(schema.practiceProblems)
      .leftJoin(schema.testPreps, eq(schema.testPreps.id, schema.practiceProblems.testPrepId))
      .where(and(eq(schema.practiceProblems.studentId, student.id), isNull(schema.practiceProblems.usedAt)))
      .orderBy(asc(schema.testPreps.quizDate), asc(schema.practiceProblems.createdAt)).limit(100);
    // Quiz problems only count until the quiz; nulls (non-quiz practice) sort last above.
    const quiz = queued.filter((q) => q.quizDate && q.quizDate >= date).map((q) => q.p);
    const lessons = queued.filter((q) => chapterPrefix && q.p.skillId.startsWith(chapterPrefix)).map((q) => q.p);
    const other = queued.filter((q) => !q.p.testPrepId && !lessons.includes(q.p)).map((q) => q.p);
    const daysToQuiz = quiz.length ? Math.round((Date.parse(queued.find((q) => q.quizDate && q.quizDate >= date)!.quizDate!) - Date.parse(date)) / 86_400_000) : 0;
    // The current chapter's lessons go first: most of the drill when no built-in skill covers the chapter.
    const lessonCount = textbookShare(skills.length, lessons.length, !!chapter?.skillIds.length);
    const slots = choosePractice(skills.length - lessonCount, quiz.length, daysToQuiz, other.length);
    const practice = [...spreadByLesson(lessons).slice(0, lessonCount), ...quiz.slice(0, slots.quiz), ...other.slice(0, slots.other)];

    const rand = seededRandom(Date.now() ^ student.id.charCodeAt(0));
    const curriculum = skills.map((skillId) => {
      const p = SKILLS_BY_ID.get(skillId)!.generate(rand);
      return {
        skillId, prompt: p.prompt, answer: p.answer, answerKind: p.answerKind,
        choices: p.choices ?? null, hint: p.hint, explanation: p.explanation, visual: p.visual ?? null,
      };
    });
    const fromPractice = practice.map((q) => ({
      skillId: q.skillId, prompt: q.prompt, answer: q.answer, answerKind: q.answerKind,
      choices: null, hint: q.hint, explanation: q.explanation, visual: null, source: q.source, misconceptionId: q.misconceptionId,
      testPrepId: q.testPrepId,
    }));
    await tx.insert(schema.drillProblems).values(
      mixIntoDrill(curriculum, fromPractice).map((p, position) => ({ ...p, drillId: drill.id, position })),
    );
    if (practice.length) {
      await tx.update(schema.practiceProblems).set({ usedAt: new Date() })
        .where(inArray(schema.practiceProblems.id, practice.map((q) => q.id)));
    }
    return drill;
  });
  // Today's drill used up some of the chapter's problems; write more if it's running low.
  if (created) await refillChapterPractice(student);
  return result;
}

export async function drillProblems(drillId: string, tx?: Tx) {
  const db = tx ?? (await getDb());
  return db.select().from(schema.drillProblems).where(eq(schema.drillProblems.drillId, drillId))
    .orderBy(asc(schema.drillProblems.position));
}

export const MAX_TRIES = 2;

/** Public view of a problem: hides the answer until the problem is finished. */
export function problemView(p: typeof schema.drillProblems.$inferSelect) {
  const done = p.solved !== null;
  return {
    id: p.id, position: p.position, prompt: p.prompt, answerKind: p.answerKind,
    choices: p.choices,
    skillName: SKILLS_BY_ID.get(p.skillId)?.name ?? (p.source === "textbook" ? "Textbook practice" : "Quiz prep"),
    tries: p.tries, usedHint: p.usedHint, lastAnswer: p.lastAnswer, done, solved: p.solved,
    hint: p.usedHint || done ? p.hint : null,
    answer: done ? p.answer : null,
    explanation: done ? p.explanation : null,
    visual: p.usedHint || done ? p.visual : null,
    source: p.source,
    /** A missed problem Claude can explain: finished, with at least one wrong answer. */
    canDiagnose: done && p.wrongAnswers.length > 0,
    feedback: p.feedback,
    feedbackStatus: p.feedbackStatus,
  };
}

async function recordSkillResult(tx: Tx, studentId: string, skillId: string, correct: boolean) {
  const key = and(eq(schema.studentSkills.studentId, studentId), eq(schema.studentSkills.skillId, skillId));
  const [row] = await tx.select().from(schema.studentSkills).where(key).for("update");
  const mastery = updateMastery(row?.mastery ?? 0, correct);
  const attempts = (row?.attempts ?? 0) + 1;
  const correctTotal = (row?.correct ?? 0) + (correct ? 1 : 0);
  const now = new Date();
  const masteredAt = row?.masteredAt ?? (isMastered(mastery, attempts) ? now : null);
  // Mastered skills come back for review on a growing schedule; a fresh mastery starts it.
  const review = masteredAt ? scheduleReview(row?.masteredAt ? row.reviewIntervalDays : 1, correct, now.getTime()) : null;
  const scheduling = review ? { reviewIntervalDays: review.reviewIntervalDays, nextReviewAt: new Date(review.nextReviewAt) } : {};
  await tx.insert(schema.studentSkills).values({
    studentId, skillId, mastery, attempts, correct: correctTotal, masteredAt, lastPracticedAt: now, ...scheduling,
  }).onConflictDoUpdate({
    target: [schema.studentSkills.studentId, schema.studentSkills.skillId],
    set: { mastery, attempts, correct: correctTotal, masteredAt, lastPracticedAt: now, ...scheduling },
  });
  const newlyMastered = !row?.masteredAt && masteredAt !== null;
  if (newlyMastered) await unlockNext(studentId, tx);
  return newlyMastered;
}

/** A targeted practice problem went right; enough of those clear the misconception. */
async function recordTargetedPractice(tx: Tx, misconceptionId: string) {
  await tx.update(schema.misconceptions).set({
    practicedCorrect: sql`${schema.misconceptions.practicedCorrect} + 1`,
    resolvedAt: sql`case when ${schema.misconceptions.practicedCorrect} + 1 >= ${RESOLVE_AFTER} then now() else ${schema.misconceptions.resolvedAt} end`,
  }).where(and(eq(schema.misconceptions.id, misconceptionId), isNull(schema.misconceptions.resolvedAt)));
}

/** Applies a student's answer or hint request to a drill problem. */
export async function actOnProblem(studentId: string, timezone: string, problemId: string, action: { type: "answer"; answer: string } | { type: "hint" }) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    // Lock the problem so a double-tapped "Check" can't be counted twice.
    const [found] = await tx.select({ problem: schema.drillProblems, drill: schema.drills })
      .from(schema.drillProblems).innerJoin(schema.drills, eq(schema.drills.id, schema.drillProblems.drillId))
      .where(eq(schema.drillProblems.id, problemId)).for("update");
    if (!found || found.drill.studentId !== studentId) return null;
    const { problem, drill } = found;
    if (problem.solved !== null) return { problem: problemView(problem), correct: problem.solved, mastered: null, drillDone: drill.completedAt !== null, rewards: null };

    if (action.type === "hint") {
      const [updated] = await tx.update(schema.drillProblems).set({ usedHint: true })
        .where(eq(schema.drillProblems.id, problemId)).returning();
      return { problem: problemView(updated), correct: null, mastered: null, drillDone: false, rewards: null };
    }

    const answer = action.answer.slice(0, 50);
    const correct = checkAnswer(problem.answerKind, problem.answer, answer);
    const tries = problem.tries + 1;
    const finished = correct || tries >= MAX_TRIES;
    const [updated] = await tx.update(schema.drillProblems).set({
      tries, lastAnswer: answer,
      ...(correct ? {} : { wrongAnswers: [...problem.wrongAnswers, answer] }),
      ...(finished ? {
        solved: correct,
        firstTryCorrect: correct && tries === 1 && !problem.usedHint,
        answeredAt: new Date(),
      } : {}),
    }).where(eq(schema.drillProblems.id, problemId)).returning();

    let mastered: string | null = null;
    let drillDone = false;
    let rewards: AwardSummary | null = null;
    if (finished) {
      // Quiz problems outside the curriculum have no skill to track.
      const newlyMastered = SKILLS_BY_ID.has(problem.skillId)
        ? await recordSkillResult(tx, studentId, problem.skillId, !!updated.firstTryCorrect)
        : false;
      if (problem.source === "misconception" && problem.misconceptionId && updated.firstTryCorrect) {
        await recordTargetedPractice(tx, problem.misconceptionId);
      }
      if (newlyMastered) mastered = SKILLS_BY_ID.get(problem.skillId)?.name ?? problem.skillId;
      const all = await drillProblems(drill.id, tx);
      const correctCount = all.filter((p) => p.firstTryCorrect).length;
      drillDone = all.every((p) => p.solved !== null);
      await tx.update(schema.drills).set({ correctCount, ...(drillDone ? { completedAt: new Date() } : {}) })
        .where(eq(schema.drills.id, drill.id));
      rewards = await awardForProblem(tx, {
        studentId, timezone, problemId, solved: correct, firstTry: !!updated.firstTryCorrect,
        masteredSkill: newlyMastered ? problem.skillId : null,
        drill: { id: drill.id, total: all.length, correctCount, done: drillDone },
      });
    }
    return { problem: problemView(updated), correct, mastered, drillDone, rewards };
  });
}

export async function studentStats(student: Student, timezone: string) {
  const db = await getDb();
  const [completed, rows] = await Promise.all([
    db.select({ date: schema.drills.date, total: schema.drills.total, correct: schema.drills.correctCount })
      .from(schema.drills).where(and(eq(schema.drills.studentId, student.id), isNotNull(schema.drills.completedAt)))
      .orderBy(desc(schema.drills.date)),
    skillRows(student.id),
  ]);
  const today = todayFor(timezone);
  const totalProblems = completed.reduce((n, d) => n + d.total, 0);
  const totalCorrect = completed.reduce((n, d) => n + d.correct, 0);
  return {
    streak: computeStreak(completed.map((d) => d.date), today),
    drillsCompleted: completed.length,
    doneToday: completed.some((d) => d.date === today),
    accuracy: totalProblems ? Math.round((100 * totalCorrect) / totalProblems) : null,
    recentDrills: completed.slice(0, 14),
    skillsMastered: rows.filter((r) => earnedMastery(r.masteredAt, r.attempts)).length,
    skills: rows
      .map((r) => ({ ...r, skill: SKILLS_BY_ID.get(r.skillId) }))
      .filter((r) => r.skill)
      .sort((a, b) => a.skill!.grade - b.skill!.grade),
  };
}
