"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type EarlierPhoto = { sessionId: string; url: string; title: string };

export function NewHomework({ photos = [], initialPhoto }: { photos?: EarlierPhoto[]; initialPhoto?: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(null);
  const [photoFrom, setPhotoFrom] = useState<string | null>(initialPhoto ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reused = photos.find((p) => p.sessionId === photoFrom) ?? null;
  const shown = preview ?? reused?.url ?? null;

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
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="Your homework" className="max-h-64 rounded-lg" />
        ) : (
          <>
            <span className="text-4xl">📷</span>
            <span className="font-semibold">Take or choose a photo of your problem</span>
          </>
        )}
        <input
          type="file" name="image" accept="image/jpeg,image/png,image/gif,image/webp" capture="environment" className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setPreview(f ? URL.createObjectURL(f) : null);
            if (f) setPhotoFrom(null);
          }}
        />
      </label>
      {!preview && photoFrom && <input type="hidden" name="photoFrom" value={photoFrom} />}
      {photos.length > 0 && !preview && (
        <div>
          <p className="label">Or use a photo you took before</p>
          <div className="flex gap-2 overflow-x-auto p-1">
            {photos.map((p) => (
              <button
                key={p.sessionId} type="button" title={p.title} aria-pressed={photoFrom === p.sessionId}
                onClick={() => setPhotoFrom((cur) => (cur === p.sessionId ? null : p.sessionId))}
                className={`shrink-0 overflow-hidden rounded-xl ring-2 ${photoFrom === p.sessionId ? "ring-brand-500" : "ring-transparent hover:ring-slate-300"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.title} className="h-20 w-20 object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <label className="label" htmlFor="text">
          {reused && !preview
            ? "Which problem on this page are you working on now? (like \"number 2\")"
            : <>Or type it (you can add a note too, like &quot;I&apos;m stuck on number 4&quot;)</>}
        </label>
        <textarea id="text" name="text" rows={3} maxLength={2000} className="input" />
      </div>
      <button className="btn w-full" disabled={busy}>{busy ? "Reading your problem…" : "Start"}</button>
    </form>
  );
}
