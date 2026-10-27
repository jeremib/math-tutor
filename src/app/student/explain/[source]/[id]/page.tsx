import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStudent } from "@/lib/auth";
import { teachBackPage, type TeachBackSource } from "@/lib/teachback";
import { ExplainBack } from "./ExplainBack";

export default async function ExplainPage({ params }: { params: Promise<{ source: string; id: string }> }) {
  const { source, id } = await params;
  if (source !== "misconception" && source !== "homework") notFound();
  const { student } = await requireStudent();
  if (!student.aiEnabled) redirect("/student");
  const page = await teachBackPage(student, source as TeachBackSource, id);
  if (!page) notFound();
  const done = page.attempts.some((a) => a.verdict !== "not_yet");

  return (
    <div className="space-y-4">
      <Link href="/student" className="text-sm font-semibold text-brand-600">← Home</Link>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-violet-600">Teach it back · {page.title}</p>
        <h1 className="mt-1 text-2xl font-extrabold">{page.question}</h1>
        <p className="mt-1 text-slate-600">Explaining an idea in your own words is one of the best ways to remember it. Type it or say it out loud.</p>
      </div>
      <ExplainBack source={source as TeachBackSource} sourceId={id} question={page.question} alreadyDone={done}
        attempts={page.attempts.map((a) => ({ id: a.id, answer: a.answer, verdict: a.verdict, feedback: a.feedback }))} />
    </div>
  );
}
