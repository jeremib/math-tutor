// Answer parsing and checking for drill problems.
// Numbers are compared as exact rationals so "0.5", "1/2" and "2/4" all match.

export type AnswerKind = "number" | "remainder" | "choice";

type Rational = { n: bigint; d: bigint };

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
}

function normalize(r: Rational): Rational {
  if (r.d === 0n) throw new Error("zero denominator");
  if (r.d < 0n) r = { n: -r.n, d: -r.d };
  const g = gcd(r.n, r.d) || 1n;
  return { n: r.n / g, d: r.d / g };
}

function parseDecimal(s: string): Rational | null {
  const m = /^([+-]?)(\d*)(?:\.(\d+))?$/.exec(s);
  if (!m || (m[2] === "" && !m[3])) return null;
  const frac = m[3] ?? "";
  const n = BigInt((m[2] || "0") + frac) * (m[1] === "-" ? -1n : 1n);
  return normalize({ n, d: 10n ** BigInt(frac.length) });
}

/** Parses "7", "-3", "2.5", "3/4", "-1 1/2" into an exact rational. */
export function parseRational(input: string): Rational | null {
  const s = input.trim().replace(/,/g, "").replace(/\s+/g, " ");
  if (!s) return null;
  try {
    const mixed = /^([+-]?)(\d+) (\d+)\/(\d+)$/.exec(s);
    if (mixed) {
      const sign = mixed[1] === "-" ? -1n : 1n;
      const whole = BigInt(mixed[2]);
      const n = BigInt(mixed[3]);
      const d = BigInt(mixed[4]);
      return normalize({ n: sign * (whole * d + n), d });
    }
    const frac = /^([+-]?[\d.]+)\s?\/\s?([+-]?[\d.]+)$/.exec(s);
    if (frac) {
      const a = parseDecimal(frac[1]);
      const b = parseDecimal(frac[2]);
      if (!a || !b || b.n === 0n) return null;
      return normalize({ n: a.n * b.d, d: a.d * b.n });
    }
    return parseDecimal(s);
  } catch {
    return null;
  }
}

export function checkAnswer(kind: AnswerKind, expected: string, given: string): boolean {
  const g = given.trim();
  if (!g) return false;
  switch (kind) {
    case "choice":
      return g.toLowerCase() === expected.toLowerCase();
    case "remainder": {
      const parse = (s: string) => /^\s*(-?\d+)\s*(?:r|R|rem|remainder)\s*(\d+)\s*$/.exec(s) ?? /^\s*(-?\d+)\s*$/.exec(s);
      const e = parse(expected);
      const a = parse(g);
      if (!e || !a) return false;
      return Number(e[1]) === Number(a[1]) && Number(e[2] ?? 0) === Number(a[2] ?? 0);
    }
    case "number": {
      const e = parseRational(expected);
      const a = parseRational(g);
      return !!e && !!a && e.n === a.n && e.d === a.d;
    }
  }
}
