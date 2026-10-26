"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

type Point = { x: number; y: number };

export type ScratchpadHandle = {
  /** The drawing as a PNG on white, or null if nothing has been drawn. */
  toBlob: () => Promise<Blob | null>;
  clear: () => void;
};

const INK = "#1e293b";
const LINE_WIDTH = 3;

/** A graph-paper drawing area where students write out their work with a finger, stylus or mouse. */
export function Scratchpad({ ref, height = 260, onChange }: { ref?: React.Ref<ScratchpadHandle>; height?: number; onChange?: (empty: boolean) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Point[][]>([]);
  const drawing = useRef(false);
  const [count, setCount] = useState(0);

  const redraw = useCallback(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, el.width, el.height);
    ctx.strokeStyle = INK;
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of strokes.current) {
      ctx.beginPath();
      stroke.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (stroke.length === 1) ctx.lineTo(stroke[0].x + 0.1, stroke[0].y);
      ctx.stroke();
    }
  }, []);

  // Match the canvas's pixel size to its displayed size so lines stay sharp.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      el.width = Math.round(el.clientWidth * ratio);
      el.height = Math.round(el.clientHeight * ratio);
      redraw();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [redraw]);

  const changed = (n: number) => {
    setCount(n);
    onChange?.(n === 0);
  };

  const clear = () => {
    strokes.current = [];
    redraw();
    changed(0);
  };

  useImperativeHandle(ref, () => ({
    clear,
    toBlob: () => new Promise((resolve) => {
      const el = canvas.current;
      if (!el || !strokes.current.length) return resolve(null);
      const out = document.createElement("canvas");
      out.width = el.width;
      out.height = el.height;
      const ctx = out.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(el, 0, 0);
      out.toBlob(resolve, "image/png");
    }),
  }));

  const point = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-slate-300">
      <canvas
        ref={canvas}
        aria-label="Scratchpad for showing your work"
        className="block w-full cursor-crosshair touch-none bg-white"
        style={{
          height,
          backgroundImage: "linear-gradient(#e2ecf8 1px, transparent 1px), linear-gradient(90deg, #e2ecf8 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          strokes.current.push([point(e)]);
          redraw();
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          strokes.current.at(-1)!.push(point(e));
          redraw();
        }}
        onPointerUp={() => {
          if (!drawing.current) return;
          drawing.current = false;
          changed(strokes.current.length);
        }}
        onPointerCancel={() => { drawing.current = false; }}
      />
      <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-sm">
        <span className="text-slate-500">Write out your steps</span>
        <div className="flex gap-1">
          <button type="button" disabled={!count} onClick={() => { strokes.current.pop(); redraw(); changed(strokes.current.length); }} className="rounded-lg px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-40">Undo</button>
          <button type="button" disabled={!count} onClick={clear} className="rounded-lg px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-40">Clear</button>
        </div>
      </div>
    </div>
  );
}
