"use client";

import { useState } from "react";
import { useStartTestPrep } from "@/components/StartTestPrep";

type Chapter = { title: string; lessons: string[] };

/** Lets a student tick the chapters and lessons to practice for a test. */
export function TestPrepPicker({ chapters, initial, max }: { chapters: Chapter[]; initial: string[]; max: number }) {
  const [picked, setPicked] = useState(() => new Set(initial));
  const [open, setOpen] = useState(() => new Set(initial.map((k) => Number(k.split(":")[0]))));
  const { start, busy, error } = useStartTestPrep();
  const key = (c: number, l: number) => `${c}:${l}`;

  function toggle(keys: string[], on: boolean) {
    setPicked((s) => {
      const next = new Set(s);
      for (const k of keys) if (on) next.add(k); else next.delete(k);
      return next;
    });
  }

  const tooMany = picked.size > max;
  return (
    <div className="space-y-4">
      <ol className="space-y-2">
        {chapters.map((c, i) => {
          const keys = c.lessons.map((_, j) => key(i, j));
          const count = keys.filter((k) => picked.has(k)).length;
          const all = count === keys.length;
          return (
            <li key={i} className="rounded-xl ring-1 ring-slate-200">
              <div className="flex items-center gap-3 px-3 py-2">
                <input type="checkbox" className="h-5 w-5 accent-brand-600" aria-label={`All of ${c.title}`}
                  checked={all} ref={(el) => { if (el) el.indeterminate = count > 0 && !all; }}
                  onChange={(e) => { toggle(keys, e.target.checked); if (e.target.checked) setOpen((s) => new Set(s).add(i)); }} />
                <button type="button" className="flex flex-1 items-center justify-between gap-2 text-left font-semibold"
                  onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })} aria-expanded={open.has(i)}>
                  <span>{c.title}</span>
                  <span className="shrink-0 text-xs font-semibold text-slate-400">{count ? `${count} picked` : ""} {open.has(i) ? "▲" : "▼"}</span>
                </button>
              </div>
              {open.has(i) && (
                <ul className="space-y-1 border-t border-slate-100 px-3 py-2 pl-11">
                  {c.lessons.map((l, j) => (
                    <li key={j}>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={picked.has(key(i, j))} onChange={(e) => toggle([key(i, j)], e.target.checked)} />
                        {l}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn" disabled={busy || !picked.size || tooMany}
          onClick={() => start([...picked].map((k) => { const [chapter, lesson] = k.split(":").map(Number); return { chapter, lesson }; }))}>
          {busy ? "Starting…" : `Start test prep${picked.size ? ` (${picked.size} lesson${picked.size === 1 ? "" : "s"})` : ""}`}
        </button>
        {tooMany && <span className="text-sm text-rose-700">Pick up to {max} lessons at a time.</span>}
        {error && <span className="text-sm text-rose-700">{error}</span>}
      </div>
    </div>
  );
}
