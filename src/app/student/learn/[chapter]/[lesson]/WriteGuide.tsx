"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/** Asks the server to write a lesson's mini-lesson, then shows it. */
export function WriteGuide({ chapter, lesson }: { chapter: number; lesson: number }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const write = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/lesson-guide", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chapter, lesson }),
    }).catch(() => null);
    if (res?.ok) return router.refresh();
    const data = await res?.json().catch(() => null);
    setError(data?.error ?? "Couldn't reach the tutor. Check your connection and try again.");
  }, [chapter, lesson, router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void write();
  }, [write]);

  return error ? (
    <div className="card space-y-3">
      <p className="text-slate-700">{error}</p>
      <button type="button" onClick={write} className="btn">Try again</button>
    </div>
  ) : (
    <div className="card flex items-center gap-4" role="status">
      <span className="animate-bounce text-4xl">✏️</span>
      <div>
        <p className="font-bold">Writing this lesson for you…</p>
        <p className="text-sm text-slate-500">This takes about a minute the first time. After that it&apos;s saved.</p>
      </div>
    </div>
  );
}
