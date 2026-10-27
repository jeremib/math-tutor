import { placeParts, type Visual as VisualSpec } from "@/lib/visuals";

const BLUE = "#3b82f6";
const BLUE_LIGHT = "#dbeafe";
const INK = "#334155";
const MUTED = "#94a3b8";
const RED = "#ef4444";

/** Draws a picture model: dots, fraction bars, a number line, base-ten blocks, an array or an area model. */
export function Visual({ visual, className = "" }: { visual: VisualSpec; className?: string }) {
  return (
    <figure className={`overflow-x-auto rounded-xl bg-white p-3 ring-1 ring-slate-200 ${className}`} aria-label={describe(visual)}>
      {render(visual)}
    </figure>
  );
}

function render(v: VisualSpec) {
  switch (v.type) {
    case "dots": return <Dots groups={v.groups} crossed={v.crossed ?? 0} />;
    case "fractions": return <FractionBars bars={v.bars} />;
    case "numberline": return <NumberLine {...v} />;
    case "blocks": return <Blocks values={v.values} />;
    case "array": return <Grid rows={v.rows} cols={v.cols} />;
    case "area": return <AreaModel a={v.a} b={v.b} />;
  }
}

/** A short text version for screen readers. */
function describe(v: VisualSpec): string {
  switch (v.type) {
    case "dots": return `Dots in groups of ${v.groups.join(" and ")}${v.crossed ? `, with ${v.crossed} crossed out` : ""}`;
    case "fractions": return `Fraction bars: ${v.bars.map((b) => (b.n ? `${b.n} of ${b.d} parts shaded` : `${b.d} empty parts`)).join("; ")}`;
    case "numberline": return `Number line from ${v.min} to ${v.max}${v.points.length ? `, marking ${v.points.map((p) => p.value).join(", ")}` : ""}`;
    case "blocks": return `Base-ten blocks for ${v.values.join(" and ")}`;
    case "array": return `${v.rows} rows of ${v.cols} squares`;
    case "area": return `Area model for ${v.a} × ${v.b}`;
  }
}

function Dots({ groups, crossed }: { groups: number[]; crossed: number }) {
  const R = 9, GAP = 24, PER_ROW = 5;
  const widths = groups.map((n) => Math.max(1, Math.min(n, PER_ROW)) * GAP);
  const height = Math.max(1, ...groups.map((n) => Math.ceil(n / PER_ROW))) * GAP;
  const total = groups.reduce((a, b) => a + b, 0);
  let x = 0, index = 0;
  return (
    <svg viewBox={`0 0 ${widths.reduce((a, b) => a + b, 0) + (groups.length - 1) * 30} ${height}`} className="mx-auto block max-h-40 w-full max-w-md">
      {groups.map((n, g) => {
        const left = x;
        x += widths[g] + 30;
        return (
          <g key={g}>
            {Array.from({ length: n }, (_, i) => {
              const cx = left + (i % PER_ROW) * GAP + GAP / 2, cy = Math.floor(i / PER_ROW) * GAP + GAP / 2;
              const isCrossed = index++ >= total - crossed;
              return (
                <g key={i}>
                  <circle cx={cx} cy={cy} r={R} fill={g === 0 ? BLUE : "#f59e0b"} opacity={isCrossed ? 0.35 : 1} />
                  {isCrossed && <path d={`M${cx - R} ${cy - R}L${cx + R} ${cy + R}M${cx + R} ${cy - R}L${cx - R} ${cy + R}`} stroke={RED} strokeWidth={3} />}
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

function FractionBars({ bars }: { bars: { n: number; d: number; label?: string }[] }) {
  const W = 360, H = 34, LABEL = 56, GAP = 12;
  return (
    <svg viewBox={`0 0 ${W + LABEL} ${bars.length * (H + GAP)}`} className="mx-auto block w-full max-w-lg">
      {bars.map((bar, row) => {
        const y = row * (H + GAP);
        const part = W / bar.d;
        // A bar can hold more than one whole (e.g. 5/4); extra parts wrap visually by shading the whole bar.
        return (
          <g key={row}>
            <text x={LABEL - 10} y={y + H / 2 + 6} textAnchor="end" fontSize={18} fontWeight={700} fill={INK}>{bar.label ?? `${bar.n}/${bar.d}`}</text>
            {Array.from({ length: bar.d }, (_, i) => (
              <rect key={i} x={LABEL + i * part} y={y} width={part} height={H} fill={i < bar.n ? BLUE : "#fff"} stroke={INK} strokeWidth={1.5} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function NumberLine({ min, max, step, points }: { min: number; max: number; step: number; points: { value: number; label?: string }[] }) {
  const W = 520, PAD = 24, Y = 52;
  const ticks = Math.round((max - min) / step);
  const xOf = (v: number) => PAD + ((v - min) / (max - min)) * (W - 2 * PAD);
  // Label every tick when there's room, otherwise every 5th plus the ends.
  const labelEvery = ticks <= 12 ? 1 : 5;
  const fmt = (v: number) => String(Math.round(v * 1000) / 1000);
  return (
    <svg viewBox={`0 0 ${W} 84`} className="mx-auto block w-full max-w-xl">
      <line x1={PAD - 10} x2={W - PAD + 10} y1={Y} y2={Y} stroke={INK} strokeWidth={2} markerEnd="url(#nl-arrow)" markerStart="url(#nl-arrow)" />
      <defs>
        <marker id="nl-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill={INK} />
        </marker>
      </defs>
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const v = min + i * step, x = xOf(v);
        const labeled = i % labelEvery === 0 || i === ticks;
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={Y - (labeled ? 8 : 5)} y2={Y + (labeled ? 8 : 5)} stroke={INK} strokeWidth={1.5} />
            {labeled && <text x={x} y={Y + 26} textAnchor="middle" fontSize={13} fill={MUTED}>{fmt(v)}</text>}
          </g>
        );
      })}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={xOf(p.value)} cy={Y} r={7} fill={BLUE} stroke="#fff" strokeWidth={2} />
          {p.label && <text x={xOf(p.value)} y={Y - 16 - (i % 2) * 14} textAnchor="middle" fontSize={14} fontWeight={700} fill={INK}>{p.label}</text>}
        </g>
      ))}
    </svg>
  );
}

function Blocks({ values }: { values: number[] }) {
  const U = 9; // one unit square
  const groups = values.map((v) => ({ hundreds: Math.floor(v / 100), tens: Math.floor(v / 10) % 10, ones: v % 10 }));
  const groupWidth = (g: (typeof groups)[number]) => g.hundreds * (10 * U + 6) + g.tens * (U + 5) + (g.ones ? 2 * U + 12 : 0) + 4;
  const H = 10 * U;
  let x = 0;
  return (
    <svg viewBox={`0 0 ${Math.max(40, groups.reduce((a, g) => a + groupWidth(g), 0) + (groups.length - 1) * 36)} ${H + 22}`} className="mx-auto block max-h-48 w-full max-w-xl">
      {groups.map((g, gi) => {
        const left = x;
        x += groupWidth(g) + 36;
        let cx = left;
        const parts = [];
        for (let h = 0; h < g.hundreds; h++, cx += 10 * U + 6) {
          parts.push(<g key={`h${h}`}>{Array.from({ length: 10 }, (_, r) => Array.from({ length: 10 }, (_, c) => (
            <rect key={`${r}-${c}`} x={cx + c * U} y={r * U} width={U} height={U} fill={BLUE} stroke="#fff" strokeWidth={0.8} />
          )))}</g>);
        }
        for (let t = 0; t < g.tens; t++, cx += U + 5) {
          parts.push(<g key={`t${t}`}>{Array.from({ length: 10 }, (_, r) => (
            <rect key={r} x={cx} y={r * U} width={U} height={U} fill="#f59e0b" stroke="#fff" strokeWidth={0.8} />
          ))}</g>);
        }
        parts.push(<g key="o">{Array.from({ length: g.ones }, (_, i) => (
          <rect key={i} x={cx + 4 + (i % 2) * (U + 2)} y={H - U - Math.floor(i / 2) * (U + 2)} width={U} height={U} fill="#10b981" />
        ))}</g>);
        return (
          <g key={gi}>
            {parts}
            <text x={left} y={H + 18} fontSize={13} fontWeight={700} fill={INK}>{values[gi]}</text>
            {gi < groups.length - 1 && <text x={left + groupWidth(g) + 12} y={H / 2 + 8} fontSize={24} fontWeight={700} fill={MUTED}>+</text>}
          </g>
        );
      })}
    </svg>
  );
}

function Grid({ rows, cols }: { rows: number; cols: number }) {
  const S = 22;
  return (
    <svg viewBox={`0 0 ${cols * S + 40} ${rows * S + 30}`} className="mx-auto block max-h-72 w-full max-w-md">
      <text x={20 + (cols * S) / 2} y={14} textAnchor="middle" fontSize={13} fontWeight={700} fill={INK}>{cols}</text>
      <text x={10} y={22 + (rows * S) / 2} textAnchor="middle" fontSize={13} fontWeight={700} fill={INK}>{rows}</text>
      {Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (
        <rect key={`${r}-${c}`} x={20 + c * S} y={22 + r * S} width={S} height={S} fill={BLUE_LIGHT} stroke={BLUE} strokeWidth={1.2} />
      )))}
    </svg>
  );
}

function AreaModel({ a, b }: { a: number; b: number }) {
  const top = placeParts(a), side = placeParts(b);
  const W = 420, H = 200, L = 60, T = 28;
  // Widths grow with the part's size, but small parts stay wide enough to label.
  const share = (parts: number[], total: number) => {
    const raw = parts.map((p) => Math.max(0.18, p / parts.reduce((x, y) => x + y, 0)));
    const sum = raw.reduce((x, y) => x + y, 0);
    return raw.map((r) => (r / sum) * total);
  };
  const ws = share(top, W - L), hs = share(side, H - T);
  const xs = ws.map((_, i) => L + ws.slice(0, i).reduce((x, y) => x + y, 0));
  const ys = hs.map((_, i) => T + hs.slice(0, i).reduce((x, y) => x + y, 0));
  return (
    <svg viewBox={`0 0 ${W + 4} ${H + 4}`} className="mx-auto block w-full max-w-lg">
      {top.map((p, i) => <text key={i} x={xs[i] + ws[i] / 2} y={18} textAnchor="middle" fontSize={15} fontWeight={700} fill={INK}>{p}</text>)}
      {side.map((p, j) => <text key={j} x={L - 10} y={ys[j] + hs[j] / 2 + 5} textAnchor="end" fontSize={15} fontWeight={700} fill={INK}>{p}</text>)}
      {side.map((q, j) => top.map((p, i) => (
        <g key={`${i}-${j}`}>
          <rect x={xs[i]} y={ys[j]} width={ws[i]} height={hs[j]} fill={(i + j) % 2 ? BLUE_LIGHT : "#eff6ff"} stroke={BLUE} strokeWidth={1.5} />
          <text x={xs[i] + ws[i] / 2} y={ys[j] + hs[j] / 2 + 5} textAnchor="middle" fontSize={13} fill={INK}>{p} × {q}</text>
        </g>
      )))}
    </svg>
  );
}
