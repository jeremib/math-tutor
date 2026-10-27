import "server-only";
import { and, eq, gte, isNotNull, lt, lte, max, sql, sum } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import type { WeeklyReport } from "@/db/schema";
import { GRADE_LABELS, SKILLS_BY_ID } from "./curriculum";
import { askStructured } from "./ai";
import { localDate } from "./progress";
import { reportWeek, weekDates } from "./gamification";
import { renderReportEmail } from "./report-email";

/** Facts about one student's week, from the family's local dates. */
async function weekFacts(student: typeof schema.students.$inferSelect, week: string[]) {
  const db = await getDb();
  const [from, to] = [week[0], week[6]];
  // Timestamps are compared against UTC day bounds, close enough for a weekly summary.
  const start = new Date(from + "T00:00:00Z"), end = new Date(Date.parse(to + "T00:00:00Z") + 86_400_000);
  const id = student.id;
  const s = schema;
  const [drills, xp, mastered, found, fixed, homework, races, explained, preps] = await Promise.all([
    db.select({ total: s.drills.total, correct: s.drills.correctCount }).from(s.drills)
      .where(and(eq(s.drills.studentId, id), isNotNull(s.drills.completedAt), gte(s.drills.date, from), lte(s.drills.date, to))),
    db.select({ xp: sum(s.xpEvents.amount) }).from(s.xpEvents).where(and(eq(s.xpEvents.studentId, id), gte(s.xpEvents.date, from), lte(s.xpEvents.date, to))),
    db.select({ skillId: s.studentSkills.skillId }).from(s.studentSkills)
      .where(and(eq(s.studentSkills.studentId, id), gte(s.studentSkills.masteredAt, start), lt(s.studentSkills.masteredAt, end), gte(s.studentSkills.attempts, 1))),
    db.select({ label: s.misconceptions.label, resolvedAt: s.misconceptions.resolvedAt }).from(s.misconceptions)
      .where(and(eq(s.misconceptions.studentId, id), gte(s.misconceptions.lastSeenAt, start), lt(s.misconceptions.lastSeenAt, end))),
    db.select({ label: s.misconceptions.label }).from(s.misconceptions)
      .where(and(eq(s.misconceptions.studentId, id), gte(s.misconceptions.resolvedAt, start), lt(s.misconceptions.resolvedAt, end))),
    db.select({ title: s.homeworkSessions.title, status: s.homeworkSessions.status, skillId: s.homeworkSessions.skillId }).from(s.homeworkSessions)
      .where(and(eq(s.homeworkSessions.studentId, id), gte(s.homeworkSessions.createdAt, start), lt(s.homeworkSessions.createdAt, end))),
    db.select({ op: s.factRaces.op, best: max(s.factRaces.correct) }).from(s.factRaces)
      .where(and(eq(s.factRaces.studentId, id), gte(s.factRaces.finishedAt, start), lt(s.factRaces.finishedAt, end))).groupBy(s.factRaces.op),
    db.select({ verdict: s.explanations.verdict, answer: s.explanations.answer }).from(s.explanations)
      .where(and(eq(s.explanations.studentId, id), gte(s.explanations.createdAt, start), lt(s.explanations.createdAt, end))),
    db.select({ title: s.testPreps.title, quizDate: s.testPreps.quizDate }).from(s.testPreps)
      .where(and(eq(s.testPreps.studentId, id), gte(s.testPreps.quizDate, from), sql`${s.testPreps.quizDate} <= (${to}::date + 7)::text`)),
  ]);
  const problems = drills.reduce((n, d) => n + d.total, 0);
  const right = drills.reduce((n, d) => n + d.correct, 0);
  const masteredNames = mastered.map((m) => SKILLS_BY_ID.get(m.skillId)?.name).filter((n): n is string => !!n);
  return {
    stats: {
      drills: drills.length,
      accuracy: problems ? Math.round((100 * right) / problems) : null,
      xp: Number(xp[0]?.xp ?? 0),
      mastered: masteredNames,
      homeworkSolved: homework.filter((h) => h.status === "solved").length,
      racesBest: races.length ? Math.max(...races.map((r) => r.best ?? 0)) : null,
    },
    weeklyGoal: student.weeklyGoal,
    mistakesSeen: found.filter((m) => !m.resolvedAt).map((m) => m.label),
    mistakesFixed: fixed.map((m) => m.label),
    homework: homework.map((h) => ({ title: h.title, solved: h.status === "solved", skill: SKILLS_BY_ID.get(h.skillId ?? "")?.name ?? null })),
    explanations: explained.map((e) => ({ verdict: e.verdict, answer: e.answer.slice(0, 200) })),
    quizzes: preps.map((p) => ({ title: p.title || "Quiz", date: p.quizDate })),
  };
}

const ReportSchema = z.object({
  students: z.array(z.object({
    studentId: z.string(),
    headline: z.string().describe("One warm, specific sentence summing up the week."),
    wins: z.array(z.string()).describe("Up to 3 specific things that went well. Name skills and numbers."),
    watch: z.array(z.string()).describe("Up to 2 things to keep an eye on, in plain words. Empty if nothing stands out."),
    tryAtHome: z.string().describe("One concrete, 5-minute activity a parent can do at home this week that targets something above, like a dinner-table question or a kitchen activity."),
  })),
});

/** A plain report from the numbers alone, used when Claude isn't available. */
function plainSummary(name: string, f: Awaited<ReturnType<typeof weekFacts>>) {
  const wins = [
    ...f.stats.mastered.map((m) => `Mastered ${m}`),
    ...f.mistakesFixed.map((m) => `Fixed a mistake pattern: ${m}`),
    ...(f.stats.homeworkSolved ? [`Solved ${f.stats.homeworkSolved} homework problem${f.stats.homeworkSolved === 1 ? "" : "s"}`] : []),
  ].slice(0, 3);
  return {
    headline: f.stats.drills ? `${name} did ${f.stats.drills} drill${f.stats.drills === 1 ? "" : "s"} this week.` : `${name} didn't do any drills this week.`,
    wins,
    watch: f.mistakesSeen.slice(0, 2),
    tryAtHome: "Ask them to explain how they'd solve a problem from this week, out loud, while you listen.",
  };
}

/** Builds (or rebuilds, if not yet sent) a family's report for the week starting `monday`. */
export async function buildWeeklyReport(familyId: string, monday: string) {
  const db = await getDb();
  const students = await db.select().from(schema.students).where(eq(schema.students.familyId, familyId));
  const week = weekDates(monday);
  const facts = await Promise.all(students.map(async (st) => ({ student: st, facts: await weekFacts(st, week) })));

  let written: z.infer<typeof ReportSchema> | null = null;
  if (facts.length) {
    try {
      written = await askStructured({
        system: "You write a short weekly progress note for parents about their children's math practice in Math Buddy, a tutoring app with daily drills, a homework helper, fact races and quiz prep. Be warm, specific and honest: use the numbers and skill names given, celebrate real progress, and flag concerns gently. A week with little practice should say so kindly. Don't invent facts. Write for busy parents: short and concrete.",
        schema: ReportSchema,
        effort: "medium",
        content: [{ type: "text", text: JSON.stringify(facts.map(({ student, facts }) => ({
          studentId: student.id, name: student.name, grade: GRADE_LABELS[student.grade], ...facts,
        }))) }],
      });
    } catch (error) {
      console.error("weekly report writing failed; using the plain summary", error);
    }
  }

  const report: WeeklyReport = {
    students: facts.map(({ student, facts: f }) => {
      const w = written?.students.find((x) => x.studentId === student.id);
      const text = w
        ? { headline: w.headline.trim(), wins: w.wins.slice(0, 3), watch: w.watch.slice(0, 2), tryAtHome: w.tryAtHome.trim() }
        : plainSummary(student.name, f);
      return { studentId: student.id, name: student.name, stats: f.stats, ...text };
    }),
  };
  const [row] = await db.insert(schema.weeklyReports).values({ familyId, weekStart: monday, report })
    .onConflictDoUpdate({
      target: [schema.weeklyReports.familyId, schema.weeklyReports.weekStart],
      set: { report, createdAt: new Date() },
      // A report that has already gone out stays as sent.
      setWhere: sql`${schema.weeklyReports.sentAt} is null`,
    }).returning();
  return row ?? (await db.select().from(schema.weeklyReports)
    .where(and(eq(schema.weeklyReports.familyId, familyId), eq(schema.weeklyReports.weekStart, monday))))[0];
}

export const emailConfigured = () => !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

/** Sends one email through Resend. Returns false (and logs) on failure. */
async function sendEmail(msg: { to: string; subject: string; html: string; text: string }): Promise<boolean> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
  }).catch((error) => {
    console.error("email send failed", error);
    return null;
  });
  if (!res?.ok) console.error("email send failed", res?.status, await res?.text().catch(() => ""));
  return !!res?.ok;
}

/** Emails a report to the family's parents who want it, and marks it sent. */
export async function sendWeeklyReport(reportId: string) {
  const db = await getDb();
  const [row] = await db.select({ report: schema.weeklyReports, family: schema.families }).from(schema.weeklyReports)
    .innerJoin(schema.families, eq(schema.families.id, schema.weeklyReports.familyId))
    .where(eq(schema.weeklyReports.id, reportId));
  if (!row || row.report.sentAt || !emailConfigured()) return 0;
  const parents = await db.select().from(schema.parents)
    .where(and(eq(schema.parents.familyId, row.family.id), eq(schema.parents.weeklyEmail, true)));
  const email = renderReportEmail(row.report.report, {
    familyName: row.family.name, weekStart: row.report.weekStart, appUrl: process.env.APP_URL ?? "http://localhost:3000",
  });
  const results = await Promise.all(parents.map((p) => sendEmail({ to: p.email, ...email })));
  const sent = results.filter(Boolean).length;
  if (sent === parents.length) {
    await db.update(schema.weeklyReports).set({ sentAt: new Date() }).where(eq(schema.weeklyReports.id, reportId));
  }
  return sent;
}

/** The weekly job: build and send each family's report for the week just ending. Safe to run more than once. */
export async function runWeeklyReports() {
  const db = await getDb();
  const families = await db.select().from(schema.families);
  let built = 0, emailed = 0, failed = 0;
  for (const family of families) {
    try {
      const report = await buildWeeklyReport(family.id, reportWeek(localDate(family.timezone)));
      if (report.sentAt) continue;
      built++;
      emailed += await sendWeeklyReport(report.id);
    } catch (error) {
      failed++;
      console.error(`weekly report failed for family ${family.id}`, error);
    }
  }
  return { families: families.length, built, emailed, failed, emailConfigured: emailConfigured() };
}
