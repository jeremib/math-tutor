"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Starts a test prep on the given lessons and opens it. */
export function useStartTestPrep() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function start(lessons: { chapter: number; lesson: number }[]) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/chapter-test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lessons }) }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (res?.ok && data?.id) return router.push(`/student/test-prep/${data.id}`);
    setError(data?.error ?? "Couldn't start the test prep. Check your connection and try again.");
    setBusy(false);
  }
  return { start, busy, error };
}

/** A button that starts a new test prep on a set of lessons, like a retake or the weak spots. */
export function StartTestPrepButton({ lessons, label, secondary }: { lessons: { chapter: number; lesson: number }[]; label: string; secondary?: boolean }) {
  const { start, busy, error } = useStartTestPrep();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" disabled={busy} onClick={() => start(lessons)} className={secondary ? "btn-secondary" : "btn"}>{busy ? "Starting…" : label}</button>
      {error && <span className="text-sm text-rose-700">{error}</span>}
    </span>
  );
}
