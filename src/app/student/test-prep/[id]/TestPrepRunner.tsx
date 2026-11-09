"use client";

import { useState } from "react";
import type { ChapterTestConcept, ChapterTestResult } from "@/db/schema";
import type { testProblemView } from "@/lib/chapter-test";
import type { AwardSummary } from "@/lib/achievements";
import { Celebration } from "@/components/Celebration";
import { MathText } from "@/components/MathText";
import { MicButton, SpeakButton, useReadAloud } from "@/components/Voice";
import { ReadinessReport } from "@/components/ReadinessReport";

type Problem = ReturnType<typeof testProblemView>;

/** Review sheet: each idea's key point and tips. */
function ReviewSheet({ concepts }: { concepts: ChapterTestConcept[] }) {
  return (
    <ul className="space-y-3">
      {concepts.map((c, i) => (
        <li key={i} className="rounded-xl bg-slate-50 p-3">
          <p className="font-bold">{c.name}</p>
          <p className="mt-0.5"><MathText text={c.keyIdea} /></p>
          {c.tips.length > 0 && <ul className="mt-1 list-disc pl-5 text-sm text-slate-600">{c.tips.map((t, j) => <li key={j}><MathText text={t} /></li>)}</ul>}
        </li>
      ))}
    </ul>
  );
}

/** Works through a test prep one problem at a time, then shows how ready the student is. */
export function TestPrepRunner({ testId, concepts, initialProblems, lessons }: {
  testId: string; concepts: ChapterTestConcept[]; initialProblems: Problem[]; lessons: { chapter: number; lesson: number }[];
}) {
  const [problems, setProblems] = useState(initialProblems);
  const firstOpen = problems.findIndex((p) => !p.done);
  const [index, setIndex] = useState(firstOpen === -1 ? problems.length : firstOpen);
  const [started, setStarted] = useState(problems.some((p) => p.done || p.tries || p.usedHint));
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "right" | "wrong" | "retry"; text: string; tip?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [report, setReport] = useState<ChapterTestResult | null>(null);
  const [award, setAward] = useState<AwardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const problem = problems[index];
  const concept = problem ? concepts[problem.concept] : undefined;
  useReadAloud(started ? problem?.prompt : null);

  async function send(body: { type: "answer"; answer: string } | { type: "hint" }) {
    setBusy(true);
    try {
      const res = await fetch(`/api/chapter-test/${testId}/problems/${problem.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      const data = await res.json() as { problem: Problem; correct: boolean | null };
      setProblems((ps) => ps.map((p) => (p.id === data.problem.id ? data.problem : p)));
      if (body.type === "answer") {
        // A wrong first try gets one of the idea's test tips to steer the second try.
        const tip = concept?.tips.length ? concept.tips[index % concept.tips.length] : undefined;
        if (data.correct) setFeedback({ kind: "right", text: data.problem.firstTryCorrect ? "Nailed it!" : "You got it!" });
        else if (data.problem.done) setFeedback({ kind: "wrong", text: `Not quite. The answer is ${data.problem.answer}.` });
        else setFeedback({ kind: "retry", text: "Not quite. Try once more!", tip });
        if (!data.problem.done) setAnswer("");
      }
    } catch {
      setFeedback({ kind: "retry", text: "Something went wrong. Try again." });
    } finally {
      setBusy(false);
    }
  }

  function next() {
    setFeedback(null);
    setAnswer("");
    setIndex(index + 1);
  }

  async function finish() {
    setFinishing(true);
    setError(null);
    const res = await fetch(`/api/chapter-test/${testId}/finish`, { method: "POST" }).catch(() => null);
    const data = await res?.json().catch(() => null) as { result: ChapterTestResult; rewards: AwardSummary | null } | null;
    if (res?.ok && data?.result) {
      setReport(data.result);
      if (data.rewards?.xp) setAward(data.rewards);
    } else setError("Couldn't score your test prep. Try again.");
    setFinishing(false);
  }

  if (report) return <><Celebration award={award} /><ReadinessReport concepts={concepts} result={report} lessons={lessons} /></>;

  if (!started) {
    return (
      <div className="space-y-4">
        <section className="card">
          <h2 className="text-lg font-bold">📋 Warm up: the big ideas</h2>
          <p className="mb-3 text-sm text-slate-500">Read these first. Then you&apos;ll do {problems.length} test-style problems that mix them up, like a real test.</p>
          <ReviewSheet concepts={concepts} />
        </section>
        <button type="button" className="btn px-8 text-lg" onClick={() => setStarted(true)}>Start practice →</button>
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="card space-y-3 text-center">
        <div className="text-5xl">🏁</div>
        <h2 className="text-2xl font-extrabold">All done!</h2>
        <p className="text-slate-600">Let&apos;s see how ready you are.</p>
        <button type="button" className="btn mx-auto px-8" disabled={finishing} onClick={finish}>{finishing ? "Checking your answers…" : "See how ready I am"}</button>
        {error && <p className="text-sm text-rose-700">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5">
        {problems.map((p, i) => (
          <div key={p.id} className={`h-2.5 flex-1 rounded-full ${p.done ? (p.firstTryCorrect ? "bg-emerald-500" : p.solved ? "bg-amber-400" : "bg-red-400") : i === index ? "bg-brand-500" : "bg-slate-200"}`} />
        ))}
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-slate-400">
          <span>Problem {index + 1} of {problems.length} · {concept?.name}</span>
        </div>
        <div className="my-6 flex items-center justify-center gap-3">
          <div className="text-center text-3xl font-extrabold sm:text-4xl"><MathText text={problem.prompt} /></div>
          <SpeakButton text={problem.prompt} />
        </div>

        {!problem.done && (
          <form onSubmit={(e) => { e.preventDefault(); if (answer.trim()) send({ type: "answer", answer }); }} className="mx-auto flex max-w-sm gap-2">
            <MicButton asAnswer onText={(said) => { setAnswer(said); send({ type: "answer", answer: said }); }} />
            <input autoFocus value={answer} onChange={(e) => setAnswer(e.target.value)} className="input text-center text-2xl font-bold" placeholder="Your answer" aria-label="Your answer" />
            <button className="btn px-6 text-lg" disabled={busy || !answer.trim()}>Check</button>
          </form>
        )}

        {feedback && (
          <div className={`mt-5 rounded-xl px-4 py-3 text-center ${feedback.kind === "right" ? "bg-emerald-50 text-emerald-700" : feedback.kind === "wrong" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
            <p className="text-lg font-bold"><MathText text={feedback.text} /></p>
            {feedback.tip && <p className="mt-1 text-sm">🧠 Test tip: <MathText text={feedback.tip} /></p>}
          </div>
        )}

        {problem.hint && (
          <div className="mt-4 rounded-xl bg-brand-50 px-4 py-3 text-brand-800">
            <p>💡 <MathText text={problem.hint} /></p>
            {concept && <p className="mt-2 border-t border-brand-100 pt-2 text-slate-700"><span className="font-semibold text-brand-700">Remember: </span><MathText text={concept.keyIdea} /></p>}
          </div>
        )}
        {problem.done && problem.explanation && (
          <p className="mt-3 text-center text-slate-600"><MathText text={problem.explanation} /></p>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {!problem.done && !problem.usedHint && <button onClick={() => send({ type: "hint" })} disabled={busy} className="btn-secondary">💡 Hint</button>}
          {problem.done && <button onClick={next} className="btn px-8">{index + 1 < problems.length ? "Next →" : "Finish →"}</button>}
        </div>
      </div>

      <details className="card">
        <summary className="cursor-pointer font-semibold text-slate-600">📋 Review sheet</summary>
        <div className="mt-3"><ReviewSheet concepts={concepts} /></div>
      </details>
    </div>
  );
}
