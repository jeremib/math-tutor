// Pure helper for showing fractions stacked, like a textbook, instead of as 3/4 on one line.

export type MathPart = { text: string } | { whole?: string; num: string; den: string };

/**
 * A fraction like 3/4, x/5 or 2/y, or a mixed number like 1 1/2. Not part of a longer token, so
 * dates (10/12/2025), decimals (1.5/2) and units (km/h) are left alone. A sentence's period after it is fine.
 */
const FRACTION = /(?<![\w./])(?:(\d+) +)?(\d+|[a-zA-Z])\/(\d+|[a-zA-Z])(?![\w/]|\.\d)/g;

/** Splits text into plain runs and fractions. A fraction of two letters (like w/o) stays text. */
export function splitFractions(text: string): MathPart[] {
  const parts: MathPart[] = [];
  let last = 0;
  for (const m of text.matchAll(FRACTION)) {
    const [, whole, num, den] = m;
    if (!/\d/.test(num + den)) continue;
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push(whole ? { whole, num, den } : { num, den });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
