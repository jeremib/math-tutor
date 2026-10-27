"use client";

import Link from "next/link";
import { useState } from "react";
import { Celebration } from "@/components/Celebration";
import { MicButton, SpeakButton, useReadAloud } from "@/components/Voice";
import type { AwardSummary } from "@/lib/achievements";

type Attempt = { id: string; answer: string; verdict: "got_it" | "partly" | "not_yet"; feedback: string };

const VERDICTS: Record<Attempt["verdict"], { label: string; style: string }> = {
  got_it: { label: "🌟 You've got it!", style: "bg-emerald-50 text-emerald-900 ring-emerald-200" },
  partly: { label: "👍 Almost there", style: "bg-amber-50 text-amber-900 ring-amber-200" },
  not_yet: { label: "🤔 Not quite yet", style: "bg-slate-50 text-slate-800 ring-slate-200" },
};

export function ExplainBack({ source, sourceId, question, attempts: initial, alreadyDone }: {
  source: "misconception" | "homework"; sourceId: string; question: string; attempts: Attempt[]; alreadyDone: boolean;
}) {
  const [attempts, setAttempts] = useState(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [award, setAward] = useState<AwardSummary | null>(null);
  const done = alreadyDone || attempts.some((a) => a.verdict !== "not_yet");
  useReadAloud(attempts[0]?.feedback ?? question);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/explain", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source, sourceId, answer: text }),
      });
      const data = await res.json().catch(() => ({ error: "Something went wrong." }));
      if (!res.ok) throw new Error(data.error);
      setAttempts((a) => [{ id: `local-${Date.now()}`, answer: text, verdict: data.verdict, feedback: data.feedback }, ...a]);
      if (data.rewards) setAward(data.rewards);
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Celebration award={award} />
      {attempts.map((a) => (
        <div key={a.id} className={`rounded-2xl p-4 ring-1 ${VERDICTS[a.verdict].style}`}>
          <p className="text-sm italic opacity-80">&ldquo;{a.answer}&rdquo;</p>
          <div className="mt-2 flex items-start justify-between gap-2">
            <div>
              <div className="font-bold">{VERDICTS[a.verdict].label}</div>
              <p className="mt-0.5">{a.feedback}</p>
            </div>
            <SpeakButton text={a.feedback} />
          </div>
        </div>
      ))}
      {done ? (
        <Link href="/student" className="btn">Back home</Link>
      ) : (
        <form onSubmit={submit} className="card space-y-3">
          {error && <p className="error">{error}</p>}
          <label className="label" htmlFor="explanation">{attempts.length ? "Try again with Math Buddy's tip:" : "Your explanation"}</label>
          <div className="flex gap-2">
            <textarea id="explanation" value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={1500} className="input"
              placeholder="First I…, because…" />
            <MicButton onText={(said) => setText((t) => (t ? `${t} ${said}` : said))} className="self-start py-2" />
          </div>
          <button className="btn w-full" disabled={busy || text.trim().length < 3}>{busy ? "Math Buddy is reading…" : "Check my explanation"}</button>
        </form>
      )}
    </div>
  );
}
