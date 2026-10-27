"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChatLog, type ChatMessage } from "@/components/ChatLog";
import { Celebration } from "@/components/Celebration";
import { Scratchpad, type ScratchpadHandle } from "@/components/Scratchpad";
import { MicButton, useReadAloud } from "@/components/Voice";
import type { AwardSummary } from "@/lib/achievements";

export function HomeworkChat({ sessionId, studentName, initialMessages, initialSolved }: {
  sessionId: string;
  studentName: string;
  initialMessages: ChatMessage[];
  initialSolved: boolean;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [solved, setSolved] = useState(initialSolved);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [award, setAward] = useState<AwardSummary | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const scratch = useRef<ScratchpadHandle>(null);
  const [showWork, setShowWork] = useState(false);
  const [hasDrawing, setHasDrawing] = useState(false);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  // Voice mode reads each new tutor reply aloud.
  const lastReply = messages.at(-1)?.role === "assistant" ? messages.at(-1)!.content : null;
  useReadAloud(lastReply);

  // The first tutor turn may have failed (e.g. no API key yet); let the student retry it.
  const needsOpening = messages.length === 0;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    const work = showWork ? await scratch.current?.toBlob() : null;
    if (!content && !work) return;
    setBusy(true);
    setError(null);
    const imageUrl = work ? URL.createObjectURL(work) : null;
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: "user", content: content || "Here's my work so far.", imageUrl }]);
    setText("");
    try {
      const form = new FormData();
      form.append("text", content);
      if (work) form.append("work", work, "work.png");
      const res = await fetch(`/api/homework/${sessionId}/messages`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({ error: "Something went wrong." }));
      if (!res.ok) throw new Error(data.error);
      setMessages((m) => [...m, { id: `reply-${Date.now()}`, role: "assistant", content: data.reply }]);
      if (data.solved) setSolved(true);
      if (data.rewards) setAward(data.rewards);
      if (work) {
        scratch.current?.clear();
        setShowWork(false);
      }
    } catch (err) {
      setMessages((m) => m.slice(0, -1));
      setText(content);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Celebration award={award} />
      <ChatLog messages={messages} studentName={studentName} />
      {busy && <div className="text-slate-400">Math Buddy is thinking…</div>}
      {needsOpening && !busy && <p className="text-slate-600">Tell Math Buddy what the problem is to get started.</p>}
      {solved && (
        <div className="rounded-2xl bg-emerald-50 p-4 text-center ring-1 ring-emerald-200">
          <div className="text-3xl">🎉</div>
          <div className="font-bold text-emerald-700">You solved it yourself!</div>
          <p className="text-sm text-emerald-700">Watch for a few problems like this one in your next drill.</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Link href={`/student/explain/homework/${sessionId}`} className="btn-secondary">🗣️ Teach it back (+15 XP)</Link>
            <Link href="/student/homework" className="btn">Next problem</Link>
          </div>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <form onSubmit={send} className="sticky bottom-4 space-y-2 rounded-2xl bg-white p-2 shadow-lg ring-1 ring-slate-200">
        {showWork && <Scratchpad ref={scratch} height={220} onChange={(empty) => setHasDrawing(!empty)} />}
        <div className="flex gap-2">
          <button
            type="button" onClick={() => { setShowWork((v) => !v); setHasDrawing(false); }}
            className={`shrink-0 rounded-xl px-3 font-semibold ring-1 ${showWork ? "bg-brand-50 text-brand-700 ring-brand-200" : "text-slate-600 ring-slate-300 hover:bg-slate-50"}`}
            aria-pressed={showWork} title="Draw your work so Math Buddy can check each step"
          >✏️<span className="sr-only sm:not-sr-only sm:ml-1">Show work</span></button>
          <MicButton onText={(said) => setText((t) => (t ? `${t} ${said}` : said))} />
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} className="input border-0 focus:ring-0" placeholder={solved ? "Any other questions?" : showWork ? "Add a note (optional)" : "Type your answer or question…"} aria-label="Message" />
          <button className="btn" disabled={busy || (!text.trim() && !hasDrawing)}>Send</button>
        </div>
      </form>
      <div ref={bottom} />
    </div>
  );
}
