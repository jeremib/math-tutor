import "server-only";
import { and, asc, count, desc, eq, gte, isNotNull, sql, sum } from "drizzle-orm";
import { getDb, schema, type Db } from "@/db";
import {
  BADGES_BY_ID, HOMEWORK_XP_PER_DAY, XP, checkInXp, levelInfo, longestStreak, newBadges, streakEndingOn, weekDates, weekStart,
  type BadgeStats,
} from "./gamification";
import { MIN_ATTEMPTS_FOR_MASTERY, localDate } from "./progress";

/** A connection or an open transaction. */
type Tx = Pick<Db, "select" | "insert" | "update" | "delete">;
type XpKind = (typeof schema.xpEvents.$inferInsert)["kind"];

/** What a student just earned, for the celebration UI. */
export type AwardSummary = {
  xp: number;
  totalXp: number;
  level: number;
  leveledUp: boolean;
  badges: { id: string; emoji: string; name: string; description: string }[];
  messages: string[];
};

export async function totalXp(tx: Tx, studentId: string): Promise<number> {
  const [row] = await tx.select({ xp: sum(schema.xpEvents.amount) }).from(schema.xpEvents).where(eq(schema.xpEvents.studentId, studentId));
  return Number(row?.xp ?? 0);
}

/** Records XP once per refKey; returns the amount actually awarded (0 if already given). */
async function awardXp(tx: Tx, studentId: string, kind: XpKind, refKey: string, amount: number, date: string): Promise<number> {
  if (amount <= 0) return 0;
  const inserted = await tx.insert(schema.xpEvents).values({ studentId, kind, refKey, amount, date })
    .onConflictDoNothing().returning({ id: schema.xpEvents.id });
  return inserted.length ? amount : 0;
}

async function badgeStats(tx: Tx, studentId: string, xp: number): Promise<BadgeStats> {
  const s = schema;
  const [drills, hintFree, correct, mastered, homework, weekly, drillDates, checkIns] = await Promise.all([
    tx.select({
      completed: count(),
      perfect: sql<number>`count(*) filter (where ${s.drills.correctCount} = ${s.drills.total})`.mapWith(Number),
    }).from(s.drills).where(and(eq(s.drills.studentId, studentId), isNotNull(s.drills.completedAt))),
    tx.select({ n: count() }).from(s.drills).where(and(
      eq(s.drills.studentId, studentId), isNotNull(s.drills.completedAt),
      sql`not exists (select 1 from ${s.drillProblems} where ${s.drillProblems.drillId} = ${s.drills.id} and ${s.drillProblems.usedHint})`,
    )),
    tx.select({ n: count() }).from(s.drillProblems).innerJoin(s.drills, eq(s.drills.id, s.drillProblems.drillId))
      .where(and(eq(s.drills.studentId, studentId), eq(s.drillProblems.firstTryCorrect, true))),
    tx.select({ n: count() }).from(s.studentSkills)
      .where(and(eq(s.studentSkills.studentId, studentId), isNotNull(s.studentSkills.masteredAt), gte(s.studentSkills.attempts, MIN_ATTEMPTS_FOR_MASTERY))),
    tx.select({ n: count() }).from(s.homeworkSessions)
      .where(and(eq(s.homeworkSessions.studentId, studentId), eq(s.homeworkSessions.status, "solved"))),
    tx.select({ n: count() }).from(s.xpEvents).where(and(eq(s.xpEvents.studentId, studentId), eq(s.xpEvents.kind, "weekly_goal"))),
    tx.select({ date: s.drills.date }).from(s.drills).where(and(eq(s.drills.studentId, studentId), isNotNull(s.drills.completedAt))),
    tx.select({ date: s.xpEvents.date }).from(s.xpEvents).where(and(eq(s.xpEvents.studentId, studentId), eq(s.xpEvents.kind, "check_in"))),
  ]);
  return {
    drillsCompleted: drills[0].completed,
    perfectDrills: drills[0].perfect,
    hintFreeDrills: hintFree[0].n,
    bestStreak: longestStreak(drillDates.map((d) => d.date)),
    bestCheckInStreak: longestStreak(checkIns.map((d) => d.date)),
    problemsCorrect: correct[0].n,
    skillsMastered: mastered[0].n,
    homeworkSolved: homework[0].n,
    weeklyGoalsMet: weekly[0].n,
    level: levelInfo(xp).level,
  };
}

/** Awards any newly earned badges and builds the summary for what was just gained. */
async function summarize(tx: Tx, studentId: string, xpBefore: number, gained: number, messages: string[]): Promise<AwardSummary> {
  const xpAfter = xpBefore + gained;
  const earned = new Set((await tx.select({ id: schema.studentBadges.badgeId }).from(schema.studentBadges)
    .where(eq(schema.studentBadges.studentId, studentId))).map((b) => b.id));
  const fresh = newBadges(await badgeStats(tx, studentId, xpAfter), earned);
  if (fresh.length) {
    await tx.insert(schema.studentBadges).values(fresh.map((b) => ({ studentId, badgeId: b.id }))).onConflictDoNothing();
  }
  const before = levelInfo(xpBefore).level;
  const after = levelInfo(xpAfter).level;
  return {
    xp: gained, totalXp: xpAfter, level: after, leveledUp: after > before, messages,
    badges: fresh.map(({ id, emoji, name, description }) => ({ id, emoji, name, description })),
  };
}

/** Awards XP for a finished drill problem, and for the drill itself when it was the last one. */
export async function awardForProblem(tx: Tx, args: {
  studentId: string; timezone: string; problemId: string; solved: boolean; firstTry: boolean;
  masteredSkill: string | null; drill: { id: string; total: number; correctCount: number; done: boolean };
}): Promise<AwardSummary> {
  const { studentId, problemId, drill } = args;
  const date = localDate(args.timezone);
  const before = await totalXp(tx, studentId);
  const messages: string[] = [];
  let gained = 0;

  if (args.solved) {
    gained += await awardXp(tx, studentId, "problem", `problem:${problemId}`, args.firstTry ? XP.firstTryCorrect : XP.secondTryCorrect, date);
  }
  if (args.masteredSkill) {
    const got = await awardXp(tx, studentId, "mastery", `mastery:${args.masteredSkill}`, XP.skillMastered, date);
    if (got) messages.push(`Skill mastered +${got} XP`);
    gained += got;
  }
  if (drill.done) {
    const got = await awardXp(tx, studentId, "drill", `drill:${drill.id}`, XP.drillComplete, date);
    if (got) messages.push(`Drill complete +${got} XP`);
    gained += got;
    if (drill.correctCount === drill.total) {
      const bonus = await awardXp(tx, studentId, "perfect_drill", `perfect:${drill.id}`, XP.perfectDrill, date);
      if (bonus) messages.push(`Perfect score bonus +${bonus} XP`);
      gained += bonus;
    }
    gained += await checkWeeklyGoal(tx, studentId, date, messages);
  }
  return summarize(tx, studentId, before, gained, messages);
}

async function checkWeeklyGoal(tx: Tx, studentId: string, date: string, messages: string[]): Promise<number> {
  const [student] = await tx.select({ goal: schema.students.weeklyGoal }).from(schema.students).where(eq(schema.students.id, studentId));
  const week = weekDates(date);
  const [row] = await tx.select({ n: count() }).from(schema.drills).where(and(
    eq(schema.drills.studentId, studentId), isNotNull(schema.drills.completedAt),
    gte(schema.drills.date, week[0]), sql`${schema.drills.date} <= ${week[6]}`,
  ));
  if (!student || row.n < student.goal) return 0;
  const got = await awardXp(tx, studentId, "weekly_goal", `week:${week[0]}`, XP.weeklyGoal, date);
  if (got) messages.push(`Weekly goal reached +${got} XP`);
  return got;
}

/** Awards XP when the tutor confirms a homework problem was solved, up to a daily cap. */
export async function awardForHomework(studentId: string, timezone: string, sessionId: string): Promise<AwardSummary> {
  const db = await getDb();
  const date = localDate(timezone);
  return db.transaction(async (tx) => {
    const before = await totalXp(tx, studentId);
    const [today] = await tx.select({ n: count() }).from(schema.xpEvents).where(and(
      eq(schema.xpEvents.studentId, studentId), eq(schema.xpEvents.kind, "homework"), eq(schema.xpEvents.date, date),
    ));
    const messages: string[] = [];
    let gained = 0;
    if (today.n < HOMEWORK_XP_PER_DAY) {
      gained = await awardXp(tx, studentId, "homework", `homework:${sessionId}`, XP.homeworkSolved, date);
      if (gained) messages.push(`Homework solved +${gained} XP`);
    }
    return summarize(tx, studentId, before, gained, messages);
  });
}

/** The once-a-day check-in reward. Returns null if the student already checked in today. */
export async function dailyCheckIn(studentId: string, timezone: string): Promise<(AwardSummary & { streak: number }) | null> {
  const db = await getDb();
  const date = localDate(timezone);
  return db.transaction(async (tx) => {
    const dates = (await tx.select({ date: schema.xpEvents.date }).from(schema.xpEvents)
      .where(and(eq(schema.xpEvents.studentId, studentId), eq(schema.xpEvents.kind, "check_in")))).map((d) => d.date);
    if (dates.includes(date)) return null;
    const streak = streakEndingOn([...dates, date], date);
    const before = await totalXp(tx, studentId);
    const gained = await awardXp(tx, studentId, "check_in", `check_in:${date}`, checkInXp(streak), date);
    if (!gained) return null;
    const summary = await summarize(tx, studentId, before, gained, [
      streak > 1 ? `Day ${streak} check-in streak! +${gained} XP` : `Daily check-in +${gained} XP`,
    ]);
    return { ...summary, streak };
  });
}

/** Everything the student and parent screens show about XP, badges, goals and rewards. */
export async function gameProfile(student: { id: string; weeklyGoal: number }, timezone: string) {
  const db = await getDb();
  const today = localDate(timezone);
  const week = weekDates(today);
  const [xp, badges, drillDates, checkIns, rewardRows, weekXp] = await Promise.all([
    totalXp(db, student.id),
    db.select().from(schema.studentBadges).where(eq(schema.studentBadges.studentId, student.id)).orderBy(desc(schema.studentBadges.earnedAt)),
    db.select({ date: schema.drills.date }).from(schema.drills)
      .where(and(eq(schema.drills.studentId, student.id), isNotNull(schema.drills.completedAt), gte(schema.drills.date, week[0]))),
    db.select({ date: schema.xpEvents.date }).from(schema.xpEvents)
      .where(and(eq(schema.xpEvents.studentId, student.id), eq(schema.xpEvents.kind, "check_in"))),
    db.select().from(schema.rewards).where(eq(schema.rewards.studentId, student.id)).orderBy(asc(schema.rewards.xpTarget)),
    db.select({ xp: sum(schema.xpEvents.amount) }).from(schema.xpEvents)
      .where(and(eq(schema.xpEvents.studentId, student.id), gte(schema.xpEvents.date, weekStart(today)))),
  ]);
  const doneDays = new Set(drillDates.map((d) => d.date));
  const checkInDates = checkIns.map((c) => c.date);
  return {
    ...levelInfo(xp),
    xpThisWeek: Number(weekXp[0]?.xp ?? 0),
    badges: badges.flatMap((b) => {
      const def = BADGES_BY_ID.get(b.badgeId);
      return def ? [{ ...def, earnedAt: b.earnedAt }] : [];
    }),
    week: week.map((date) => ({ date, done: doneDays.has(date), isToday: date === today, future: date > today })),
    weeklyGoal: student.weeklyGoal,
    weeklyDone: doneDays.size,
    checkedInToday: checkInDates.includes(today),
    checkInStreak: streakEndingOn(checkInDates, today),
    rewards: rewardRows.map((r) => ({ ...r, unlocked: xp >= r.xpTarget })),
  };
}
