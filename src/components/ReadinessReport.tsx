import Link from "next/link";
import type { ChapterTestConcept, ChapterTestResult } from "@/db/schema";
import { MasteryBar } from "@/components/ui";
import { MathText } from "@/components/MathText";
import { StartTestPrepButton } from "@/components/StartTestPrep";
import { READY_AT } from "@/lib/chapter-test-plan";

export const READINESS_LABELS: Record<ChapterTestResult["level"], { emoji: string; title: string; tone: string }> = {
  ready: { emoji: "🌟", title: "You look ready!", tone: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  almost: { emoji: "💪", title: "Almost there", tone: "bg-amber-50 text-amber-900 ring-amber-200" },
  review: { emoji: "📚", title: "Time to review", tone: "bg-rose-50 text-rose-900 ring-rose-200" },
};



/** How ready a student looks after a test prep, idea by idea, with what to do next. */
export function ReadinessReport({ concepts, result, lessons }: {
  concepts: ChapterTestConcept[];
  result: ChapterTestResult;
  lessons: { chapter: number; lesson: number }[];
}) {
  const label = READINESS_LABELS[result.level];
  const weak = concepts.map((c, i) => ({ c, r: result.concepts[i] })).filter(({ r }) => r && r.total && r.score < READY_AT);
  const weakLessons = [...new Map(weak.map(({ c }) => [`${c.chapter}:${c.lesson}`, { chapter: c.chapter, lesson: c.lesson }])).values()];

  return (
    <div className="space-y-5">
      <section className={`rounded-2xl p-5 ring-1 ${label.tone}`}>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-5xl font-extrabold">{Math.round(result.score * 100)}%</div>
            <div className="text-xs font-bold uppercase tracking-wide opacity-70">ready</div>
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-extrabold">{label.emoji} {label.title}</h2>
            <p className="mt-1"><MathText text={result.advice} /></p>
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="mb-3 text-lg font-bold">Idea by idea</h2>
        <ul className="space-y-4">
          {concepts.map((c, i) => {
            const r = result.concepts[i];
            if (!r?.total) return null;
            const ok = r.score >= READY_AT;
            return (
              <li key={i}>
                <div className="mb-1 flex justify-between gap-3 text-sm">
                  <span className="font-semibold">{ok ? "✅" : "🔁"} {c.name}</span>
                  <span className="shrink-0 text-slate-500">{r.right} of {r.total} first try · {Math.round(r.score * 100)}%</span>
                </div>
                <MasteryBar value={r.score} mastered={ok} />
                {!ok && (
                  <div className="mt-2 rounded-xl bg-slate-50 p-3 text-sm">
                    <p><span className="font-semibold">Remember: </span><MathText text={c.keyIdea} /></p>
                    {c.tips.length > 0 && <ul className="mt-1 list-disc pl-5 text-slate-600">{c.tips.map((t, j) => <li key={j}><MathText text={t} /></li>)}</ul>}
                    <Link href={`/student/learn/${c.chapter}/${c.lesson}`} className="mt-2 inline-block font-semibold text-brand-600">📖 Review the lesson →</Link>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex flex-wrap gap-3">
        {weakLessons.length > 0 && <StartTestPrepButton lessons={weakLessons} label="🔁 Practice my weak spots" />}
        <StartTestPrepButton lessons={lessons} label="Try a new set on the same lessons" secondary={weakLessons.length > 0} />
        <Link href="/student/test-prep" className="btn-secondary">All test preps</Link>
      </div>
    </div>
  );
}
