import type { testPrepsFor } from "@/lib/testprep";

type Prep = Awaited<ReturnType<typeof testPrepsFor>>[number];

const when = (days: number) => (days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`);

/** Quiz preps with their topics and practice progress. */
export function TestPrepList({ preps, onDelete }: { preps: Prep[]; onDelete?: (formData: FormData) => Promise<void> }) {
  return (
    <ul className="space-y-3">
      {preps.map((p) => (
        <li key={p.id} className={`rounded-xl p-4 ring-1 ${p.upcoming ? "bg-white ring-slate-200" : "bg-slate-50 ring-slate-100"}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-bold">{p.title || "Quiz"}</span>
            <span className={`text-sm font-semibold ${p.upcoming ? (p.daysLeft <= 1 ? "text-orange-600" : "text-brand-700") : "text-slate-400"}`}>
              {p.upcoming ? `📝 Quiz ${when(p.daysLeft)}` : `Quiz was ${p.quizDate}`}
            </span>
          </div>
          {p.status === "pending" && <p className="mt-1 animate-pulse text-sm text-slate-500">Math Buddy is reading the study guide and writing practice problems…</p>}
          {p.status === "failed" && <p className="mt-1 text-sm text-red-600">Math Buddy couldn&apos;t make problems from that. Try a clearer photo, or type the topics.</p>}
          {p.status === "ready" && (
            <>
              {p.topicNames.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {p.topicNames.map((t) => <span key={t} className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">{t}</span>)}
                </div>
              )}
              <p className="mt-2 text-sm text-slate-600">
                {p.answered} of {p.total} practice problems done{p.answered ? ` · ${Math.round((100 * p.right) / p.answered)}% right on the first try` : ""}
                {p.upcoming && p.waiting > 0 && ` · the rest show up in daily drills before the quiz`}
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${p.total ? Math.round((100 * p.answered) / p.total) : 0}%` }} />
              </div>
            </>
          )}
          {onDelete && (
            <form action={onDelete} className="mt-2">
              <input type="hidden" name="prepId" value={p.id} />
              <button className="text-sm font-semibold text-slate-500 hover:underline">Remove</button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
