"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewHomework() {
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/homework", { method: "POST", body: new FormData(e.currentTarget) });
      const data = await res.json().catch(() => ({ error: "Something went wrong." }));
      if (!res.ok) throw new Error(data.error);
      router.push(`/student/homework/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4">
      <h2 className="text-xl font-bold">New problem</h2>
      {error && <p className="error">{error}</p>}
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center hover:border-brand-500">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Your homework" className="max-h-64 rounded-lg" />
        ) : (
          <>
            <span className="text-4xl">📷</span>
            <span className="font-semibold">Take or choose a photo of your problem</span>
          </>
        )}
        <input
          type="file" name="image" accept="image/jpeg,image/png,image/gif,image/webp" capture="environment" className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; setPreview(f ? URL.createObjectURL(f) : null); }}
        />
      </label>
      <div>
        <label className="label" htmlFor="text">Or type it (you can add a note too, like &quot;I&apos;m stuck on number 4&quot;)</label>
        <textarea id="text" name="text" rows={3} maxLength={2000} className="input" />
      </div>
      <button className="btn w-full" disabled={busy}>{busy ? "Reading your problem…" : "Start"}</button>
    </form>
  );
}
