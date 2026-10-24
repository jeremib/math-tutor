"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { problemView } from "@/lib/learning";

type Problem = ReturnType<typeof problemView>;

const CHEERS = ["Nice work!", "You got it!", "Awesome!", "Great thinking!", "Super!", "Way to go!"];

export function DrillRunner({ initialProblems, name }: { initialProblems: Problem[]; name: string }) {
  const [problems, setProblems] = useState(initialProblems);
  const firstOpen = problems.findIndex((p) => !p.done);
  const [index, setIndex] = useState(firstOpen === -1 ? problems.length : firstOpen);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "right" | "wrong" | "retry"; text: string } | null>(null);
  const [mastered, setMastered] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const problem = problems[index];
  const correctCount = useMemo(() => problems.filter((p) => p.done && p.solved && p.tries === 1 && !p.usedHint).length, [problems]);

  async function send(body: { type: "answer"; answer: string } | { type: "hint" }) {
    setBusy(true);
    try {
      const res = await fetch(`/api/drill/${problem.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      const data = await res.json() as { problem: Problem; correct: boolean | null; mastered: string | null };
      setProblems((ps) => ps.map((p) => (p.id === data.problem.id ? data.problem : p)));
      if (data.mastered) setMastered(data.mastered);
      if (body.type === "answer") {
        if (data.correct) setFeedback({ kind: "right", text: CHEERS[Math.floor(Math.random() * CHEERS.length)] });
        else if (data.problem.done) setFeedback({ kind: "wrong", text: `Not quite. The answer is ${data.problem.answer}.` });
        else setFeedback({ kind: "retry", text: "Not quite. Take another look and try again!" });
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
    setMastered(null);
    const after = problems.findIndex((p, i) => i > index && !p.done);
    const before = problems.findIndex((p) => !p.done);
    setIndex(after !== -1 ? after : before !== -1 ? before : problems.length);
  }

  if (!problem) {
    return (
      <div className="card text-center">
        <div className="text-6xl">🏆</div>
        <h1 className="mt-3 text-3xl font-extrabold">All done, {name}!</h1>
        <p className="mt-2 text-lg text-slate-600">You got <b>{correctCount}</b> of {problems.length} right on the first try.</p>
        <ul className="mx-auto mt-6 max-w-md space-y-2 text-left">
          {problems.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
              <span>{p.prompt}</span>
              <span className="whitespace-nowrap font-semibold">{p.solved ? "✅" : "❌"} {p.answer}</span>
            </li>
          ))}
        </ul>
        <Link href="/student" className="btn mt-6">Back home</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5">
        {problems.map((p, i) => (
          <div key={p.id} className={`h-2.5 flex-1 rounded-full ${p.done ? (p.solved ? "bg-emerald-500" : "bg-red-400") : i === index ? "bg-brand-500" : "bg-slate-200"}`} />
        ))}
      </div>

      <div className="card">
        <div className="text-sm font-semibold text-slate-400">Problem {index + 1} of {problems.length} · {problem.skillName}</div>
        <div className="my-6 text-center text-3xl font-extrabold sm:text-4xl">{problem.prompt}</div>

        {!problem.done && (
          problem.choices ? (
            <div className="flex justify-center gap-3">
              {problem.choices.map((c) => (
                <button key={c} disabled={busy} onClick={() => send({ type: "answer", answer: c })} className="btn-secondary h-16 w-20 text-3xl">{c}</button>
              ))}
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); if (answer.trim()) send({ type: "answer", answer }); }} className="mx-auto flex max-w-sm gap-2">
              <input autoFocus value={answer} onChange={(e) => setAnswer(e.target.value)} className="input text-center text-2xl font-bold" placeholder="Your answer" aria-label="Your answer" />
              <button className="btn px-6 text-lg" disabled={busy || !answer.trim()}>Check</button>
            </form>
          )
        )}

        {feedback && (
          <div className={`mt-5 rounded-xl px-4 py-3 text-center text-lg font-bold ${feedback.kind === "right" ? "bg-emerald-50 text-emerald-700" : feedback.kind === "wrong" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
            {feedback.text}
          </div>
        )}
        {mastered && (
          <div className="mt-3 rounded-xl bg-yellow-50 px-4 py-3 text-center font-bold text-yellow-800">⭐ New skill earned: {mastered}!</div>
        )}

        {problem.hint && <p className="mt-4 rounded-xl bg-brand-50 px-4 py-3 text-brand-700">💡 {problem.hint}</p>}
        {problem.done && problem.explanation && <p className="mt-3 text-center text-slate-600">{problem.explanation}</p>}

        <div className="mt-6 flex justify-center gap-3">
          {!problem.done && !problem.usedHint && (
            <button onClick={() => send({ type: "hint" })} disabled={busy} className="btn-secondary">💡 Hint</button>
          )}
          {problem.done && <button onClick={next} className="btn px-8">Next →</button>}
        </div>
      </div>
    </div>
  );
}
