import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { familyStudent, requireParent } from "@/lib/auth";
import { GRADE_LABELS, SKILLS, SKILLS_BY_ID } from "@/lib/curriculum";
import { parseFocus, studentStats } from "@/lib/learning";
import { gameProfile } from "@/lib/achievements";
import { levelTitle } from "@/lib/gamification";
import { earnedMastery } from "@/lib/progress";
import { WeekTracker } from "@/components/WeekTracker";
import { ActionForm } from "@/components/ActionForm";
import { MasteryBar, Stat, XpBar } from "@/components/ui";
import { addReward, deleteReward, deleteStudent, markRewardGiven, updateStudent } from "../../actions";

export default async function StudentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { family } = await requireParent();
  const student = await familyStudent(family.id, id);
  if (!student) notFound();

  const db = await getDb();
  const focus = new Set(parseFocus(student));
  const [stats, game, homework, misses] = await Promise.all([
    studentStats(student, family.timezone),
    gameProfile(student, family.timezone),
    db.select().from(schema.homeworkSessions).where(eq(schema.homeworkSessions.studentId, student.id))
    .orderBy(desc(schema.homeworkSessions.updatedAt)).limit(20),
    db.select({ p: schema.drillProblems, date: schema.drills.date })
    .from(schema.drillProblems).innerJoin(schema.drills, eq(schema.drills.id, schema.drillProblems.drillId))
    .where(and(eq(schema.drills.studentId, student.id), eq(schema.drillProblems.firstTryCorrect, false)))
    .orderBy(desc(schema.drillProblems.answeredAt)).limit(8),
  ]);

  const byGrade = new Map<number, typeof stats.skills>();
  for (const s of stats.skills) byGrade.set(s.skill!.grade, [...(byGrade.get(s.skill!.grade) ?? []), s]);

  return (
    <div className="space-y-6">
      <Link href="/parent" className="text-sm font-semibold text-brand-600">← All students</Link>
      <div className="flex items-center gap-4">
        <span className="text-5xl">{student.avatar}</span>
        <div>
          <h1 className="text-3xl font-extrabold">{student.name}</h1>
          <p className="text-slate-600">{GRADE_LABELS[student.grade]} · logs in as <b>@{student.username}</b> with family code <b>{family.code}</b></p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Day streak" value={`${stats.streak}🔥`} />
        <Stat label="Drills done" value={stats.drillsCompleted} />
        <Stat label="First-try accuracy" value={stats.accuracy === null ? "–" : `${stats.accuracy}%`} />
        <Stat label="Skills mastered" value={stats.skillsMastered} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-bold">Level {game.level} <span className="text-base font-semibold text-slate-500">· {levelTitle(game.level)}</span></h2>
            <span className="text-sm font-semibold text-amber-700">{game.xp} XP · {game.xpThisWeek} this week</span>
          </div>
          <div className="mt-2"><XpBar into={game.intoLevel} size={game.levelSize} /></div>
          <h3 className="mt-5 mb-2 font-bold">This week · {game.weeklyDone}/{game.weeklyGoal} drills</h3>
          <WeekTracker week={game.week} />
          <h3 className="mt-5 mb-2 font-bold">Badges ({game.badges.length})</h3>
          {game.badges.length ? (
            <div className="flex flex-wrap gap-2">
              {game.badges.map((b) => (
                <span key={b.id} title={`${b.description} · ${b.earnedAt.toLocaleDateString()}`} className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">{b.emoji} {b.name}</span>
              ))}
            </div>
          ) : <p className="text-sm text-slate-500">No badges yet. The first one comes with the first finished drill.</p>}
        </section>

        <section className="card">
          <h2 className="text-xl font-bold">🎁 Rewards</h2>
          <p className="mb-4 text-sm text-slate-500">Set a real-world reward {student.name} can earn with XP. A typical day of practice earns about 80–120 XP.</p>
          {game.rewards.length > 0 && (
            <ul className="mb-4 space-y-3">
              {game.rewards.map((r) => (
                <li key={r.id} className="rounded-xl bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{r.title}</span>
                    <span className={`text-sm font-semibold ${r.givenAt ? "text-slate-400" : r.unlocked ? "text-emerald-600" : "text-slate-500"}`}>
                      {r.givenAt ? `Given ${r.givenAt.toLocaleDateString()}` : r.unlocked ? "Earned! 🎉" : `${r.xpTarget - game.xp} XP to go`}
                    </span>
                  </div>
                  {!r.unlocked && <div className="mt-2"><XpBar into={game.xp} size={r.xpTarget} /></div>}
                  <div className="mt-2 flex gap-3 text-sm">
                    {r.unlocked && !r.givenAt && (
                      <form action={markRewardGiven}><input type="hidden" name="rewardId" value={r.id} /><button className="font-semibold text-emerald-700 hover:underline">Mark as given</button></form>
                    )}
                    <form action={deleteReward}><input type="hidden" name="rewardId" value={r.id} /><button className="font-semibold text-slate-500 hover:underline">Remove</button></form>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <ActionForm action={addReward} submit="Add reward" resetOnSuccess successText="Reward added!">
            <input type="hidden" name="studentId" value={student.id} />
            <div className="grid grid-cols-[1fr_8rem] gap-2">
              <div>
                <label className="label" htmlFor="rewardTitle">Reward</label>
                <input id="rewardTitle" name="title" className="input" placeholder="Pick Friday's movie" required />
              </div>
              <div>
                <label className="label" htmlFor="xpNeeded">XP from now</label>
                <input id="xpNeeded" name="xpNeeded" type="number" min={10} step={10} defaultValue={500} className="input" required />
              </div>
            </div>
          </ActionForm>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="card lg:col-span-3">
          <h2 className="text-xl font-bold">Skills</h2>
          <p className="mb-4 text-sm text-slate-500">Green skills are mastered. Earlier-grade skills start as mastered and are reviewed in drills; any gaps will show up here.</p>
          {[...byGrade.entries()].sort((a, b) => b[0] - a[0]).map(([grade, skills]) => (
            <div key={grade} className="mb-5">
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">{GRADE_LABELS[grade]}</h3>
              <ul className="space-y-2">
                {skills.map((s) => (
                  <li key={s.skillId} className="grid grid-cols-[1fr_8rem] items-center gap-3">
                    <div>
                      <div className="font-semibold">{s.skill!.name} {earnedMastery(s.masteredAt, s.attempts) ? "⭐" : ""}</div>
                      <div className="text-xs text-slate-500">{s.attempts ? `${s.correct}/${s.attempts} first-try correct` : s.masteredAt ? "Assumed from earlier grade" : "Not practiced yet"}</div>
                    </div>
                    <MasteryBar value={s.mastery} mastered={!!s.masteredAt} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <div className="space-y-6 lg:col-span-2">
          <section className="card">
            <h2 className="mb-3 text-xl font-bold">Recent drills</h2>
            {stats.recentDrills.length ? (
              <ul className="space-y-1 text-sm">
                {stats.recentDrills.map((d) => (
                  <li key={d.date} className="flex justify-between"><span>{d.date}</span><span className="font-semibold">{d.correct}/{d.total}</span></li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">No drills completed yet.</p>}
          </section>

          <section className="card">
            <h2 className="mb-3 text-xl font-bold">Recent misses</h2>
            {misses.length ? (
              <ul className="space-y-2 text-sm">
                {misses.map(({ p, date }) => (
                  <li key={p.id} className="rounded-lg bg-slate-50 p-2">
                    <div className="font-semibold">{p.prompt}</div>
                    <div className="text-slate-500">
                      Answered {p.lastAnswer ?? "–"} · correct: {p.answer} · {SKILLS_BY_ID.get(p.skillId)?.name} · {date}
                      {p.usedHint ? " · used hint" : ""}
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">Nothing missed recently. 🎉</p>}
          </section>

          <section className="card">
            <h2 className="mb-3 text-xl font-bold">Homework help</h2>
            {homework.length ? (
              <ul className="space-y-2 text-sm">
                {homework.map((h) => (
                  <li key={h.id}>
                    <Link href={`/parent/students/${student.id}/homework/${h.id}`} className="flex justify-between gap-2 rounded-lg p-2 hover:bg-slate-50">
                      <span className="truncate font-semibold">{h.title}</span>
                      <span className={h.status === "solved" ? "text-emerald-600" : "text-slate-400"}>{h.status === "solved" ? "Solved" : h.updatedAt.toLocaleDateString()}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">No homework sessions yet.</p>}
          </section>
        </div>
      </div>

      <section className="card">
        <h2 className="mb-4 text-xl font-bold">Settings</h2>
        <ActionForm action={updateStudent} submit="Save settings" successText="Saved!">
          <input type="hidden" name="studentId" value={student.id} />
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <label className="label" htmlFor="dailyProblems">Problems per daily drill</label>
              <input id="dailyProblems" name="dailyProblems" type="number" min={3} max={30} defaultValue={student.dailyProblems} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="weeklyGoal">Weekly goal (drill days)</label>
              <input id="weeklyGoal" name="weeklyGoal" type="number" min={1} max={7} defaultValue={student.weeklyGoal} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="grade">Grade</label>
              <select id="grade" name="grade" defaultValue={student.grade} className="input">
                {Object.entries(GRADE_LABELS).map(([g, label]) => <option key={g} value={g}>{label}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="newPin">New PIN (leave blank to keep)</label>
              <input id="newPin" name="newPin" inputMode="numeric" pattern="\d{4,8}" className="input" />
            </div>
          </div>
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" name="homeworkEnabled" defaultChecked={student.homeworkEnabled} className="h-4 w-4" />
            Allow homework helper
          </label>
          <fieldset>
            <legend className="label">Focus skills (up to 5) — these make up most of each drill, e.g. to match what&apos;s being taught at school right now</legend>
            <div className="max-h-72 overflow-y-auto rounded-xl p-3 ring-1 ring-slate-200">
              {Object.entries(GRADE_LABELS).map(([g, label]) => (
                <div key={g} className="mb-2">
                  <div className="text-xs font-bold uppercase text-slate-400">{label}</div>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {SKILLS.filter((s) => s.grade === Number(g)).map((s) => (
                      <label key={s.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="focus" value={s.id} defaultChecked={focus.has(s.id)} />
                        {s.name}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">Changes apply starting with tomorrow&apos;s drill.</p>
          </fieldset>
        </ActionForm>
        <form action={deleteStudent} className="mt-6 border-t border-slate-100 pt-4">
          <input type="hidden" name="studentId" value={student.id} />
          <button className="text-sm font-semibold text-red-600 hover:underline">Remove {student.name} and all their progress</button>
        </form>
      </section>
    </div>
  );
}
