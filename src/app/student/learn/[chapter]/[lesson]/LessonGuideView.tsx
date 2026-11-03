"use client";

import { useState } from "react";
import type { LessonGuide } from "@/db/schema";
import { splitVisuals } from "@/lib/visuals";
import { Visual } from "@/components/Visual";
import { SpeakButton } from "@/components/Voice";

/** Text with [[VISUAL]] lines drawn as pictures. */
function Body({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      {splitVisuals(text).map((seg, i) => "visual" in seg
        ? <Visual key={i} visual={seg.visual} />
        : seg.text.split(/\n+/).map((line, j) => <p key={`${i}-${j}`}>{line}</p>))}
    </div>
  );
}

/** A worked example whose steps are shown one at a time. */
function Example({ example, n }: { example: LessonGuide["examples"][number]; n: number }) {
  const [shown, setShown] = useState(0);
  const done = shown >= example.steps.length;
  return (
    <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-3">
        <p><span className="font-bold text-brand-700">Example {n}: </span>{example.problem}</p>
        <SpeakButton always text={[example.problem, ...example.steps.slice(0, shown)].join(" ")} />
      </div>
      <ol className="mt-3 space-y-2">
        {example.steps.slice(0, shown).map((s, i) => (
          <li key={i} className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{i + 1}</span><span>{s}</span></li>
        ))}
      </ol>
      {done
        ? <p className="mt-3 font-bold text-emerald-700">Answer: {example.answer}</p>
        : <button type="button" onClick={() => setShown(shown + 1)} className="btn-secondary mt-3">{shown ? "Next step" : "Show me how"} →</button>}
    </div>
  );
}

/** A multiple-choice question that says whether the pick was right and why. */
function Check({ q, n }: { q: LessonGuide["check"][number]; n: number }) {
  const [picked, setPicked] = useState<number | null>(null);
  const right = picked === q.answer;
  return (
    <div>
      <p className="font-semibold">{n}. {q.question}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {q.choices.map((c, i) => {
          const tone = picked === null ? "bg-white ring-slate-300 hover:bg-slate-50"
            : i === q.answer && right ? "bg-emerald-50 ring-emerald-400 text-emerald-900"
            : i === picked ? "bg-rose-50 ring-rose-300 text-rose-900" : "bg-white ring-slate-200 text-slate-400";
          return (
            <button key={i} type="button" disabled={right} onClick={() => setPicked(i)}
              className={`rounded-xl px-4 py-2.5 text-left font-semibold ring-1 transition ${tone}`}>{c}</button>
          );
        })}
      </div>
      {picked !== null && (
        <p className={`mt-2 text-sm ${right ? "text-emerald-700" : "text-rose-700"}`}>
          {right ? `✅ Yes! ${q.why}` : "Not quite. Look back at the lesson and try another one."}
        </p>
      )}
    </div>
  );
}

/** A textbook lesson's mini-lesson: the big idea, short sections, worked examples and a quick check. */
export function LessonGuideView({ guide }: { guide: LessonGuide }) {
  const video = `https://www.khanacademy.org/search?page_search_query=${encodeURIComponent(guide.videoSearch)}`;
  return (
    <div className="space-y-5">
      <section className="flex items-start gap-3 rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-100">
        <span className="text-3xl">💡</span>
        <div className="flex-1">
          <h2 className="text-sm font-bold uppercase tracking-wide text-brand-700">The big idea</h2>
          <p className="mt-1 text-lg font-semibold">{guide.bigIdea}</p>
        </div>
        <SpeakButton always text={guide.bigIdea} />
      </section>

      {guide.sections.map((s, i) => (
        <section key={i} className="card">
          <div className="mb-2 flex items-start justify-between gap-3">
            <h2 className="text-lg font-bold">{s.heading}</h2>
            <SpeakButton always text={`${s.heading}. ${s.body}`} />
          </div>
          <Body text={s.body} />
        </section>
      ))}

      {guide.examples.length > 0 && (
        <section className="card space-y-3">
          <h2 className="text-lg font-bold">👀 Watch it worked out</h2>
          {guide.examples.map((e, i) => <Example key={i} example={e} n={i + 1} />)}
        </section>
      )}

      {guide.watchOut.length > 0 && (
        <section className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <h2 className="font-bold text-amber-900">⚠️ Watch out for</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-900">{guide.watchOut.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </section>
      )}

      {guide.check.length > 0 && (
        <section className="card space-y-4">
          <h2 className="text-lg font-bold">✅ Quick check</h2>
          {guide.check.map((q, i) => <Check key={i} q={q} n={i + 1} />)}
        </section>
      )}

      {guide.videoSearch && (
        <a href={video} target="_blank" rel="noopener noreferrer" className="card flex items-center gap-3 transition hover:-translate-y-0.5">
          <span className="text-3xl">🎬</span>
          <span><span className="block font-bold">Watch a video on this</span><span className="text-sm text-slate-500">Free lessons on Khan Academy: “{guide.videoSearch}”</span></span>
        </a>
      )}
    </div>
  );
}
