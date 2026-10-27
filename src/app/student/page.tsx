import Link from "next/link";
import { requireStudent } from "@/lib/auth";
import { studentStats } from "@/lib/learning";
import { gameProfile } from "@/lib/achievements";
import { levelTitle } from "@/lib/gamification";
import { MasteryBar, Stat, XpBar } from "@/components/ui";
import { WeekTracker } from "@/components/WeekTracker";
import { localDate } from "@/lib/progress";
import { pendingTeachBacks } from "@/lib/teachback";
import { testPrepsFor } from "@/lib/testprep";
import { textbookProgress } from "@/lib/textbook";
import { BookProgress } from "@/components/BookProgress";

export default async function StudentHome() {
  const { student, family } = await requireStudent();
  const [stats, game, teachBacks, preps, book] = await Promise.all([
    studentStats(student, family.timezone),
    gameProfile(student, family.timezone),
    student.aiEnabled ? pendingTeachBacks(student.id) : [],
    student.aiEnabled ? testPrepsFor(student.id, localDate(family.timezone)) : [],
    textbookProgress(student.id),
  ]);
  const nextQuiz = preps.find((p) => p.upcoming && p.status === "ready");
  const learning = stats.skills.filter((s) => !s.masteredAt);
  const nextReward = game.rewards.find((r) => !r.givenAt);

  return (
    <div className="space-y-6">
      <section className="card flex flex-wrap items-center gap-4">
        <span className="text-6xl">{student.avatar}</span>
        <div className="min-w-48 flex-1">
          <h1 className="text-2xl font-extrabold">Hi, {student.name}!</h1>
          <div className="text-sm font-semibold text-slate-500">Level {game.level} · {levelTitle(game.level)}</div>
          <div className="mt-2"><XpBar into={game.intoLevel} size={game.levelSize} /></div>
          <div className="mt-1 text-xs font-semibold text-slate-500">{game.toNext} XP to level {game.level + 1}</div>
        </div>
        {game.checkInStreak > 1 && (
          <div className="rounded-2xl bg-orange-50 px-4 py-2 text-center ring-1 ring-orange-200">
            <div className="text-2xl font-extrabold text-orange-600">📅 {game.checkInStreak}</div>
            <div className="text-xs font-bold text-orange-700">days in a row</div>
          </div>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/student/drill" className={`card block transition hover:-translate-y-0.5 ${stats.doneToday ? "" : "ring-2 ring-brand-500"}`}>
          <div className="text-4xl">{stats.doneToday ? "✅" : "🎯"}</div>
          <h2 className="mt-2 text-xl font-bold">{stats.doneToday ? "Today's drill is done!" : "Today's drill"}</h2>
          <p className="text-slate-600">{stats.doneToday ? "Great work. Come back tomorrow for a new set." : `${student.dailyProblems} problems · up to ${student.dailyProblems * 10 + 50} XP`}</p>
        </Link>
        {student.aiEnabled && (
          <Link href="/student/homework" className="card block transition hover:-translate-y-0.5">
            <div className="text-4xl">🧭</div>
            <h2 className="mt-2 text-xl font-bold">Homework help</h2>
            <p className="text-slate-600">Stuck on a problem? Snap a photo and we&apos;ll work through it together. +30 XP when you solve it!</p>
          </Link>
        )}
      </div>

      {teachBacks.length > 0 && (
        <section className="card ring-2 ring-violet-200">
          <h2 className="text-xl font-bold">🗣️ Teach it back</h2>
          <p className="mb-3 text-slate-600">Explain it in your own words to lock it in. +15 XP each!</p>
          <ul className="space-y-2">
            {teachBacks.map((t) => (
              <li key={t.id}>
                <Link href={`/student/explain/${t.source}/${t.id}`} className="block rounded-xl bg-violet-50 px-4 py-3 font-semibold text-violet-900 hover:bg-violet-100">{t.question} →</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/student/race" className="card block transition hover:-translate-y-0.5">
          <div className="text-4xl">🏎️</div>
          <h2 className="mt-2 text-xl font-bold">Fact race</h2>
          <p className="text-slate-600">How many facts can you get in 60 seconds? Beat your best!</p>
        </Link>
        {student.aiEnabled && (
          <Link href="/student/quiz" className="card block transition hover:-translate-y-0.5">
            <div className="text-4xl">📝</div>
            <h2 className="mt-2 text-xl font-bold">{nextQuiz ? `${nextQuiz.title || "Quiz"} ${nextQuiz.daysLeft === 0 ? "is today!" : nextQuiz.daysLeft === 1 ? "is tomorrow" : `in ${nextQuiz.daysLeft} days`}` : "Quiz prep"}</h2>
            <p className="text-slate-600">{nextQuiz ? `${nextQuiz.answered} of ${nextQuiz.total} practice problems done.` : "Got a quiz coming up? Snap the study guide and get ready."}</p>
          </Link>
        )}
      </div>

      <section className="card">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-xl font-bold">This week&apos;s goal</h2>
          <span className="text-sm font-semibold text-slate-500">{Math.min(game.weeklyDone, game.weeklyGoal)} / {game.weeklyGoal} drills</span>
        </div>
        <WeekTracker week={game.week} />
        <p className="mt-3 text-sm text-slate-600">
          {game.weeklyDone >= game.weeklyGoal ? "🎉 Goal reached! You earned the weekly bonus." : `Do ${game.weeklyGoal - game.weeklyDone} more drill${game.weeklyGoal - game.weeklyDone === 1 ? "" : "s"} this week for a +50 XP bonus.`}
        </p>
      </section>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Drill streak" value={`${stats.streak}🔥`} />
        <Stat label="Badges" value={`${game.badges.length}🏅`} />
        <Stat label="Skills earned" value={`${stats.skillsMastered}⭐`} />
      </div>

      {nextReward && (
        <section className="card">
          <h2 className="mb-2 text-xl font-bold">🎁 {nextReward.unlocked ? "Reward unlocked!" : "Working toward"}</h2>
          <div className="font-semibold">{nextReward.title}</div>
          {nextReward.unlocked ? (
            <p className="mt-1 text-emerald-700">You did it! Show a grown-up to claim your reward.</p>
          ) : (
            <>
              <div className="mt-2"><XpBar into={game.xp} size={nextReward.xpTarget} /></div>
              <div className="mt-1 text-xs font-semibold text-slate-500">{nextReward.xpTarget - game.xp} XP to go</div>
            </>
          )}
        </section>
      )}

      <section className="card">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-xl font-bold">{book ? `📖 ${book.book.title}` : "What you\u2019re learning"}</h2>
          <Link href="/student/trophies" className="text-sm font-semibold text-brand-600">See trophies →</Link>
        </div>
        {book ? <BookProgress progress={book} forStudent /> : <ul className="space-y-3">
          {learning.map((s) => (
            <li key={s.skillId}>
              <div className="mb-1 flex justify-between text-sm"><span className="font-semibold">{s.skill!.name}</span><span className="text-slate-500">{Math.round(s.mastery * 100)}%</span></div>
              <MasteryBar value={s.mastery} mastered={false} />
            </li>
          ))}
        </ul>}
        {game.badges.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {game.badges.slice(0, 6).map((b) => (
              <span key={b.id} title={b.description} className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">{b.emoji} {b.name}</span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
