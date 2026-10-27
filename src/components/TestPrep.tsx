"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Form to start quiz prep from a study guide photo or notes. */
export function TestPrepForm({ studentId, today }: { studentId?: string; today: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/test-prep", { method: "POST", body: new FormData(form) });
      const data = await res.json().catch(() => ({ error: "Something went wrong." }));
      if (!res.ok) throw new Error(data.error);
      form.reset();
      setPreview(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {studentId && <input type="hidden" name="studentId" value={studentId} />}
      {error && <p className="error">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="prepTitle">Quiz name (optional)</label>
          <input id="prepTitle" name="title" maxLength={80} className="input" placeholder="Fractions quiz" />
        </div>
        <div>
          <label className="label" htmlFor="quizDate">Quiz date</label>
          <input id="quizDate" name="quizDate" type="date" min={today} required className="input" />
        </div>
      </div>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-slate-300 p-3 hover:border-brand-500">
        {preview
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={preview} alt="Study guide" className="h-16 rounded" />
          : <span className="text-2xl">📷</span>}
        <span className="font-semibold">{preview ? "Change photo" : "Add a photo of the study guide"}</span>
        <input type="file" name="image" accept="image/jpeg,image/png,image/gif,image/webp" capture="environment" className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; setPreview(f ? URL.createObjectURL(f) : null); }} />
      </label>
      <div>
        <label className="label" htmlFor="prepNotes">Or type what it covers</label>
        <textarea id="prepNotes" name="notes" rows={2} maxLength={2000} className="input" placeholder="Adding and subtracting fractions with unlike denominators, word problems" />
      </div>
      <button className="btn w-full" disabled={busy}>{busy ? "Sending…" : "Make my practice plan"}</button>
    </form>
  );
}

/** Refreshes the page every few seconds while a study guide is still being read. */
export function RefreshWhilePending({ pending }: { pending: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!pending) return;
    const id = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(id);
  }, [pending, router]);
  return null;
}
