"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const ACCEPT = "image/jpeg,image/png,image/gif,image/webp";

/**
 * Sets a student's textbook. "book" asks for the title and cover; "toc" asks only for
 * table-of-contents photos, for when the chapters couldn't be found online.
 */
export function TextbookForm({ studentId, mode, submit }: { studentId: string; mode: "book" | "toc"; submit: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cover, setCover] = useState<string | null>(null);
  const [pages, setPages] = useState<string[]>([]);

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (mode === "toc" && !pages.length) return setError("Add at least one photo of the table of contents.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/textbook", { method: "POST", body: new FormData(form) });
      const data = await res.json().catch(() => ({ error: "Something went wrong." }));
      if (!res.ok) throw new Error(data.error);
      form.reset();
      setCover(null);
      setPages([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const tocPicker = (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-slate-300 p-3 hover:border-brand-500">
      {pages.length
        // eslint-disable-next-line @next/next/no-img-element
        ? <span className="flex gap-1">{pages.map((p) => <img key={p} src={p} alt="Table of contents page" className="h-16 rounded" />)}</span>
        : <span className="text-2xl">📑</span>}
      <span>
        <span className="block font-semibold">{pages.length ? "Change pages" : "Add photos of the table of contents"}</span>
        <span className="block text-sm text-slate-500">Up to 4 pages, in order.</span>
      </span>
      <input type="file" name="toc" accept={ACCEPT} multiple className="sr-only"
        onChange={(e) => setPages([...(e.target.files ?? [])].slice(0, 4).map((f) => URL.createObjectURL(f)))} />
    </label>
  );

  return (
    <form onSubmit={send} className="space-y-3">
      <input type="hidden" name="studentId" value={studentId} />
      {error && <p className="error">{error}</p>}
      {mode === "book" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="bookTitle">Book title</label>
              <input id="bookTitle" name="title" maxLength={160} className="input" placeholder="Into Math, Grade 4" />
            </div>
            <div>
              <label className="label" htmlFor="bookPublisher">Publisher or series (optional)</label>
              <input id="bookPublisher" name="publisher" maxLength={120} className="input" placeholder="Houghton Mifflin Harcourt" />
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-slate-300 p-3 hover:border-brand-500">
            {cover
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={cover} alt="Book cover" className="h-16 rounded" />
              : <span className="text-2xl">📷</span>}
            <span>
              <span className="block font-semibold">{cover ? "Change photo" : "Add a photo of the cover (optional)"}</span>
              <span className="block text-sm text-slate-500">Helps find the exact edition.</span>
            </span>
            <input type="file" name="cover" accept={ACCEPT} capture="environment" className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; setCover(f ? URL.createObjectURL(f) : null); }} />
          </label>
          <details className="rounded-xl bg-slate-50 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-600">Have the table of contents handy? Add it now</summary>
            <p className="my-2 text-sm text-slate-500">With these photos, Math Buddy reads the chapters straight from the book instead of looking them up.</p>
            {tocPicker}
          </details>
        </>
      )}
      {mode === "toc" && tocPicker}
      <button className="btn w-full" disabled={busy}>{busy ? "Sending…" : submit}</button>
    </form>
  );
}
