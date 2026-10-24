import "server-only";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { getDb, schema, type Db } from "@/db";
import { SKILLS_BY_ID, seededRandom } from "./curriculum";
import { checkAnswer } from "./answers";
import {
  chooseDrillSkills, computeStreak, initialSkills, isMastered, localDate, skillsToUnlock, updateMastery, type SkillState,
} from "./progress";

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

  return db.transaction(async (tx) => {
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

    const rand = seededRandom(Date.now() ^ student.id.charCodeAt(0));
    await tx.insert(schema.drillProblems).values(skills.map((skillId, position) => {
      const p = SKILLS_BY_ID.get(skillId)!.generate(rand);
      return {
        drillId: drill.id, position, skillId, prompt: p.prompt, answer: p.answer, answerKind: p.answerKind,
        choices: p.choices ?? null, hint: p.hint, explanation: p.explanation,
      };
    }));
    return drill;
  });
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
    skillName: SKILLS_BY_ID.get(p.skillId)?.name ?? p.skillId,
    tries: p.tries, usedHint: p.usedHint, lastAnswer: p.lastAnswer, done, solved: p.solved,
    hint: p.usedHint || done ? p.hint : null,
    answer: done ? p.answer : null,
    explanation: done ? p.explanation : null,
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
  await tx.insert(schema.studentSkills).values({
    studentId, skillId, mastery, attempts, correct: correctTotal, masteredAt, lastPracticedAt: now,
  }).onConflictDoUpdate({
    target: [schema.studentSkills.studentId, schema.studentSkills.skillId],
    set: { mastery, attempts, correct: correctTotal, masteredAt, lastPracticedAt: now },
  });
  const newlyMastered = !row?.masteredAt && masteredAt !== null;
  if (newlyMastered) await unlockNext(studentId, tx);
  return newlyMastered;
}

/** Applies a student's answer or hint request to a drill problem. */
export async function actOnProblem(studentId: string, problemId: string, action: { type: "answer"; answer: string } | { type: "hint" }) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    // Lock the problem so a double-tapped "Check" can't be counted twice.
    const [found] = await tx.select({ problem: schema.drillProblems, drill: schema.drills })
      .from(schema.drillProblems).innerJoin(schema.drills, eq(schema.drills.id, schema.drillProblems.drillId))
      .where(eq(schema.drillProblems.id, problemId)).for("update");
    if (!found || found.drill.studentId !== studentId) return null;
    const { problem, drill } = found;
    if (problem.solved !== null) return { problem: problemView(problem), correct: problem.solved, mastered: null, drillDone: drill.completedAt !== null };

    if (action.type === "hint") {
      const [updated] = await tx.update(schema.drillProblems).set({ usedHint: true })
        .where(eq(schema.drillProblems.id, problemId)).returning();
      return { problem: problemView(updated), correct: null, mastered: null, drillDone: false };
    }

    const answer = action.answer.slice(0, 50);
    const correct = checkAnswer(problem.answerKind, problem.answer, answer);
    const tries = problem.tries + 1;
    const finished = correct || tries >= MAX_TRIES;
    const [updated] = await tx.update(schema.drillProblems).set({
      tries, lastAnswer: answer,
      ...(finished ? {
        solved: correct,
        firstTryCorrect: correct && tries === 1 && !problem.usedHint,
        answeredAt: new Date(),
      } : {}),
    }).where(eq(schema.drillProblems.id, problemId)).returning();

    let mastered: string | null = null;
    let drillDone = false;
    if (finished) {
      if (await recordSkillResult(tx, studentId, problem.skillId, !!updated.firstTryCorrect)) {
        mastered = SKILLS_BY_ID.get(problem.skillId)?.name ?? problem.skillId;
      }
      const all = await drillProblems(drill.id, tx);
      const correctCount = all.filter((p) => p.firstTryCorrect).length;
      drillDone = all.every((p) => p.solved !== null);
      await tx.update(schema.drills).set({ correctCount, ...(drillDone ? { completedAt: new Date() } : {}) })
        .where(eq(schema.drills.id, drill.id));
    }
    return { problem: problemView(updated), correct, mastered, drillDone };
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
    skillsMastered: rows.filter((r) => r.masteredAt && r.attempts > 0).length,
    skills: rows
      .map((r) => ({ ...r, skill: SKILLS_BY_ID.get(r.skillId) }))
      .filter((r) => r.skill)
      .sort((a, b) => a.skill!.grade - b.skill!.grade),
  };
}
