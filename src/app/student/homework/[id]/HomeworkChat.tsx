"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChatLog, type ChatMessage } from "@/components/ChatLog";

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
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  // The first tutor turn may have failed (e.g. no API key yet); let the student retry it.
  const needsOpening = messages.length === 0;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    setBusy(true);
    setError(null);
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: "user", content }]);
    setText("");
    try {
      const res = await fetch(`/api/homework/${sessionId}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: content }),
      });
      const data = await res.json().catch(() => ({ error: "Something went wrong." }));
      if (!res.ok) throw new Error(data.error);
      setMessages((m) => [...m, { id: `reply-${Date.now()}`, role: "assistant", content: data.reply }]);
      if (data.solved) setSolved(true);
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
      <ChatLog messages={messages} studentName={studentName} />
      {busy && <div className="text-slate-400">Math Buddy is thinking…</div>}
      {needsOpening && !busy && <p className="text-slate-600">Tell Math Buddy what the problem is to get started.</p>}
      {solved && (
        <div className="rounded-2xl bg-emerald-50 p-4 text-center ring-1 ring-emerald-200">
          <div className="text-3xl">🎉</div>
          <div className="font-bold text-emerald-700">You solved it yourself!</div>
          <Link href="/student/homework" className="btn mt-3">Next problem</Link>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <form onSubmit={send} className="sticky bottom-4 flex gap-2 rounded-2xl bg-white p-2 shadow-lg ring-1 ring-slate-200">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} className="input border-0 focus:ring-0" placeholder={solved ? "Any other questions?" : "Type your answer or question…"} aria-label="Message" />
        <button className="btn" disabled={busy || !text.trim()}>Send</button>
      </form>
      <div ref={bottom} />
    </div>
  );
}
