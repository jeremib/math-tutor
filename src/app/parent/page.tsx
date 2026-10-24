import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireParent } from "@/lib/auth";
import { GRADE_LABELS } from "@/lib/curriculum";
import { studentStats } from "@/lib/learning";
import { ActionForm } from "@/components/ActionForm";
import { Stat } from "@/components/ui";
import { addCoParent, addStudent } from "./actions";

const AVATARS = ["🦊", "🐼", "🐯", "🐸", "🦄", "🐙", "🦖", "🐧", "🦉", "🐝"];

export default async function ParentDashboard() {
  const { family } = await requireParent();
  const db = await getDb();
  const [students, parents] = await Promise.all([
    db.select().from(schema.students).where(eq(schema.students.familyId, family.id)).orderBy(schema.students.createdAt),
    db.select().from(schema.parents).where(eq(schema.parents.familyId, family.id)).orderBy(schema.parents.createdAt),
  ]);
  const allStats = await Promise.all(students.map((s) => studentStats(s, family.timezone)));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">{family.name}</h1>
          <p className="text-slate-600">Track your kids&apos; practice and adjust their daily drills.</p>
        </div>
        <div className="rounded-2xl bg-brand-50 px-4 py-3 ring-1 ring-brand-100">
          <div className="text-xs font-bold uppercase tracking-wide text-brand-700">Family code</div>
          <div className="font-mono text-2xl font-extrabold text-brand-700">{family.code}</div>
          <div className="text-xs text-brand-700">Kids use this to log in</div>
        </div>
      </div>

      {students.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {students.map((s, i) => {
            const stats = allStats[i];
            return (
              <Link key={s.id} href={`/parent/students/${s.id}`} className="card block transition hover:ring-brand-500">
                <div className="flex items-center gap-3">
                  <span className="text-4xl">{s.avatar}</span>
                  <div className="flex-1">
                    <div className="text-lg font-bold">{s.name}</div>
                    <div className="text-sm text-slate-500">{GRADE_LABELS[s.grade]} · @{s.username}</div>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${stats.doneToday ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    {stats.doneToday ? "Done today ✓" : "Drill not done"}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <Stat label="Streak" value={`${stats.streak}🔥`} />
                  <Stat label="Accuracy" value={stats.accuracy === null ? "–" : `${stats.accuracy}%`} />
                  <Stat label="Mastered" value={stats.skillsMastered} />
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="card text-center text-slate-600">Add your first student below to get started.</div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-4 text-xl font-bold">Add a student</h2>
          <ActionForm action={addStudent} submit="Add student" resetOnSuccess successText="Student added!">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="name">First name</label>
                <input id="name" name="name" className="input" required />
              </div>
              <div>
                <label className="label" htmlFor="grade">Grade</label>
                <select id="grade" name="grade" className="input" defaultValue="3">
                  {Object.entries(GRADE_LABELS).map(([g, label]) => <option key={g} value={g}>{label}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="username">Username</label>
                <input id="username" name="username" className="input" placeholder="maya" required />
              </div>
              <div>
                <label className="label" htmlFor="pin">PIN (4–8 digits)</label>
                <input id="pin" name="pin" className="input" inputMode="numeric" pattern="\d{4,8}" required />
              </div>
            </div>
            <fieldset>
              <legend className="label">Avatar</legend>
              <div className="flex flex-wrap gap-2">
                {AVATARS.map((a, i) => (
                  <label key={a} className="cursor-pointer">
                    <input type="radio" name="avatar" value={a} defaultChecked={i === 0} className="peer sr-only" />
                    <span className="grid h-11 w-11 place-items-center rounded-xl text-2xl ring-1 ring-slate-200 peer-checked:bg-brand-50 peer-checked:ring-2 peer-checked:ring-brand-500">{a}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </ActionForm>
        </section>

        <section className="card">
          <h2 className="text-xl font-bold">Parents</h2>
          <ul className="mt-2 mb-4 space-y-1 text-slate-600">
            {parents.map((p) => <li key={p.id}>{p.name} <span className="text-slate-400">· {p.email}</span></li>)}
          </ul>
          <h3 className="mb-3 font-bold">Add another parent</h3>
          <ActionForm action={addCoParent} submit="Add parent" resetOnSuccess successText="Parent added!">
            <input name="name" className="input" placeholder="Name" required />
            <input name="email" type="email" className="input" placeholder="Email" required />
            <input name="password" type="password" className="input" placeholder="Temporary password (8+ characters)" minLength={8} required />
          </ActionForm>
        </section>
      </div>
    </div>
  );
}
