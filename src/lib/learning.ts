import "server-only";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { SKILLS_BY_ID, seededRandom } from "./curriculum";
import { checkAnswer } from "./answers";
import {
  chooseDrillSkills, computeStreak, initialSkills, isMastered, localDate, skillsToUnlock, updateMastery, type SkillState,
} from "./progress";

type Student = typeof schema.students.$inferSelect;

export function seedStudentSkills(studentId: string, grade: number) {
  const now = new Date();
  for (const s of initialSkills(grade)) {
    db.insert(schema.studentSkills).values({
      studentId, skillId: s.skillId, unlockedAt: now,
      // Earlier-grade skills start as assumed knowledge; review drills will reveal gaps.
      mastery: s.mastered ? 0.8 : 0,
      masteredAt: s.mastered ? now : null,
    }).onConflictDoNothing().run();
  }
}

export function skillRows(studentId: string) {
  return db.select().from(schema.studentSkills).where(eq(schema.studentSkills.studentId, studentId)).all();
}

function toStates(rows: ReturnType<typeof skillRows>): SkillState[] {
  return rows.map((r) => ({
    skillId: r.skillId, mastery: r.mastery, attempts: r.attempts,
    mastered: r.masteredAt !== null, lastPracticedAt: r.lastPracticedAt?.getTime() ?? null,
  }));
}

/** Makes sure the student always has skills in progress, unlocking the next ones in the curriculum. */
function unlockNext(studentId: string) {
  for (const skillId of skillsToUnlock(toStates(skillRows(studentId)))) {
    db.insert(schema.studentSkills).values({ studentId, skillId, unlockedAt: new Date() }).onConflictDoNothing().run();
  }
}

export function parseFocus(student: Student): string[] {
  try {
    const ids = JSON.parse(student.focusSkills);
    return Array.isArray(ids) ? ids.filter((id) => typeof id === "string" && SKILLS_BY_ID.has(id)) : [];
  } catch {
    return [];
  }
}

export function todayFor(timezone: string) {
  return localDate(timezone);
}

/** Returns today's drill, creating it on first visit. */
export function getOrCreateDrill(student: Student, timezone: string) {
  const date = todayFor(timezone);
  const existing = db.select().from(schema.drills)
    .where(and(eq(schema.drills.studentId, student.id), eq(schema.drills.date, date))).get();
  if (existing) return existing;

  unlockNext(student.id);
  const focus = parseFocus(student);
  // Focus skills are practiced even if the curriculum hasn't reached them yet.
  for (const skillId of focus) {
    db.insert(schema.studentSkills).values({ studentId: student.id, skillId, unlockedAt: new Date() }).onConflictDoNothing().run();
  }
  const skills = chooseDrillSkills(toStates(skillRows(student.id)), student.dailyProblems, focus);
  const rand = seededRandom(Date.now() ^ student.id.charCodeAt(0));

  return db.transaction((tx) => {
    const raced = tx.select().from(schema.drills)
      .where(and(eq(schema.drills.studentId, student.id), eq(schema.drills.date, date))).get();
    if (raced) return raced;
    const drill = tx.insert(schema.drills).values({ studentId: student.id, date, total: skills.length }).returning().get();
    skills.forEach((skillId, position) => {
      const p = SKILLS_BY_ID.get(skillId)!.generate(rand);
      tx.insert(schema.drillProblems).values({
        drillId: drill.id, position, skillId, prompt: p.prompt, answer: p.answer, answerKind: p.answerKind,
        choices: p.choices ? JSON.stringify(p.choices) : null, hint: p.hint, explanation: p.explanation,
      }).run();
    });
    return drill;
  });
}

export function drillProblems(drillId: string) {
  return db.select().from(schema.drillProblems).where(eq(schema.drillProblems.drillId, drillId))
    .orderBy(asc(schema.drillProblems.position)).all();
}

export const MAX_TRIES = 2;

/** Public view of a problem: hides the answer until the problem is finished. */
export function problemView(p: typeof schema.drillProblems.$inferSelect) {
  const done = p.solved !== null;
  return {
    id: p.id, position: p.position, prompt: p.prompt, answerKind: p.answerKind,
    choices: p.choices ? (JSON.parse(p.choices) as string[]) : null,
    skillName: SKILLS_BY_ID.get(p.skillId)?.name ?? p.skillId,
    tries: p.tries, usedHint: p.usedHint, lastAnswer: p.lastAnswer, done, solved: p.solved,
    hint: p.usedHint || done ? p.hint : null,
    answer: done ? p.answer : null,
    explanation: done ? p.explanation : null,
  };
}

function recordSkillResult(studentId: string, skillId: string, correct: boolean) {
  const row = db.select().from(schema.studentSkills)
    .where(and(eq(schema.studentSkills.studentId, studentId), eq(schema.studentSkills.skillId, skillId))).get();
  const mastery = updateMastery(row?.mastery ?? 0, correct);
  const attempts = (row?.attempts ?? 0) + 1;
  const now = new Date();
  const masteredAt = row?.masteredAt ?? (isMastered(mastery, attempts) ? now : null);
  db.insert(schema.studentSkills).values({
    studentId, skillId, mastery, attempts, correct: (row?.correct ?? 0) + (correct ? 1 : 0),
    unlockedAt: row?.unlockedAt ?? now, masteredAt, lastPracticedAt: now,
  }).onConflictDoUpdate({
    target: [schema.studentSkills.studentId, schema.studentSkills.skillId],
    set: { mastery, attempts, correct: (row?.correct ?? 0) + (correct ? 1 : 0), masteredAt, lastPracticedAt: now },
  }).run();
  const newlyMastered = !row?.masteredAt && masteredAt !== null;
  if (newlyMastered) unlockNext(studentId);
  return newlyMastered;
}

/** Applies a student's answer or hint request to a drill problem. */
export function actOnProblem(studentId: string, problemId: string, action: { type: "answer"; answer: string } | { type: "hint" }) {
  const problem = db.select().from(schema.drillProblems).where(eq(schema.drillProblems.id, problemId)).get();
  if (!problem) return null;
  const drill = db.select().from(schema.drills).where(eq(schema.drills.id, problem.drillId)).get();
  if (!drill || drill.studentId !== studentId) return null;
  if (problem.solved !== null) return { problem: problemView(problem), correct: problem.solved, mastered: null, drillDone: drill.completedAt !== null };

  if (action.type === "hint") {
    const updated = db.update(schema.drillProblems).set({ usedHint: true })
      .where(eq(schema.drillProblems.id, problemId)).returning().get();
    return { problem: problemView(updated), correct: null, mastered: null, drillDone: false };
  }

  const answer = action.answer.slice(0, 50);
  const correct = checkAnswer(problem.answerKind, problem.answer, answer);
  const tries = problem.tries + 1;
  const finished = correct || tries >= MAX_TRIES;
  const updated = db.update(schema.drillProblems).set({
    tries, lastAnswer: answer,
    ...(finished ? {
      solved: correct,
      firstTryCorrect: correct && tries === 1 && !problem.usedHint,
      answeredAt: new Date(),
    } : {}),
  }).where(eq(schema.drillProblems.id, problemId)).returning().get();

  let mastered: string | null = null;
  let drillDone = false;
  if (finished) {
    if (recordSkillResult(studentId, problem.skillId, !!updated.firstTryCorrect)) {
      mastered = SKILLS_BY_ID.get(problem.skillId)?.name ?? problem.skillId;
    }
    const all = drillProblems(drill.id);
    const correctCount = all.filter((p) => p.firstTryCorrect).length;
    drillDone = all.every((p) => p.solved !== null);
    db.update(schema.drills).set({ correctCount, ...(drillDone ? { completedAt: new Date() } : {}) })
      .where(eq(schema.drills.id, drill.id)).run();
  }
  return { problem: problemView(updated), correct, mastered, drillDone };
}

export function studentStats(student: Student, timezone: string) {
  const completed = db.select({ date: schema.drills.date, total: schema.drills.total, correct: schema.drills.correctCount })
    .from(schema.drills).where(and(eq(schema.drills.studentId, student.id), isNotNull(schema.drills.completedAt)))
    .orderBy(desc(schema.drills.date)).all();
  const today = todayFor(timezone);
  const rows = skillRows(student.id);
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
