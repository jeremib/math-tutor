"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Celebration } from "@/components/Celebration";
import { MicButton } from "@/components/Voice";
import { RACE_SECONDS, raceProblems, type RaceOp } from "@/lib/race";
import type { AwardSummary } from "@/lib/achievements";

type Op = { op: RaceOp; name: string; symbol: string; best: number | null };
type Result = { attempted: number; correct: number; previousBest: number | null; newBest: boolean; rewards: AwardSummary | null };

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "✓"];

export function RaceRunner({ ops: initialOps }: { ops: Op[] }) {
  const [ops, setOps] = useState(initialOps);
  const [race, setRace] = useState<{ id: string; seed: number; op: Op } | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [flash, setFlash] = useState<"right" | "wrong" | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const finishing = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  const problems = useMemo(() => (race ? raceProblems(race.op.op, race.seed) : []), [race]);
  const current = problems[answers.length];
  const running = race && !result && countdown === 0 && startedAt > 0;
  const left = running ? Math.max(0, RACE_SECONDS - Math.floor((now - startedAt) / 1000)) : RACE_SECONDS;
  const correctSoFar = answers.filter((a, i) => Number(a) === problems[i]?.answer).length;

  async function start(op: Op) {
    setError(null);
    setResult(null);
    const res = await fetch("/api/race", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: op.op }) });
    if (!res.ok) return setError("Couldn't start the race. Try again.");
    const data = await res.json() as { id: string; seed: number };
    finishing.current = false;
    setAnswers([]);
    setTyped("");
    setStartedAt(0);
    setRace({ ...data, op });
    setCountdown(3);
  }

  // 3, 2, 1, go!
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => {
      if (countdown === 1) {
        setStartedAt(Date.now());
        setNow(Date.now());
      }
      setCountdown((c) => c - 1);
    }, 800);
    return () => clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    if (!running) return;
    input.current?.focus();
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [running]);

  const finish = useCallback(async (final: string[]) => {
    if (!race || finishing.current) return;
    finishing.current = true;
    const res = await fetch(`/api/race/${race.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers: final }) });
    const data = await res.json().catch(() => ({ error: "Something went wrong." }));
    if (!res.ok) {
      setError(data.error);
      setRace(null);
      return;
    }
    setResult(data);
    if (data.newBest) setOps((os) => os.map((o) => (o.op === race.op.op ? { ...o, best: data.correct } : o)));
  }, [race]);

  useEffect(() => {
    if (running && left === 0) finish(answers);
  }, [running, left, answers, finish]);

  function submit(value: string) {
    if (!running || !value.trim()) return;
    const right = Number(value) === current.answer;
    setFlash(right ? "right" : "wrong");
    setTimeout(() => setFlash(null), 250);
    setAnswers((a) => [...a, value.trim()]);
    setTyped("");
  }

  function type(value: string) {
    const clean = value.replace(/[^\d]/g, "").slice(0, 4);
    setTyped(clean);
    // Right answers advance on their own, so fast kids don't need to press enter.
    if (current && clean !== "" && Number(clean) === current.answer) submit(clean);
  }

  if (result && race) {
    return (
      <div className="card text-center">
        <Celebration award={result.rewards && (result.rewards.leveledUp || result.rewards.badges.length) ? result.rewards : null} />
        <div className="text-6xl">{result.newBest ? "🏆" : "🏁"}</div>
        <h1 className="mt-2 text-3xl font-extrabold">{result.correct} right!</h1>
        <p className="mt-1 text-lg text-slate-600">
          {race.op.name} · {result.attempted} answered in {RACE_SECONDS} seconds
        </p>
        {result.newBest && result.previousBest !== null && <p className="mt-2 font-bold text-amber-700">New personal best! (was {result.previousBest})</p>}
        {!result.newBest && result.previousBest !== null && <p className="mt-2 text-slate-500">Your best is {result.previousBest}.</p>}
        {!!result.rewards?.xp && <p className="mt-3 inline-block rounded-full bg-amber-100 px-4 py-1.5 font-extrabold text-amber-800">⚡ +{result.rewards.xp} XP</p>}
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={() => start(race.op)} className="btn">Race again</button>
          <button onClick={() => { setRace(null); setResult(null); }} className="btn-secondary">Pick another</button>
        </div>
      </div>
    );
  }

  if (race) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between text-lg font-bold">
          <span>⏱️ {left}s</span>
          <span className="text-emerald-700">✓ {correctSoFar}</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-[width] duration-200" style={{ width: `${(100 * left) / RACE_SECONDS}%` }} />
        </div>
        <div className={`card text-center transition-colors ${flash === "right" ? "bg-emerald-50" : flash === "wrong" ? "bg-red-50" : ""}`}>
          {countdown > 0 ? (
            <div className="py-10 text-7xl font-extrabold text-brand-600">{countdown}</div>
          ) : current ? (
            <>
              <div className="py-6 text-5xl font-extrabold sm:text-6xl">{current.prompt} = ?</div>
              <form onSubmit={(e) => { e.preventDefault(); submit(typed); }} className="mx-auto flex max-w-xs gap-2">
                <input ref={input} value={typed} onChange={(e) => type(e.target.value)} inputMode="numeric" autoComplete="off"
                  className="input text-center text-3xl font-bold" aria-label="Your answer" />
                <MicButton asAnswer onText={(said) => submit(said)} />
              </form>
              <div className="mx-auto mt-4 grid max-w-xs grid-cols-3 gap-2 sm:hidden">
                {KEYS.map((k) => (
                  <button key={k} type="button" className="btn-secondary h-14 text-2xl"
                    onClick={() => (k === "⌫" ? setTyped((t) => t.slice(0, -1)) : k === "✓" ? submit(typed) : type(typed + k))}>{k}</button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">Fact race 🏎️</h1>
        <p className="text-slate-600">How many can you get right in {RACE_SECONDS} seconds? Beat your best score!</p>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {ops.map((o) => (
          <button key={o.op} onClick={() => start(o)} className="card block text-left transition hover:-translate-y-0.5 hover:ring-2 hover:ring-brand-500">
            <div className="text-4xl font-extrabold text-brand-600">{o.symbol}</div>
            <h2 className="mt-2 text-xl font-bold">{o.name}</h2>
            <p className="text-slate-600">{o.best === null ? "No races yet" : `Your best: ${o.best} right`}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
