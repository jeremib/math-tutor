import Link from "next/link";
import { requireParent } from "@/lib/auth";
import { GRADE_LABELS } from "@/lib/curriculum";
import { STARTER_AVATARS } from "@/lib/gamification";
import { ActionForm } from "@/components/ActionForm";
import { SetupSteps } from "@/components/SetupSteps";
import { addStudent } from "../../actions";

export default async function NewStudentPage() {
  const { family } = await requireParent();
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/parent" className="text-sm font-semibold text-brand-600">← All students</Link>
      <h1 className="text-3xl font-extrabold">Add a student</h1>
      <SetupSteps at={0} />
      <section className="card space-y-4">
        <p className="text-slate-600">
          A few quick steps and they&apos;re ready: who they are, the math book they use at school, the lesson the class is on, and how much to practice each day.
        </p>
        <ActionForm action={addStudent} submit="Next: their textbook →">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="name">First name</label>
              <input id="name" name="name" className="input" maxLength={40} autoComplete="off" required autoFocus />
            </div>
            <div>
              <label className="label" htmlFor="grade">Grade this school year</label>
              <select id="grade" name="grade" className="input" defaultValue="" required>
                <option value="" disabled>Pick a grade</option>
                {Object.entries(GRADE_LABELS).map(([g, label]) => <option key={g} value={g}>{label}</option>)}
              </select>
            </div>
          </div>
          <fieldset>
            <legend className="label">Pick an avatar (they can change it later)</legend>
            <div className="flex flex-wrap gap-2">
              {STARTER_AVATARS.map((a, i) => (
                <label key={a} className="cursor-pointer">
                  <input type="radio" name="avatar" value={a} defaultChecked={i === 0} className="peer sr-only" />
                  <span className="grid h-11 w-11 place-items-center rounded-xl text-2xl ring-1 ring-slate-200 peer-checked:bg-brand-50 peer-checked:ring-2 peer-checked:ring-brand-500 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-700">{a}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="rounded-xl bg-slate-50 p-4">
            <h2 className="font-bold">How they&apos;ll log in</h2>
            <p className="mb-3 text-sm text-slate-500">
              Kids sign in with your family code <b className="font-mono text-slate-700">{family.code}</b>, their username and a PIN. No email needed.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="username">Username</label>
                <input id="username" name="username" className="input" placeholder="Their first name" autoCapitalize="none" autoComplete="off" maxLength={20} />
                <p className="mt-1 text-xs text-slate-500">Letters, numbers or _. Blank uses their first name.</p>
              </div>
              <div>
                <label className="label" htmlFor="pin">PIN</label>
                <input id="pin" name="pin" type="password" className="input" inputMode="numeric" pattern="\d{4,8}" autoComplete="new-password" required />
                <p className="mt-1 text-xs text-slate-500">4–8 digits they can remember.</p>
              </div>
              <div>
                <label className="label" htmlFor="pinAgain">PIN again</label>
                <input id="pinAgain" name="pinAgain" type="password" className="input" inputMode="numeric" pattern="\d{4,8}" autoComplete="new-password" required />
              </div>
            </div>
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
