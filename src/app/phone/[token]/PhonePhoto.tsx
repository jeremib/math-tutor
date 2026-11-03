"use client";

import { useState } from "react";

/** Longest side of a sent photo: plenty to read a worksheet, and well under the upload limit. */
const MAX_SIDE = 2000;

/** Phone photos are often bigger than the upload limit, so they're scaled down to a JPEG first. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

export function PhonePhoto({ token }: { token: string }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function send(file: File) {
    setPreview(URL.createObjectURL(file));
    setState("sending");
    setError(null);
    try {
      const body = new FormData();
      body.set("image", await shrink(file), "homework.jpg");
      const res = await fetch(`/api/photo-handoff/${encodeURIComponent(token)}`, { method: "POST", body });
      const data = await res.json().catch(() => ({ error: "Something went wrong." }));
      if (!res.ok) throw new Error(data.error);
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("idle");
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="error">{error}</p>}
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Your homework" className="max-h-80 w-full rounded-xl object-contain ring-1 ring-slate-200" />
      )}
      {state === "sent" && (
        <p className="rounded-xl bg-emerald-50 p-3 text-center font-semibold text-emerald-700 ring-1 ring-emerald-200">
          ✓ Sent! Look at your computer.
        </p>
      )}
      <label className={`btn w-full cursor-pointer text-center ${state === "sending" ? "pointer-events-none opacity-60" : ""}`}>
        {state === "sending" ? "Sending…" : state === "sent" ? "Retake photo" : "📷 Take photo"}
        <input
          type="file" accept="image/jpeg,image/png,image/gif,image/webp" capture="environment" className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void send(f); }}
        />
      </label>
    </div>
  );
}
