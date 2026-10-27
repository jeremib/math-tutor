// Picture models drawn next to a problem's hint and explanation. Pure data; rendered by components/Visual.tsx.

export type Visual =
  /** Groups of dots to count, e.g. 3 and 4 for 3 + 4. `crossed` dots at the end are crossed out (for subtraction). */
  | { type: "dots"; groups: number[]; crossed?: number }
  /** Fraction bars split into d parts with n shaded. An unshaded bar (n = 0) shows the pieces to work with. */
  | { type: "fractions"; bars: { n: number; d: number; label?: string }[] }
  /** A number line from min to max with labeled points. */
  | { type: "numberline"; min: number; max: number; step: number; points: { value: number; label?: string }[] }
  /** Base-ten blocks for one or more whole numbers up to 999. */
  | { type: "blocks"; values: number[] }
  /** A rows × cols grid of squares, for multiplication, division and area. */
  | { type: "array"; rows: number; cols: number }
  /** An area model splitting a × b into place-value parts, e.g. 23 × 14 = (20+3) × (10+4). */
  | { type: "area"; a: number; b: number };

const ok = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const int = (x: unknown, min: number, max: number) => ok(x) && Number.isInteger(x) && x >= min && x <= max;

/** Checks a visual from an untrusted source (Claude's output) before rendering it. */
export function validVisual(v: unknown): v is Visual {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  switch (o.type) {
    case "dots":
      return Array.isArray(o.groups) && o.groups.length >= 1 && o.groups.length <= 3 && o.groups.every((g) => int(g, 0, 20))
        && (o.crossed === undefined || int(o.crossed, 0, 20));
    case "fractions":
      return Array.isArray(o.bars) && o.bars.length >= 1 && o.bars.length <= 4
        && o.bars.every((b) => b && int(b.n, 0, 48) && int(b.d, 1, 24) && (b.label === undefined || typeof b.label === "string"));
    case "numberline": {
      const { min, max, step, points } = o;
      if (!ok(min) || !ok(max) || !ok(step) || max <= min || step <= 0 || (max - min) / step > 40) return false;
      return Array.isArray(points) && points.length <= 6 && points.every((p) => p && ok(p.value) && p.value >= min && p.value <= max);
    }
    case "blocks":
      return Array.isArray(o.values) && o.values.length >= 1 && o.values.length <= 2 && o.values.every((v) => int(v, 0, 999));
    case "array":
      return int(o.rows, 1, 12) && int(o.cols, 1, 12);
    case "area":
      return int(o.a, 2, 9999) && int(o.b, 2, 99);
    default:
      return false;
  }
}

const MARKER = /\[\[VISUAL\s+(\{.*?\})\s*\]\]/g;

export type Segment = { text: string } | { visual: Visual };

/**
 * Splits a tutor message into text and visuals. The tutor writes a visual as
 * [[VISUAL {"type":"fractions",...}]] on its own line; invalid ones are dropped.
 */
export function splitVisuals(message: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of message.matchAll(MARKER)) {
    const before = message.slice(last, m.index).trim();
    if (before) out.push({ text: before });
    try {
      const v: unknown = JSON.parse(m[1]);
      if (validVisual(v)) out.push({ visual: v });
    } catch {
      // Not JSON: skip it rather than showing the raw marker.
    }
    last = m.index! + m[0].length;
  }
  const rest = message.slice(last).trim();
  if (rest) out.push({ text: rest });
  return out;
}

/** The message with visual markers removed, for reading aloud. */
export const withoutVisuals = (message: string) => message.replace(MARKER, " ").replace(/\s{2,}/g, " ").trim();

/** Splits a whole number into place-value parts, biggest first: 234 -> [200, 30, 4]. */
export function placeParts(n: number): number[] {
  const parts: number[] = [];
  let place = 1;
  for (let x = n; x > 0; x = Math.floor(x / 10), place *= 10) {
    if (x % 10) parts.unshift((x % 10) * place);
  }
  return parts.length ? parts : [0];
}
