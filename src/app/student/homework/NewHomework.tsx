"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type EarlierPhoto = { sessionId: string; url: string; title: string };
type PhoneLink = { token: string; url: string; qr: string; expiresAt: string };

/** How often the computer checks whether the phone has sent its photo. */
const POLL_MS = 2000;

export function NewHomework({ photos = [], initialPhoto }: { photos?: EarlierPhoto[]; initialPhoto?: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(null);
  const [photoFrom, setPhotoFrom] = useState<string | null>(initialPhoto ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState<PhoneLink | null>(null);
  const [phonePhoto, setPhonePhoto] = useState<string | null>(null);
  const [phoneState, setPhoneState] = useState<"off" | "starting" | "waiting" | "expired">("off");
  const reused = photos.find((p) => p.sessionId === photoFrom) ?? null;
  const fromPhone = phone && phonePhoto ? phonePhoto : null;
  const shown = preview ?? fromPhone ?? reused?.url ?? null;

  // While the phone link is open, watch for its photo; a retake on the phone replaces it here too.
  useEffect(() => {
    if (!phone) return;
    let stopped = false;
    const check = async () => {
      if (Date.parse(phone.expiresAt) < Date.now()) { setPhoneState("expired"); return; }
      const res = await fetch(`/api/photo-handoff/${phone.token}`).catch(() => null);
      const data = res?.ok ? await res.json() : null;
      if (stopped) return;
      if (data?.imageUrl) {
        setPhonePhoto((cur) => (cur === data.imageUrl ? cur : data.imageUrl));
        setPreview(null);
        setPhotoFrom(null);
      }
      if (data?.expired) setPhoneState("expired");
      else timer = setTimeout(check, POLL_MS);
    };
    let timer = setTimeout(check, POLL_MS);
    return () => { stopped = true; clearTimeout(timer); };
  }, [phone]);

  async function startPhone() {
    setPhoneState("starting");
    setError(null);
    try {
      const res = await fetch("/api/photo-handoff", { method: "POST" });
      const data = await res.json().catch(() => ({ error: "Something went wrong." }));
      if (!res.ok) throw new Error(data.error);
      setPhone(data);
      setPhonePhoto(null);
      setPhoneState("waiting");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPhoneState("off");
    }
  }

  function closePhone() {
    setPhone(null);
    setPhonePhoto(null);
    setPhoneState("off");
  }

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
            if (f) { setPhotoFrom(null); closePhone(); }
          }}
        />
      </label>
      {!preview && fromPhone && <input type="hidden" name="handoff" value={phone!.token} />}
      {!preview && !fromPhone && photoFrom && <input type="hidden" name="photoFrom" value={photoFrom} />}
      {phone ? (
        <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
          {phoneState === "expired" && !fromPhone ? (
            <p className="text-center text-slate-600">
              That code expired. <button type="button" onClick={startPhone} className="font-semibold text-brand-600">Get a new one</button>
            </p>
          ) : fromPhone ? (
            <p className="text-center font-semibold text-emerald-700">✓ Got the photo from your phone! Retake it on your phone to replace it.</p>
          ) : (
            <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
              <div className="h-40 w-40 shrink-0 rounded-lg bg-white p-1 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: phone.qr }} />
              <div className="space-y-1">
                <p className="font-semibold">Scan this with your phone&apos;s camera</p>
                <p className="text-sm text-slate-600">Take the photo there and it will show up here. Waiting for your photo…</p>
                <p className="break-all text-xs text-slate-400">{phone.url}</p>
              </div>
            </div>
          )}
          <button type="button" onClick={closePhone} className="mt-2 w-full text-sm font-semibold text-slate-500">{fromPhone ? "Remove photo" : "Cancel"}</button>
        </div>
      ) : (
        <button type="button" onClick={startPhone} disabled={phoneState === "starting"} className="btn-secondary hidden w-full md:block">
          {phoneState === "starting" ? "Getting a code…" : "📱 Use my phone to take the photo"}
        </button>
      )}
      {photos.length > 0 && !preview && !fromPhone && (
        <div>
          <p className="label">Or use a photo you took before</p>
          <div className="flex gap-2 overflow-x-auto p-1">
            {photos.map((p) => (
              <button
                key={p.sessionId} type="button" title={p.title} aria-pressed={photoFrom === p.sessionId}
                onClick={() => { closePhone(); setPhotoFrom((cur) => (cur === p.sessionId ? null : p.sessionId)); }}
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
          {reused && !preview && !fromPhone
            ? "Which problem on this page are you working on now? (like \"number 2\")"
            : <>Or type it (you can add a note too, like &quot;I&apos;m stuck on number 4&quot;)</>}
        </label>
        <textarea id="text" name="text" rows={3} maxLength={2000} className="input" />
      </div>
      <button className="btn w-full" disabled={busy}>{busy ? "Reading your problem…" : "Start"}</button>
    </form>
  );
}
