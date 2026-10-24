import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui";
import { getParent, getStudent } from "@/lib/auth";

export default async function Home() {
  if (await getParent()) redirect("/parent");
  if (await getStudent()) redirect("/student");

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="flex items-center justify-between">
        <Logo />
        <div className="flex gap-2">
          <Link href="/login" className="btn-secondary">Parent login</Link>
          <Link href="/student-login" className="btn">Student login</Link>
        </div>
      </header>

      <section className="py-16 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          Math practice your kids will actually do.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
          A few problems a day that grow with your child, plus a homework helper that guides them to the answer instead of giving it away.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/signup" className="btn px-6 py-3 text-lg">Create a family account</Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ["🎯", "Daily drills", "Short daily sets that focus on the skill your child is learning now, mixed with review of what they've mastered."],
          ["🧭", "Homework helper", "Snap a photo of a problem. The tutor asks guiding questions, one step at a time. It never just hands over the answer."],
          ["📈", "Progress you can see", "Each child has their own login. Parents see streaks, accuracy, mastered skills and homework conversations."],
        ].map(([icon, title, body]) => (
          <div key={title} className="card">
            <div className="text-3xl">{icon}</div>
            <h2 className="mt-3 text-lg font-bold">{title}</h2>
            <p className="mt-1 text-slate-600">{body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
