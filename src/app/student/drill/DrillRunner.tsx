"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { problemView } from "@/lib/learning";
import type { AwardSummary } from "@/lib/achievements";
import { Celebration } from "@/components/Celebration";
import { Scratchpad, type ScratchpadHandle } from "@/components/Scratchpad";
import { Visual } from "@/components/Visual";
import { MicButton, SpeakButton, useReadAloud } from "@/components/Voice";

type Problem = ReturnType<typeof problemView>;

const CHEERS = ["Nice work!", "You got it!", "Awesome!", "Great thinking!", "Super!", "Way to go!"];

const SOURCE_LABELS: Record<Problem["source"], string | null> = {
  curriculum: null,
  misconception: "🎯 Extra practice",
  homework: "📚 Like your homework",
  test_prep: "📝 Quiz prep",
  textbook: "📖 From your textbook",
};

export function DrillRunner({ initialProblems, name, aiEnabled }: { initialProblems: Problem[]; name: string; aiEnabled: boolean }) {
  const [problems, setProblems] = useState(initialProblems);
  const firstOpen = problems.findIndex((p) => !p.done);
  const [index, setIndex] = useState(firstOpen === -1 ? problems.length : firstOpen);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "right" | "wrong" | "retry"; text: string } | null>(null);
  const [mastered, setMastered] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [award, setAward] = useState<AwardSummary | null>(null);
  const [sessionXp, setSessionXp] = useState(0);
  const [sessionBadges, setSessionBadges] = useState<AwardSummary["badges"]>([]);
  const [showWork, setShowWork] = useState(false);
  const [diagnosing, setDiagnosing] = useState<string | null>(null);
  const scratch = useRef<ScratchpadHandle>(null);

  const problem = problems[index];
  // Voice mode reads each new problem, and the right/wrong message, aloud.
  useReadAloud(problem?.prompt);
  useReadAloud(feedback?.text);

  const correctCount = useMemo(() => problems.filter((p) => p.done && p.solved && p.tries === 1 && !p.usedHint).length, [problems]);

  async function send(body: { type: "answer"; answer: string } | { type: "hint" }) {
    setBusy(true);
    try {
      const res = await fetch(`/api/drill/${problem.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      const data = await res.json() as { problem: Problem; correct: boolean | null; mastered: string | null; rewards: AwardSummary | null };
      // Keep the lesson name the page looked up; answers come back without it.
      setProblems((ps) => ps.map((p) => (p.id === data.problem.id ? { ...data.problem, skillName: p.skillName } : p)));
      if (data.mastered) setMastered(data.mastered);
      const xp = data.rewards?.xp ?? 0;
      if (data.rewards) {
        setSessionXp((n) => n + data.rewards!.xp);
        setSessionBadges((b) => [...b, ...data.rewards!.badges]);
        // Small wins show inline; level-ups, badges and bonuses get the big celebration.
        if (data.rewards.leveledUp || data.rewards.badges.length || data.rewards.messages.length) setAward(data.rewards);
      }
      if (aiEnabled && data.problem.canDiagnose && !data.problem.feedbackStatus) diagnose(data.problem.id);
      if (body.type === "answer") {
        if (data.correct) setFeedback({ kind: "right", text: `${CHEERS[Math.floor(Math.random() * CHEERS.length)]}${xp ? ` +${xp} XP` : ""}` });
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

  /** Asks Math Buddy why the answer was wrong, sending the scratchpad drawing if there is one. */
  async function diagnose(problemId: string) {
    setDiagnosing(problemId);
    try {
      const form = new FormData();
      const work = await scratch.current?.toBlob();
      if (work) form.append("work", work, "work.png");
      const res = await fetch(`/api/drill/${problemId}/explain`, { method: "POST", body: form });
      if (!res.ok) return;
      const data = await res.json() as { status: Problem["feedbackStatus"]; feedback: string | null };
      setProblems((ps) => ps.map((p) => (p.id === problemId ? { ...p, feedback: data.feedback, feedbackStatus: data.status } : p)));
    } catch {
      // The worked explanation is still shown, so a failed diagnosis just goes without.
    } finally {
      setDiagnosing((id) => (id === problemId ? null : id));
    }
  }

  function next() {
    setFeedback(null);
    setAnswer("");
    setMastered(null);
    setShowWork(false);
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
        {sessionXp > 0 && <p className="mt-3 inline-block rounded-full bg-amber-100 px-4 py-1.5 text-lg font-extrabold text-amber-800">⚡ +{sessionXp} XP</p>}
        {sessionBadges.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {sessionBadges.map((b) => <span key={b.id} className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">{b.emoji} {b.name}</span>)}
          </div>
        )}
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
      <Celebration award={award} />
      <div className="flex items-center gap-1.5">
        {problems.map((p, i) => (
          <div key={p.id} className={`h-2.5 flex-1 rounded-full ${p.done ? (p.solved ? "bg-emerald-500" : "bg-red-400") : i === index ? "bg-brand-500" : "bg-slate-200"}`} />
        ))}
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-slate-400">
          <span>Problem {index + 1} of {problems.length} · {problem.skillName}</span>
          {SOURCE_LABELS[problem.source] && <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-brand-700">{SOURCE_LABELS[problem.source]}</span>}
        </div>
        <div className="my-6 flex items-center justify-center gap-3">
          <div className="text-center text-3xl font-extrabold sm:text-4xl">{problem.prompt}</div>
          <SpeakButton text={problem.prompt} />
        </div>

        {!problem.done && (
          problem.choices ? (
            <div className="flex justify-center gap-3">
              {problem.choices.map((c) => (
                <button key={c} disabled={busy} onClick={() => send({ type: "answer", answer: c })} className="btn-secondary h-16 w-20 text-3xl">{c}</button>
              ))}
              <MicButton asAnswer onText={(said) => { if (problem.choices!.includes(said)) send({ type: "answer", answer: said }); }} />
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); if (answer.trim()) send({ type: "answer", answer }); }} className="mx-auto flex max-w-sm gap-2">
              <MicButton asAnswer onText={(said) => { setAnswer(said); send({ type: "answer", answer: said }); }} />
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

        {problem.hint && (
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-brand-50 px-4 py-3 text-brand-700">
            <p className="flex-1">💡 {problem.hint}</p>
            <SpeakButton text={problem.hint} />
          </div>
        )}
        {problem.visual && <Visual visual={problem.visual} className="mt-3" />}
        {problem.done && problem.explanation && (
          <div className="mt-3 flex items-center justify-center gap-2 text-slate-600">
            <p className="text-center">{problem.explanation}</p>
            <SpeakButton text={problem.explanation} />
          </div>
        )}
        {(diagnosing === problem.id || problem.feedbackStatus === "pending") && !problem.feedback && (
          <p className="mt-4 animate-pulse rounded-xl bg-slate-50 px-4 py-3 text-center text-slate-500">🔍 Math Buddy is looking at your answer…</p>
        )}
        {problem.feedback && (
          <div className="mt-4 rounded-xl bg-violet-50 px-4 py-3 text-violet-900 ring-1 ring-violet-200">
            <div className="mb-0.5 flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-wide text-violet-500">
              Math Buddy noticed
              <SpeakButton text={problem.feedback} />
            </div>
            {problem.feedback}
          </div>
        )}

        {/* Kept mounted after the problem ends so the drawing can go along with the diagnosis. */}
        {showWork && <div className="mt-5"><Scratchpad key={problem.id} ref={scratch} /></div>}

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {!problem.done && !problem.usedHint && (
            <button onClick={() => send({ type: "hint" })} disabled={busy} className="btn-secondary">💡 Hint</button>
          )}
          {!problem.done && !showWork && (
            <button onClick={() => setShowWork(true)} className="btn-secondary">✏️ Show your work</button>
          )}
          {problem.done && <button onClick={next} className="btn px-8">Next →</button>}
        </div>
      </div>
    </div>
  );
}
