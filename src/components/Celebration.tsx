"use client";

import { useEffect, useRef, useState } from "react";
import type { AwardSummary } from "@/lib/achievements";
import { levelTitle } from "@/lib/gamification";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

/** A short burst of canvas confetti. Respects reduced-motion settings. */
export function Confetti({ fire }: { fire: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!fire || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const pieces = Array.from({ length: 140 }, () => ({
      x: canvas.width / 2 + (Math.random() - 0.5) * 120,
      y: canvas.height * 0.35,
      vx: (Math.random() - 0.5) * 16,
      vy: -Math.random() * 14 - 4,
      size: 6 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }));
    let frame = 0;
    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of pieces) {
        p.vy += 0.35;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.spin;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, 1 - frame / 160);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (++frame < 160) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fire]);
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-50" aria-hidden />;
}

/**
 * Shows what a student just earned: XP toasts for small wins, and a full-screen
 * card with confetti for level-ups and new badges.
 */
export function Celebration({ award }: { award: AwardSummary | null }) {
  const [toast, setToast] = useState<string[] | null>(null);
  const [big, setBig] = useState<AwardSummary | null>(null);
  const [fire, setFire] = useState(0);

  useEffect(() => {
    if (!award || (!award.xp && !award.badges.length)) return;
    if (award.leveledUp || award.badges.length) {
      setBig(award);
      setFire((f) => f + 1);
    }
    setToast(award.messages.length ? award.messages : [`+${award.xp} XP`]);
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [award]);

  return (
    <>
      <Confetti fire={fire} />
      {toast && (
        <div role="status" className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <div className="animate-[pop_0.3s_ease-out] rounded-2xl bg-slate-900 px-5 py-3 font-bold text-white shadow-xl">
            {toast.map((m) => <div key={m}>⚡ {m}</div>)}
          </div>
        </div>
      )}
      {big && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/50 p-4" onClick={() => setBig(null)}>
          <div role="dialog" aria-modal className="w-full max-w-sm animate-[pop_0.3s_ease-out] rounded-3xl bg-white p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {big.leveledUp && (
              <div className="mb-4">
                <div className="text-6xl">🎊</div>
                <div className="mt-2 text-sm font-bold uppercase tracking-wide text-brand-600">Level up!</div>
                <div className="text-4xl font-extrabold">Level {big.level}</div>
                <div className="font-semibold text-slate-500">{levelTitle(big.level)}</div>
              </div>
            )}
            {big.badges.length > 0 && (
              <div className="space-y-3">
                <div className="text-sm font-bold uppercase tracking-wide text-amber-600">New badge{big.badges.length > 1 ? "s" : ""}!</div>
                {big.badges.map((b) => (
                  <div key={b.id} className="flex items-center gap-3 rounded-2xl bg-amber-50 p-3 text-left ring-1 ring-amber-200">
                    <span className="text-4xl">{b.emoji}</span>
                    <div>
                      <div className="font-bold">{b.name}</div>
                      <div className="text-sm text-slate-600">{b.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button className="btn mt-5 w-full" onClick={() => setBig(null)} autoFocus>Awesome!</button>
          </div>
        </div>
      )}
    </>
  );
}
