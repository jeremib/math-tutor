import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireParent } from "@/lib/auth";
import { emailConfigured } from "@/lib/weekly";
import { PendingButton } from "@/components/PendingButton";
import { generateReportNow, setWeeklyEmail } from "./actions";

const friendlyDate = (date: string) =>
  new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function ReportsPage() {
  const { parent, family } = await requireParent();
  const db = await getDb();
  const reports = await db.select().from(schema.weeklyReports).where(eq(schema.weeklyReports.familyId, family.id))
    .orderBy(desc(schema.weeklyReports.weekStart)).limit(12);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">Weekly reports</h1>
          <p className="text-slate-600">A short summary of each child&apos;s week: what went well, what to watch, and one thing to try at home.</p>
        </div>
        <form action={generateReportNow}>
          <PendingButton className="btn" pendingText="Writing…">Write this week&apos;s report now</PendingButton>
        </form>
      </div>

      <form action={setWeeklyEmail} className="card flex flex-wrap items-center justify-between gap-3">
        <input type="hidden" name="on" value={parent.weeklyEmail ? "false" : "true"} />
        <div>
          <div className="font-semibold">Email me the report every week</div>
          <div className="text-sm text-slate-500">
            {parent.weeklyEmail ? `On. Sent to ${parent.email} at the end of each week.` : "Off. Reports still appear here."}
            {!emailConfigured() && " (Email isn't set up on this server yet, so reports only appear here.)"}
          </div>
        </div>
        <button className={parent.weeklyEmail ? "btn-secondary" : "btn"}>{parent.weeklyEmail ? "Turn off" : "Turn on"}</button>
      </form>

      {reports.length === 0 && <p className="text-slate-500">No reports yet. The first one arrives at the end of the week, or write one now.</p>}
      {reports.map((r) => (
        <section key={r.id} className="space-y-3">
          <h2 className="text-lg font-bold text-slate-500">Week of {friendlyDate(r.weekStart)}{r.sentAt ? " · emailed" : ""}</h2>
          {r.report.students.map((s) => (
            <article key={s.studentId} className="card">
              <h3 className="text-xl font-bold">{s.name}</h3>
              <p className="mt-1 text-lg">{s.headline}</p>
              <p className="mt-1 text-sm text-slate-500">
                {s.stats.drills} drills{s.stats.accuracy !== null ? ` · ${s.stats.accuracy}% first-try` : ""} · {s.stats.xp} XP
                {s.stats.homeworkSolved ? ` · ${s.stats.homeworkSolved} homework solved` : ""}{s.stats.racesBest !== null ? ` · best race ${s.stats.racesBest}` : ""}
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {s.wins.length > 0 && (
                  <div>
                    <h4 className="font-bold text-emerald-700">🎉 Wins</h4>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700">{s.wins.map((w) => <li key={w}>{w}</li>)}</ul>
                  </div>
                )}
                {s.watch.length > 0 && (
                  <div>
                    <h4 className="font-bold text-violet-700">🔍 Keep an eye on</h4>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700">{s.watch.map((w) => <li key={w}>{w}</li>)}</ul>
                  </div>
                )}
              </div>
              <p className="mt-4 rounded-xl bg-[#fff6c7] px-4 py-3"><b>🏠 Try at home:</b> {s.tryAtHome}</p>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
