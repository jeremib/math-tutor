import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, isNotNull, max } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { familyStudent, requireParent } from "@/lib/auth";
import { GRADE_LABELS, SKILLS, SKILLS_BY_ID } from "@/lib/curriculum";
import { parseFocus, studentStats } from "@/lib/learning";
import { gameProfile } from "@/lib/achievements";
import { levelTitle } from "@/lib/gamification";
import { earnedMastery } from "@/lib/progress";
import { RESOLVE_AFTER } from "@/lib/practice";
import { WeekTracker } from "@/components/WeekTracker";
import { ActionForm } from "@/components/ActionForm";
import { MasteryBar, Stat, XpBar } from "@/components/ui";
import { addReward, deleteReward, deleteStudent, deleteTestPrep, markRewardGiven, updateStudent } from "../../actions";
import { latestExplanations } from "@/lib/teachback";
import { testPrepsFor } from "@/lib/testprep";
import { localDate } from "@/lib/progress";
import { RACE_OPS } from "@/lib/race";
import { RefreshWhilePending, TestPrepForm } from "@/components/TestPrep";
import { TestPrepList } from "@/components/TestPrepList";
import { textbookFor, textbookProgress } from "@/lib/textbook";
import { BookProgress } from "@/components/BookProgress";
import { LoginLink } from "@/components/LoginLink";

export default async function StudentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { family } = await requireParent();
  const student = await familyStudent(family.id, id);
  if (!student) notFound();

  const db = await getDb();
  const focus = new Set(parseFocus(student));
  const today = localDate(family.timezone);
  const [stats, game, homework, misses, noticed, preps, raceBests, textbook, bookProgress] = await Promise.all([
    studentStats(student, family.timezone),
    gameProfile(student, family.timezone),
    db.select().from(schema.homeworkSessions).where(eq(schema.homeworkSessions.studentId, student.id))
    .orderBy(desc(schema.homeworkSessions.updatedAt)).limit(20),
    db.select({ p: schema.drillProblems, date: schema.drills.date })
    .from(schema.drillProblems).innerJoin(schema.drills, eq(schema.drills.id, schema.drillProblems.drillId))
    .where(and(eq(schema.drills.studentId, student.id), eq(schema.drillProblems.firstTryCorrect, false)))
    .orderBy(desc(schema.drillProblems.answeredAt)).limit(8),
    db.select().from(schema.misconceptions).where(eq(schema.misconceptions.studentId, student.id))
    .orderBy(desc(schema.misconceptions.lastSeenAt)).limit(20),
    testPrepsFor(student.id, today),
    db.select({ op: schema.factRaces.op, best: max(schema.factRaces.correct) }).from(schema.factRaces)
      .where(and(eq(schema.factRaces.studentId, student.id), isNotNull(schema.factRaces.finishedAt))).groupBy(schema.factRaces.op),
    textbookFor(student.id),
    textbookProgress(student.id),
  ]);
  const chapter = textbook?.status === "ready" && textbook.currentChapter !== null ? textbook.chapters[textbook.currentChapter] : null;
  const explained = await latestExplanations(student.id, [...noticed.map((m) => m.id), ...homework.map((h) => h.id)]);
  const openMisconceptions = noticed.filter((m) => !m.resolvedAt);
  const fixedMisconceptions = noticed.filter((m) => m.resolvedAt).slice(0, 5);
  const labels = new Map(noticed.map((m) => [m.id, m.label]));

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
      <section className="card">
        <h2 className="font-bold">🔗 Login link</h2>
        <p className="mb-3 text-sm text-slate-500">
          Opens the login page with the family code and username filled in, so {student.name} only types their PIN.
          Bookmark it or add it to the home screen on {student.name}&apos;s device.
        </p>
        <LoginLink code={family.code} username={student.username} />
      </section>

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

      <section className="card">
        <h2 className="text-xl font-bold">🔍 What Math Buddy noticed</h2>
        <p className="mb-4 text-sm text-slate-500">
          When {student.name} misses a drill problem, Math Buddy works out why from the exact wrong answer. Repeated mistakes show up here,
          and the next drills include practice aimed at them. One is marked fixed after {RESOLVE_AFTER} of those are right on the first try.
        </p>
        {openMisconceptions.length || fixedMisconceptions.length ? (
          <ul className="space-y-2">
            {openMisconceptions.map((m) => (
              <li key={m.id} className="rounded-xl bg-violet-50 p-3 ring-1 ring-violet-100">
                <div className="font-semibold text-violet-950">{m.label}</div>
                <div className="mt-0.5 text-sm text-violet-800">
                  {SKILLS_BY_ID.get(m.skillId)?.name ?? m.skillId} · seen {m.timesSeen} time{m.timesSeen === 1 ? "" : "s"}, last {m.lastSeenAt.toLocaleDateString()}
                  {" · "}practice {Math.min(m.practicedCorrect, RESOLVE_AFTER)}/{RESOLVE_AFTER} right
                </div>
              </li>
            ))}
            {fixedMisconceptions.map((m) => (
              <li key={m.id} className="rounded-xl bg-slate-50 p-3">
                <div className="font-semibold text-slate-500 line-through decoration-slate-300">{m.label}</div>
                <div className="mt-0.5 text-sm font-semibold text-emerald-700">✓ Fixed {m.resolvedAt!.toLocaleDateString()}</div>
                {explained.has(m.id) && <Explained e={explained.get(m.id)!} />}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-slate-500">Nothing yet. Patterns show up here after a few missed drill problems.</p>}
      </section>

      <section className="card flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold">📖 Textbook</h2>
          <p className="text-sm text-slate-500">
            {!textbook ? `Add the math book ${student.name} uses at school and drills will follow its chapters.`
              : textbook.status === "pending" ? `Looking up ${textbook.title || "the book"}…`
              : textbook.status !== "ready" ? `${textbook.title || "The book"}: needs photos of the table of contents.`
              : chapter ? <>{textbook.title} · working on <b className="text-slate-700">{chapter.title}</b></>
              : `${textbook.title} · pick the chapter the class is on.`}
          </p>
        </div>
        <Link href={`/parent/students/${student.id}/textbook`} className={textbook ? "btn-secondary" : "btn"}>
          {textbook ? "Open textbook plan" : "Set up textbook"}
        </Link>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="text-xl font-bold">📝 Quiz prep</h2>
          <p className="mb-4 text-sm text-slate-500">
            Add an upcoming quiz with a photo of the study guide. Math Buddy writes practice problems and spreads them through {student.name}&apos;s drills until quiz day.
          </p>
          {student.aiEnabled ? (
            <>
              {preps.length > 0 && <div className="mb-4"><TestPrepList preps={preps} onDelete={deleteTestPrep} /></div>}
              <TestPrepForm studentId={student.id} today={today} />
              <RefreshWhilePending pending={preps.some((p) => p.status === "pending")} />
            </>
          ) : <p className="text-sm text-slate-500">Turn on the AI tutor in settings below to use quiz prep.</p>}
        </section>
        <section className="card">
          <h2 className="text-xl font-bold">🏎️ Fact race bests</h2>
          <p className="mb-4 text-sm text-slate-500">Most right answers in 60 seconds. Quick recall of facts frees up attention for harder problems.</p>
          {raceBests.length ? (
            <ul className="grid grid-cols-2 gap-3">
              {RACE_OPS.filter((o) => raceBests.some((b) => b.op === o.op)).map((o) => (
                <li key={o.op} className="rounded-xl bg-slate-50 p-3 text-center">
                  <div className="text-2xl font-extrabold">{raceBests.find((b) => b.op === o.op)!.best}</div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{o.name}</div>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-500">No races yet.</p>}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="card lg:col-span-3">
          {bookProgress && (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-xl font-bold">📖 {bookProgress.book.title}</h2>
                <Link href={`/parent/students/${student.id}/textbook`} className="shrink-0 text-sm font-semibold text-brand-600">Textbook plan →</Link>
              </div>
              <p className="mb-4 text-sm text-slate-500">
                Drills follow the book in place of the regular skill path, plus review of what {student.name} has mastered.
                A lesson or skill turns green once it&apos;s mastered (at least 8 answered, mostly right lately); a chapter gets ✅ when all of them are.
              </p>
              <BookProgress progress={bookProgress} />
            </>
          )}
          <SkillsList show={!bookProgress}>
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
          </SkillsList>
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
                    {p.misconceptionId && labels.has(p.misconceptionId) && (
                      <div className="mt-1 text-violet-800">🔍 {labels.get(p.misconceptionId)}</div>
                    )}
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
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{h.title}</span>
                        {explained.has(h.id) && <span className="block text-xs text-violet-700">🗣️ Explained it back</span>}
                        {SKILLS_BY_ID.has(h.skillId ?? "") && (
                          <span className="block text-xs text-slate-500">
                            {SKILLS_BY_ID.get(h.skillId!)!.name}{h.practiceAdded ? ` · +${h.practiceAdded} practice` : ""}
                          </span>
                        )}
                      </span>
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
          <label className="flex items-start gap-2">
            <input type="checkbox" name="aiEnabled" defaultChecked={student.aiEnabled} className="mt-1 h-4 w-4" />
            <span>
              <span className="font-semibold">Allow the AI tutor</span>
              <span className="block text-sm text-slate-500">Homework help, explanations of missed drill problems, explain-it-back and quiz prep. Drills, races and rewards work without it.</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="voiceEnabled" defaultChecked={student.voiceEnabled} className="mt-1 h-4 w-4" />
            <span>
              <span className="font-semibold">Read aloud and listen</span>
              <span className="block text-sm text-slate-500">Reads problems and the tutor&apos;s replies aloud and lets {student.name} say answers out loud. Helpful for early readers.</span>
            </span>
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
            <p className="mt-1 text-xs text-slate-500">Changes apply starting with tomorrow&apos;s drill. Picking a textbook chapter sets these for you.</p>
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

/** The built-in skill list: the main view without a textbook, tucked away with one. */
function SkillsList({ show, children }: { show: boolean; children: React.ReactNode }) {
  if (show) return <>{children}</>;
  return (
    <details className="mt-6 border-t border-slate-100 pt-4">
      <summary className="cursor-pointer text-sm font-semibold text-slate-500">All built-in skills</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

const VERDICT_LABELS = { got_it: "Explained it well", partly: "Partly explained it", not_yet: "Still working on explaining it" } as const;

function Explained({ e }: { e: { answer: string; verdict: keyof typeof VERDICT_LABELS } }) {
  return (
    <div className="mt-2 rounded-lg bg-white p-2 text-sm ring-1 ring-slate-200">
      <span className="font-semibold text-violet-800">🗣️ {VERDICT_LABELS[e.verdict]}:</span> <span className="italic text-slate-600">&ldquo;{e.answer}&rdquo;</span>
    </div>
  );
}
