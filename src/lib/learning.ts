import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, like, sql } from "drizzle-orm";
import { getDb, schema, type Db } from "@/db";
import { SKILLS_BY_ID, seededRandom } from "./curriculum";
import { checkAnswer } from "./answers";
import { awardForProblem, type AwardSummary } from "./achievements";
import {
  chooseDrillSkills, computeStreak, earnedMastery, initialSkills, isMastered, localDate, scheduleReview, skillsToUnlock, updateMastery,
  type SkillState,
} from "./progress";
import { RESOLVE_AFTER, choosePractice, mixIntoDrill } from "./practice";
import { lessonTitles, refillChapterPractice, textbookFor } from "./textbook";
import { beforeLesson, chapterSkillPrefix, inLesson, parseLessonSkill, splitLessonSlots, spreadByLesson, textbookShare } from "./textbook-plan";

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

/** Curriculum skills only: textbook lessons are tracked in the same table but never unlocked or drilled by id. */
function toStates(rows: Awaited<ReturnType<typeof skillRows>>): SkillState[] {
  return rows.filter((r) => SKILLS_BY_ID.has(r.skillId)).map((r) => ({
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

/** Review problems drawn from earlier lessons' answered drill problems, missed ones first, one per prompt. */
async function reviewProblems(studentId: string, textbookId: string, at: { chapter: number; lesson: number }, tx: Tx) {
  const rows = await tx.select({ p: schema.drillProblems }).from(schema.drillProblems)
    .innerJoin(schema.drills, eq(schema.drills.id, schema.drillProblems.drillId))
    .where(and(eq(schema.drills.studentId, studentId), isNotNull(schema.drillProblems.solved),
      like(schema.drillProblems.skillId, `tb:${textbookId}:%`)))
    .orderBy(asc(schema.drillProblems.firstTryCorrect), desc(schema.drillProblems.answeredAt)).limit(80);
  const seen = new Set<string>();
  return rows.map((r) => r.p).filter((p) => beforeLesson(p.skillId, at.chapter, at.lesson) && !seen.has(p.prompt) && seen.add(p.prompt))
    .map((p) => ({
      id: null as string | null, skillId: p.skillId, prompt: p.prompt, answer: p.answer, answerKind: p.answerKind, hint: p.hint,
      explanation: p.explanation, source: "textbook" as const, misconceptionId: null as string | null, testPrepId: null as string | null,
    }));
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
    // Following a textbook chapter replaces the regular skill path: the chapter's skills (or its written
    // problems) are the new material, and the rest of the drill reviews what's mastered.
    const all = toStates(await skillRows(student.id, tx));
    const followed = chapter ? all.filter((s) => s.mastered || focus.includes(s.skillId)) : all;
    const skills = chooseDrillSkills(followed.length ? followed : all, student.dailyProblems, focus);

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
    // The class's current lesson gets most of the textbook slots; a few review lessons before it.
    const lessonAt = { chapter: book?.currentChapter ?? 0, lesson: book?.currentLesson ?? 0 };
    const current = queued.filter((q) => chapterPrefix && inLesson(q.p.skillId, lessonAt.chapter, lessonAt.lesson)).map((q) => q.p);
    const leftover = queued.filter((q) => chapterPrefix && beforeLesson(q.p.skillId, lessonAt.chapter, lessonAt.lesson) && q.p.skillId.startsWith(`tb:${book!.id}:`))
      .map((q) => q.p);
    const review = chapterPrefix ? [...leftover, ...(await reviewProblems(student.id, book!.id, lessonAt, tx))] : [];
    // While following a chapter, later lessons' problems wait until the class gets there.
    const other = queued.filter((q) => !q.p.testPrepId && !(chapterPrefix && q.p.skillId.startsWith("tb:"))).map((q) => q.p);
    const daysToQuiz = quiz.length ? Math.round((Date.parse(queued.find((q) => q.quizDate && q.quizDate >= date)!.quizDate!) - Date.parse(date)) / 86_400_000) : 0;
    const lessonCount = textbookShare(skills.length, current.length + review.length, !!chapter?.skillIds.length);
    const split = splitLessonSlots(lessonCount, current.length, review.length);
    const slots = choosePractice(skills.length - split.current - split.review, quiz.length, daysToQuiz, other.length);
    const reviewPicked = spreadByLesson(review).slice(0, split.review);
    const practice = [...reviewPicked, ...current.slice(0, split.current), ...quiz.slice(0, slots.quiz), ...other.slice(0, slots.other)];

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
    // Review problems taken from earlier drills have no practice row to mark.
    const used = practice.flatMap((q) => (q.id ? [q.id] : []));
    if (used.length) {
      await tx.update(schema.practiceProblems).set({ usedAt: new Date() }).where(inArray(schema.practiceProblems.id, used));
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

const PRACTICE_NAMES = { curriculum: "Practice", misconception: "Extra practice", homework: "Like your homework", test_prep: "Quiz prep", textbook: "Textbook practice" } as const;

/** What a problem practices: its skill, its textbook lesson, or the kind of practice it is. */
function topicName(p: { skillId: string; source: keyof typeof PRACTICE_NAMES }, lessons?: Map<string, string>) {
  return SKILLS_BY_ID.get(p.skillId)?.name ?? lessons?.get(p.skillId) ?? PRACTICE_NAMES[p.source];
}

/** Lesson titles for a drill's textbook problems. */
export async function drillLessonNames(problems: { skillId: string }[]) {
  return lessonTitles(problems.map((p) => p.skillId));
}

/** The skills and lessons a drill draws from, most problems first. */
export function drillTopics(problems: { skillId: string; source: keyof typeof PRACTICE_NAMES }[], lessons: Map<string, string>) {
  const counts = new Map<string, { name: string; count: number; fromBook: boolean }>();
  for (const p of problems) {
    const name = topicName(p, lessons);
    const t = counts.get(name) ?? { name, count: 0, fromBook: lessons.has(p.skillId) };
    t.count++;
    counts.set(name, t);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

/** Today's drill if it has been made, without making it. */
export async function todaysDrill(student: Student, timezone: string) {
  const db = await getDb();
  const [drill] = await db.select().from(schema.drills)
    .where(and(eq(schema.drills.studentId, student.id), eq(schema.drills.date, todayFor(timezone))));
  return drill ?? null;
}

/** Public view of a problem: hides the answer until the problem is finished. */
export function problemView(p: typeof schema.drillProblems.$inferSelect, lessons?: Map<string, string>) {
  const done = p.solved !== null;
  return {
    id: p.id, position: p.position, prompt: p.prompt, answerKind: p.answerKind,
    choices: p.choices,
    skillName: topicName(p, lessons),
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
      // Curriculum skills and textbook lessons are tracked; quiz and other written problems have no skill to track.
      const newlyMastered = SKILLS_BY_ID.has(problem.skillId) || parseLessonSkill(problem.skillId)
        ? await recordSkillResult(tx, studentId, problem.skillId, !!updated.firstTryCorrect)
        : false;
      if (problem.source === "misconception" && problem.misconceptionId && updated.firstTryCorrect) {
        await recordTargetedPractice(tx, problem.misconceptionId);
      }
      if (newlyMastered) {
        mastered = SKILLS_BY_ID.get(problem.skillId)?.name ?? (await lessonTitles([problem.skillId], tx)).get(problem.skillId) ?? "a textbook lesson";
      }
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
