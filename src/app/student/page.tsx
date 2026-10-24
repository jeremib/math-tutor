import Link from "next/link";
import { requireStudent } from "@/lib/auth";
import { studentStats } from "@/lib/learning";
import { MasteryBar, Stat } from "@/components/ui";

export default async function StudentHome() {
  const { student, family } = await requireStudent();
  const stats = studentStats(student, family.timezone);
  const learning = stats.skills.filter((s) => !s.masteredAt);
  const recentlyMastered = stats.skills
    .filter((s) => s.masteredAt && s.attempts > 0)
    .sort((a, b) => b.masteredAt!.getTime() - a.masteredAt!.getTime())
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold">Hi, {student.name}! {student.avatar}</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/student/drill" className={`card block transition hover:-translate-y-0.5 ${stats.doneToday ? "" : "ring-2 ring-brand-500"}`}>
          <div className="text-4xl">{stats.doneToday ? "✅" : "🎯"}</div>
          <h2 className="mt-2 text-xl font-bold">{stats.doneToday ? "Today's drill is done!" : "Today's drill"}</h2>
          <p className="text-slate-600">{stats.doneToday ? "Great work. Come back tomorrow for a new set." : `${student.dailyProblems} problems. You've got this!`}</p>
        </Link>
        {student.homeworkEnabled && (
          <Link href="/student/homework" className="card block transition hover:-translate-y-0.5">
            <div className="text-4xl">🧭</div>
            <h2 className="mt-2 text-xl font-bold">Homework help</h2>
            <p className="text-slate-600">Stuck on a problem? Snap a photo and we&apos;ll work through it together.</p>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Day streak" value={`${stats.streak}🔥`} />
        <Stat label="Drills done" value={stats.drillsCompleted} />
        <Stat label="Skills earned" value={`${stats.skillsMastered}⭐`} />
      </div>

      <section className="card">
        <h2 className="mb-3 text-xl font-bold">What you&apos;re learning</h2>
        <ul className="space-y-3">
          {learning.map((s) => (
            <li key={s.skillId}>
              <div className="mb-1 flex justify-between text-sm"><span className="font-semibold">{s.skill!.name}</span><span className="text-slate-500">{Math.round(s.mastery * 100)}%</span></div>
              <MasteryBar value={s.mastery} mastered={false} />
            </li>
          ))}
        </ul>
        {recentlyMastered.length > 0 && (
          <>
            <h3 className="mt-5 mb-2 font-bold">Recently earned ⭐</h3>
            <div className="flex flex-wrap gap-2">
              {recentlyMastered.map((s) => <span key={s.skillId} className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">{s.skill!.name}</span>)}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
