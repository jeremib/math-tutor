import type { AnswerKind } from "./answers.ts";
import type { Visual } from "./visuals.ts";

export type Problem = {
  prompt: string;
  answer: string;
  answerKind: AnswerKind;
  hint: string;
  explanation: string;
  /** Choices to show as buttons for "choice" problems. */
  choices?: string[];
  /** A picture model shown with the hint and the explanation. It must not give the answer away. */
  visual?: Visual;
};

export type Skill = {
  id: string;
  grade: number; // 0 = kindergarten
  strand: string;
  name: string;
  description: string;
  generate: (rand: () => number) => Problem;
};

// ---------- helpers ----------

const int = (rand: () => number, min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T,>(rand: () => number, items: T[]): T => items[Math.floor(rand() * items.length)];
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;

function fraction(n: number, d: number): string {
  if (d < 0) [n, d] = [-n, -d];
  const g = gcd(n, d) || 1;
  n /= g;
  d /= g;
  return d === 1 ? String(n) : `${n}/${d}`;
}

/** Rounds away float noise, e.g. 0.30000000000000004 -> "0.3". */
const dec = (x: number) => String(Math.round(x * 1e6) / 1e6);

function numberProblem(prompt: string, answer: number | string, hint: string, explanation: string, visual?: Visual): Problem {
  return { prompt, answer: String(answer), answerKind: "number", hint, explanation, ...(visual ? { visual } : {}) };
}

// ---------- skills ----------

export const SKILLS: Skill[] = [
  // Kindergarten
  {
    id: "k-count-on", grade: 0, strand: "Counting", name: "What comes next?",
    description: "Count forward from a number.",
    generate: (r) => {
      const a = int(r, 1, 18);
      return numberProblem(`What number comes after ${a}?`, a + 1, `Count out loud: ${a}, ...`, `${a} and one more is ${a + 1}.`,
        { type: "numberline", min: Math.max(0, a - 4), max: a + 4, step: 1, points: [{ value: a, label: String(a) }] });
    },
  },
  {
    id: "k-add-5", grade: 0, strand: "Addition", name: "Adding within 5",
    description: "Add two small numbers with a sum up to 5.",
    generate: (r) => {
      const a = int(r, 0, 5);
      const b = int(r, 0, 5 - a);
      return numberProblem(`${a} + ${b} = ?`, a + b, `Hold up ${a} fingers, then ${b} more. Count them all.`, `${a} + ${b} = ${a + b}`, { type: "dots", groups: [a, b] });
    },
  },
  // Grade 1
  {
    id: "g1-add-10", grade: 1, strand: "Addition", name: "Adding within 10",
    description: "Addition facts with sums up to 10.",
    generate: (r) => {
      const a = int(r, 0, 10);
      const b = int(r, 0, 10 - a);
      return numberProblem(`${a} + ${b} = ?`, a + b, `Start at the bigger number, ${Math.max(a, b)}, and count up ${Math.min(a, b)}.`, `${a} + ${b} = ${a + b}`, { type: "dots", groups: [a, b] });
    },
  },
  {
    id: "g1-sub-10", grade: 1, strand: "Subtraction", name: "Subtracting within 10",
    description: "Subtraction facts from numbers up to 10.",
    generate: (r) => {
      const a = int(r, 1, 10);
      const b = int(r, 0, a);
      return numberProblem(`${a} − ${b} = ?`, a - b, `Start at ${a} and count back ${b}.`, `${a} − ${b} = ${a - b}`, { type: "dots", groups: [a], crossed: b });
    },
  },
  {
    id: "g1-add-20", grade: 1, strand: "Addition", name: "Adding within 20",
    description: "Addition facts with sums up to 20.",
    generate: (r) => {
      const a = int(r, 2, 12);
      const b = int(r, 2, 20 - a);
      return numberProblem(`${a} + ${b} = ?`, a + b, `Try making a 10 first: how much does ${Math.max(a, b)} need to get to 10?`, `${a} + ${b} = ${a + b}`, { type: "dots", groups: [a, b] });
    },
  },
  {
    id: "g1-sub-20", grade: 1, strand: "Subtraction", name: "Subtracting within 20",
    description: "Subtraction facts from numbers up to 20.",
    generate: (r) => {
      const a = int(r, 11, 20);
      const b = int(r, 2, a - 1);
      return numberProblem(`${a} − ${b} = ?`, a - b, `Think addition: ${b} + ? = ${a}`, `${a} − ${b} = ${a - b}`, { type: "dots", groups: [a], crossed: b });
    },
  },
  {
    id: "g1-compare", grade: 1, strand: "Number sense", name: "Comparing numbers",
    description: "Use <, > and = to compare numbers up to 100.",
    generate: (r) => {
      const a = int(r, 1, 99);
      const b = r() < 0.15 ? a : int(r, 1, 99);
      const answer = a > b ? ">" : a < b ? "<" : "=";
      return {
        prompt: `Which sign makes this true?  ${a} ☐ ${b}`,
        answer, answerKind: "choice", choices: ["<", "=", ">"],
        hint: "Compare the tens digits first. The open side of < or > faces the bigger number.",
        explanation: `${a} ${answer} ${b}`,
        visual: { type: "numberline", min: 0, max: 100, step: 10, points: [{ value: a, label: String(a) }, { value: b, label: String(b) }] },
      };
    },
  },
  // Grade 2
  {
    id: "g2-place-value", grade: 2, strand: "Number sense", name: "Place value",
    description: "Identify hundreds, tens and ones.",
    generate: (r) => {
      const n = int(r, 100, 999);
      const place = pick(r, ["hundreds", "tens", "ones"] as const);
      const digit = place === "hundreds" ? Math.floor(n / 100) : place === "tens" ? Math.floor(n / 10) % 10 : n % 10;
      return numberProblem(`What digit is in the ${place} place of ${n}?`, digit, "From the right: ones, then tens, then hundreds.", `In ${n}, the ${place} digit is ${digit}.`, { type: "blocks", values: [n] });
    },
  },
  {
    id: "g2-add-100", grade: 2, strand: "Addition", name: "Two-digit addition",
    description: "Add two-digit numbers, with regrouping.",
    generate: (r) => {
      const a = int(r, 12, 79);
      const b = int(r, 11, 99 - a);
      return numberProblem(`${a} + ${b} = ?`, a + b, "Add the ones first. If you get 10 or more, carry a ten.", `${a} + ${b} = ${a + b}`, { type: "blocks", values: [a, b] });
    },
  },
  {
    id: "g2-sub-100", grade: 2, strand: "Subtraction", name: "Two-digit subtraction",
    description: "Subtract two-digit numbers, with borrowing.",
    generate: (r) => {
      const a = int(r, 30, 99);
      const b = int(r, 11, a - 1);
      return numberProblem(`${a} − ${b} = ?`, a - b, "Subtract the ones first. If the top digit is smaller, borrow a ten.", `${a} − ${b} = ${a - b}`, { type: "blocks", values: [a] });
    },
  },
  {
    id: "g2-skip-count", grade: 2, strand: "Number sense", name: "Skip counting",
    description: "Continue counting by 2s, 5s, 10s and 100s.",
    generate: (r) => {
      const step = pick(r, [2, 5, 10, 100]);
      const start = step * int(r, 0, 9);
      const seq = [0, 1, 2, 3].map((i) => start + i * step);
      return numberProblem(`What comes next? ${seq.join(", ")}, ...`, start + 4 * step, "How much does the number grow each time?", `Counting by ${step}s: next is ${start + 4 * step}.`,
        { type: "numberline", min: start, max: start + 5 * step, step, points: seq.map((v) => ({ value: v, label: String(v) })) });
    },
  },
  // Grade 3
  {
    id: "g3-add-1000", grade: 3, strand: "Addition", name: "Three-digit addition",
    description: "Add and subtract within 1000.",
    generate: (r) => {
      if (r() < 0.5) {
        const a = int(r, 120, 700);
        const b = int(r, 100, 999 - a);
        return numberProblem(`${a} + ${b} = ?`, a + b, "Line up the ones, tens and hundreds. Carry when a column reaches 10.", `${a} + ${b} = ${a + b}`);
      }
      const a = int(r, 300, 999);
      const b = int(r, 100, a - 1);
      return numberProblem(`${a} − ${b} = ?`, a - b, "Line up the places and subtract column by column, borrowing when needed.", `${a} − ${b} = ${a - b}`);
    },
  },
  {
    id: "g3-mult-facts", grade: 3, strand: "Multiplication", name: "Multiplication facts",
    description: "Times tables from 0 to 10.",
    generate: (r) => {
      const a = int(r, 2, 10);
      const b = int(r, 0, 10);
      return numberProblem(`${a} × ${b} = ?`, a * b, `${a} × ${b} means ${b} groups of ${a}. Skip count by ${a}.`, `${a} × ${b} = ${a * b}`,
        b > 0 ? { type: "array", rows: b, cols: a } : undefined);
    },
  },
  {
    id: "g3-div-facts", grade: 3, strand: "Division", name: "Division facts",
    description: "Divide using known multiplication facts.",
    generate: (r) => {
      const b = int(r, 2, 10);
      const q = int(r, 1, 10);
      return numberProblem(`${b * q} ÷ ${b} = ?`, q, `Think: ${b} × ? = ${b * q}`, `${b} × ${q} = ${b * q}, so ${b * q} ÷ ${b} = ${q}.`, { type: "array", rows: b, cols: q });
    },
  },
  {
    id: "g3-rounding", grade: 3, strand: "Number sense", name: "Rounding",
    description: "Round to the nearest 10 or 100.",
    generate: (r) => {
      const n = int(r, 11, 989);
      const to = pick(r, [10, 100]);
      const ans = Math.round(n / to) * to;
      return numberProblem(`Round ${n} to the nearest ${to}.`, ans, `Look at the digit to the right of the ${to === 10 ? "tens" : "hundreds"} place. 5 or more rounds up.`, `${n} rounds to ${ans}.`,
        { type: "numberline", min: Math.floor(n / to) * to, max: Math.floor(n / to) * to + to, step: to / 10, points: [{ value: n, label: String(n) }] });
    },
  },
  {
    id: "g3-area", grade: 3, strand: "Geometry", name: "Area of rectangles",
    description: "Find area by multiplying length and width.",
    generate: (r) => {
      const l = int(r, 2, 12);
      const w = int(r, 2, 10);
      return numberProblem(`A rectangle is ${l} units long and ${w} units wide. What is its area in square units?`, l * w, "Area = length × width.", `${l} × ${w} = ${l * w} square units.`, { type: "array", rows: w, cols: l });
    },
  },
  {
    id: "g3-unit-fractions", grade: 3, strand: "Fractions", name: "Fractions of a group",
    description: "Find a unit fraction of a whole number.",
    generate: (r) => {
      const d = int(r, 2, 6);
      const q = int(r, 1, 8);
      return numberProblem(`What is 1/${d} of ${d * q}?`, q, `Split ${d * q} into ${d} equal groups.`, `${d * q} ÷ ${d} = ${q}`, { type: "array", rows: d, cols: q });
    },
  },
  // Grade 4
  {
    id: "g4-mult-1digit", grade: 4, strand: "Multiplication", name: "Multi-digit × one digit",
    description: "Multiply a 2–4 digit number by a one-digit number.",
    generate: (r) => {
      const a = int(r, 23, 2500);
      const b = int(r, 3, 9);
      return numberProblem(`${a} × ${b} = ?`, a * b, "Multiply each place value, starting from the ones, and carry.", `${a} × ${b} = ${a * b}`, { type: "area", a, b });
    },
  },
  {
    id: "g4-mult-2digit", grade: 4, strand: "Multiplication", name: "Two-digit × two-digit",
    description: "Multiply two two-digit numbers.",
    generate: (r) => {
      const a = int(r, 12, 99);
      const b = int(r, 11, 99);
      return numberProblem(`${a} × ${b} = ?`, a * b, `Break it apart: ${a} × ${Math.floor(b / 10) * 10} + ${a} × ${b % 10}.`, `${a} × ${b} = ${a * b}`, { type: "area", a, b });
    },
  },
  {
    id: "g4-long-div", grade: 4, strand: "Division", name: "Division with remainders",
    description: "Divide and give the quotient and remainder (e.g. 7 R 2).",
    generate: (r) => {
      const d = int(r, 3, 9);
      const n = int(r, 25, 400);
      const q = Math.floor(n / d);
      const rem = n % d;
      return {
        prompt: `${n} ÷ ${d} = ?  (Write the remainder like 7 R 2)`,
        answer: `${q} R ${rem}`, answerKind: "remainder",
        hint: `How many times does ${d} fit into ${n}? Whatever is left over is the remainder.`,
        explanation: `${d} × ${q} = ${d * q}, and ${n} − ${d * q} = ${rem}, so ${q} R ${rem}.`,
      };
    },
  },
  {
    id: "g4-equiv-fractions", grade: 4, strand: "Fractions", name: "Equivalent fractions",
    description: "Find the missing number in equivalent fractions.",
    generate: (r) => {
      const d = int(r, 2, 9);
      const n = int(r, 1, d - 1);
      const k = int(r, 2, 6);
      return numberProblem(`${n}/${d} = ?/${d * k}`, n * k, `What did you multiply ${d} by to get ${d * k}? Do the same to the top.`, `${d} × ${k} = ${d * k}, so ${n} × ${k} = ${n * k}.`,
        d * k <= 24 ? { type: "fractions", bars: [{ n, d, label: `${n}/${d}` }, { n: 0, d: d * k, label: `?/${d * k}` }] } : undefined);
    },
  },
  {
    id: "g4-add-like-fractions", grade: 4, strand: "Fractions", name: "Adding like fractions",
    description: "Add and subtract fractions with the same denominator.",
    generate: (r) => {
      const d = int(r, 3, 12);
      const a = int(r, 1, d - 1);
      const b = int(r, 1, d - 1);
      if (r() < 0.5 && a !== b) {
        const [hi, lo] = a > b ? [a, b] : [b, a];
        return numberProblem(`${hi}/${d} − ${lo}/${d} = ?`, fraction(hi - lo, d), "When the bottoms match, just subtract the tops.", `${hi}/${d} − ${lo}/${d} = ${hi - lo}/${d}`,
          { type: "fractions", bars: [{ n: hi, d, label: `${hi}/${d}` }, { n: lo, d, label: `${lo}/${d}` }] });
      }
      return numberProblem(`${a}/${d} + ${b}/${d} = ?`, fraction(a + b, d), "When the bottoms match, just add the tops.", `${a}/${d} + ${b}/${d} = ${a + b}/${d}`,
        { type: "fractions", bars: [{ n: a, d, label: `${a}/${d}` }, { n: b, d, label: `${b}/${d}` }] });
    },
  },
  {
    id: "g4-decimals", grade: 4, strand: "Decimals", name: "Decimal place value",
    description: "Write tenths and hundredths as decimals.",
    generate: (r) => {
      const d = pick(r, [10, 100]);
      const n = int(r, 1, d - 1);
      return numberProblem(`Write ${n}/${d} as a decimal.`, dec(n / d), d === 10 ? "Tenths go one place after the decimal point." : "Hundredths go two places after the decimal point.", `${n}/${d} = ${dec(n / d)}`);
    },
  },
  // Grade 5
  {
    id: "g5-add-unlike-fractions", grade: 5, strand: "Fractions", name: "Adding unlike fractions",
    description: "Add fractions with different denominators.",
    generate: (r) => {
      const d1 = int(r, 2, 8);
      let d2 = int(r, 2, 9);
      if (d2 === d1) d2 += 1;
      const a = int(r, 1, d1 - 1);
      const b = int(r, 1, d2 - 1);
      const L = lcm(d1, d2);
      return numberProblem(`${a}/${d1} + ${b}/${d2} = ?`, fraction(a * (L / d1) + b * (L / d2), L), `Find a common denominator. Try ${L}.`, `${a}/${d1} + ${b}/${d2} = ${a * (L / d1)}/${L} + ${b * (L / d2)}/${L} = ${fraction(a * (L / d1) + b * (L / d2), L)}`,
        L <= 24 ? { type: "fractions", bars: [{ n: a, d: d1, label: `${a}/${d1}` }, { n: b, d: d2, label: `${b}/${d2}` }, { n: 0, d: L, label: `${L}ths` }] } : undefined);
    },
  },
  {
    id: "g5-mult-fractions", grade: 5, strand: "Fractions", name: "Multiplying fractions",
    description: "Multiply fractions and simplify.",
    generate: (r) => {
      const a = int(r, 1, 7), b = int(r, a + 1, 9);
      const c = int(r, 1, 7), d = int(r, c + 1, 9);
      return numberProblem(`${a}/${b} × ${c}/${d} = ?`, fraction(a * c, b * d), "Multiply the tops together and the bottoms together, then simplify.", `${a}×${c} / ${b}×${d} = ${a * c}/${b * d} = ${fraction(a * c, b * d)}`);
    },
  },
  {
    id: "g5-decimal-add", grade: 5, strand: "Decimals", name: "Adding and subtracting decimals",
    description: "Add and subtract decimals to hundredths.",
    generate: (r) => {
      const a = int(r, 100, 9999) / 100;
      const b = int(r, 10, 999) / 100;
      if (r() < 0.5) return numberProblem(`${a} + ${b} = ?`, dec(a + b), "Line up the decimal points before adding.", `${a} + ${b} = ${dec(a + b)}`);
      const [hi, lo] = a > b ? [a, b] : [b, a];
      return numberProblem(`${hi} − ${lo} = ?`, dec(hi - lo), "Line up the decimal points. Add zeros so both have the same number of places.", `${hi} − ${lo} = ${dec(hi - lo)}`);
    },
  },
  {
    id: "g5-decimal-mult", grade: 5, strand: "Decimals", name: "Multiplying decimals",
    description: "Multiply a decimal by a whole number or decimal.",
    generate: (r) => {
      const a = int(r, 11, 99) / 10;
      const b = r() < 0.5 ? int(r, 2, 9) : int(r, 2, 9) / 10;
      return numberProblem(`${a} × ${b} = ?`, dec(a * b), "Multiply as if there were no decimals, then count the decimal places in both numbers.", `${a} × ${b} = ${dec(a * b)}`);
    },
  },
  {
    id: "g5-order-ops", grade: 5, strand: "Expressions", name: "Order of operations",
    description: "Evaluate expressions with parentheses, ×, ÷, + and −.",
    generate: (r) => {
      const a = int(r, 2, 9), b = int(r, 2, 9), c = int(r, 2, 9);
      const forms: [string, number][] = [
        [`${a} + ${b} × ${c}`, a + b * c],
        [`(${a} + ${b}) × ${c}`, (a + b) * c],
        [`${a * c} ÷ ${c} + ${b}`, a + b],
        [`${a} × ${b} − ${c}`, a * b - c],
      ];
      const [expr, val] = pick(r, forms);
      return numberProblem(`${expr} = ?`, val, "Parentheses first, then × and ÷, then + and −.", `${expr} = ${val}`);
    },
  },
  {
    id: "g5-volume", grade: 5, strand: "Geometry", name: "Volume of boxes",
    description: "Volume of rectangular prisms.",
    generate: (r) => {
      const l = int(r, 2, 10), w = int(r, 2, 8), h = int(r, 2, 6);
      return numberProblem(`A box is ${l} cm long, ${w} cm wide and ${h} cm tall. What is its volume in cubic cm?`, l * w * h, "Volume = length × width × height.", `${l} × ${w} × ${h} = ${l * w * h} cm³`);
    },
  },
  // Grade 6
  {
    id: "g6-ratios", grade: 6, strand: "Ratios", name: "Equivalent ratios",
    description: "Find a missing value in equivalent ratios.",
    generate: (r) => {
      const a = int(r, 1, 9), b = int(r, 2, 12), k = int(r, 2, 8);
      return numberProblem(`${a} : ${b} = ${a * k} : ?`, b * k, `What was ${a} multiplied by to get ${a * k}?`, `${a} × ${k} = ${a * k}, so ${b} × ${k} = ${b * k}.`);
    },
  },
  {
    id: "g6-percent", grade: 6, strand: "Ratios", name: "Percent of a number",
    description: "Find a percent of a whole number.",
    generate: (r) => {
      const p = pick(r, [10, 20, 25, 30, 40, 50, 60, 75, 80, 5, 15]);
      const n = int(r, 1, 20) * 20;
      return numberProblem(`What is ${p}% of ${n}?`, dec((p / 100) * n), `${p}% means ${p} out of 100. Try finding 10% first.`, `${p}/100 × ${n} = ${dec((p / 100) * n)}`);
    },
  },
  {
    id: "g6-integers", grade: 6, strand: "Integers", name: "Adding integers",
    description: "Add and subtract positive and negative numbers.",
    generate: (r) => {
      const a = int(r, -15, 15), b = int(r, -15, 15);
      const show = (x: number) => (x < 0 ? `(${x})` : String(x));
      const line: Visual = { type: "numberline", min: -30, max: 30, step: 5, points: [{ value: a, label: `start ${a}` }] };
      if (r() < 0.5) return numberProblem(`${a} + ${show(b)} = ?`, a + b, "Picture a number line. Adding a negative moves left.", `${a} + ${show(b)} = ${a + b}`, line);
      return numberProblem(`${a} − ${show(b)} = ?`, a - b, "Subtracting a number is the same as adding its opposite.", `${a} − ${show(b)} = ${a} + ${show(-b)} = ${a - b}`, line);
    },
  },
  {
    id: "g6-one-step", grade: 6, strand: "Equations", name: "One-step equations",
    description: "Solve equations like x + 7 = 12 or 4x = 28.",
    generate: (r) => {
      const x = int(r, 1, 15), k = int(r, 2, 12);
      const forms: [string, string][] = [
        [`x + ${k} = ${x + k}`, `Subtract ${k} from both sides.`],
        [`x − ${k} = ${x - k}`, `Add ${k} to both sides.`],
        [`${k}x = ${k * x}`, `Divide both sides by ${k}.`],
      ];
      const [eq, hint] = pick(r, forms);
      return numberProblem(`Solve for x:  ${eq}`, x, hint, `x = ${x}`);
    },
  },
  {
    id: "g6-exponents", grade: 6, strand: "Expressions", name: "Exponents",
    description: "Evaluate whole-number powers.",
    generate: (r) => {
      const b = int(r, 2, 10);
      const e = b <= 3 ? int(r, 2, 5) : b <= 5 ? int(r, 2, 3) : 2;
      return numberProblem(`${b}^${e} = ?`, b ** e, `${b}^${e} means ${b} multiplied by itself ${e} times.`, `${Array(e).fill(b).join(" × ")} = ${b ** e}`);
    },
  },
  // Grade 7
  {
    id: "g7-int-mult", grade: 7, strand: "Integers", name: "Multiplying integers",
    description: "Multiply and divide positive and negative numbers.",
    generate: (r) => {
      const a = int(r, -12, 12) || 3, b = int(r, -12, 12) || -4;
      if (r() < 0.5) return numberProblem(`(${a}) × (${b}) = ?`, a * b, "Same signs give a positive answer; different signs give a negative.", `(${a}) × (${b}) = ${a * b}`);
      return numberProblem(`(${a * b}) ÷ (${b}) = ?`, a, "Same signs give a positive answer; different signs give a negative.", `(${a * b}) ÷ (${b}) = ${a}`);
    },
  },
  {
    id: "g7-two-step", grade: 7, strand: "Equations", name: "Two-step equations",
    description: "Solve equations like 3x + 5 = 20.",
    generate: (r) => {
      const x = int(r, -10, 12), a = int(r, 2, 9), b = int(r, -15, 15) || 4;
      const sign = b < 0 ? "−" : "+";
      return numberProblem(`Solve for x:  ${a}x ${sign} ${Math.abs(b)} = ${a * x + b}`, x, `First undo the ${sign} ${Math.abs(b)}, then undo the × ${a}.`, `${a}x = ${a * x}, so x = ${x}`);
    },
  },
  {
    id: "g7-percent-change", grade: 7, strand: "Ratios", name: "Discounts and tax",
    description: "Apply a percent increase or decrease.",
    generate: (r) => {
      const price = int(r, 2, 40) * 5;
      const p = pick(r, [10, 15, 20, 25, 30, 40, 50]);
      if (r() < 0.5) return numberProblem(`A $${price} jacket is ${p}% off. What is the sale price in dollars?`, dec(price * (1 - p / 100)), `Find ${p}% of ${price}, then subtract it.`, `${p}% of ${price} = ${dec((price * p) / 100)}; ${price} − ${dec((price * p) / 100)} = ${dec(price * (1 - p / 100))}`);
      return numberProblem(`A $${price} item has ${p}% tax added. What is the total in dollars?`, dec(price * (1 + p / 100)), `Find ${p}% of ${price}, then add it.`, `${p}% of ${price} = ${dec((price * p) / 100)}; ${price} + ${dec((price * p) / 100)} = ${dec(price * (1 + p / 100))}`);
    },
  },
  {
    id: "g7-circles", grade: 7, strand: "Geometry", name: "Circumference and area",
    description: "Circle measurements using π ≈ 3.14.",
    generate: (r) => {
      const rad = int(r, 1, 10);
      if (r() < 0.5) return numberProblem(`A circle has radius ${rad}. Using π ≈ 3.14, what is its circumference?`, dec(2 * 3.14 * rad), "Circumference = 2 × π × radius.", `2 × 3.14 × ${rad} = ${dec(2 * 3.14 * rad)}`);
      return numberProblem(`A circle has radius ${rad}. Using π ≈ 3.14, what is its area?`, dec(3.14 * rad * rad), "Area = π × radius × radius.", `3.14 × ${rad} × ${rad} = ${dec(3.14 * rad * rad)}`);
    },
  },
  // Grade 8
  {
    id: "g8-multi-step", grade: 8, strand: "Equations", name: "Variables on both sides",
    description: "Solve equations like 5x − 3 = 2x + 9.",
    generate: (r) => {
      const x = int(r, -8, 10), a = int(r, 3, 9), c = int(r, 1, a - 1);
      const b = int(r, -12, 12), d = a * x + b - c * x;
      const term = (v: number) => (v < 0 ? `− ${-v}` : `+ ${v}`);
      return numberProblem(`Solve for x:  ${a}x ${term(b)} = ${c}x ${term(d)}`, x, "Get all the x terms on one side and the numbers on the other.", `${a - c}x = ${d - b}, so x = ${x}`);
    },
  },
  {
    id: "g8-slope", grade: 8, strand: "Functions", name: "Slope",
    description: "Find slope from two points.",
    generate: (r) => {
      const x1 = int(r, -6, 6), y1 = int(r, -6, 6);
      let x2 = int(r, -6, 6);
      if (x2 === x1) x2 = x1 + 2;
      const y2 = int(r, -8, 8);
      return numberProblem(`What is the slope of the line through (${x1}, ${y1}) and (${x2}, ${y2})?`, fraction(y2 - y1, x2 - x1), "Slope = (change in y) ÷ (change in x).", `(${y2} − ${y1}) / (${x2} − ${x1}) = ${fraction(y2 - y1, x2 - x1)}`);
    },
  },
  {
    id: "g8-pythagorean", grade: 8, strand: "Geometry", name: "Pythagorean theorem",
    description: "Find the hypotenuse of a right triangle.",
    generate: (r) => {
      const [a, b, c] = pick(r, [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [6, 8, 10], [9, 12, 15], [20, 21, 29]]);
      return numberProblem(`A right triangle has legs ${a} and ${b}. How long is the hypotenuse?`, c, "a² + b² = c²", `${a}² + ${b}² = ${a * a + b * b} = ${c}²`);
    },
  },
  {
    id: "g8-roots", grade: 8, strand: "Number sense", name: "Square roots",
    description: "Evaluate perfect square roots.",
    generate: (r) => {
      const n = int(r, 2, 15);
      return numberProblem(`√${n * n} = ?`, n, "What number times itself makes this?", `${n} × ${n} = ${n * n}`);
    },
  },
  // Grade 9 (Algebra 1)
  {
    id: "g9-distribute", grade: 9, strand: "Equations", name: "Equations with parentheses",
    description: "Solve equations like 3(x − 4) = 15.",
    generate: (r) => {
      const x = int(r, -9, 12), a = int(r, 2, 7), b = int(r, -9, 9) || 2;
      const inner = b < 0 ? `x − ${-b}` : `x + ${b}`;
      return numberProblem(`Solve for x:  ${a}(${inner}) = ${a * (x + b)}`, x, `Divide both sides by ${a} first.`, `${inner} = ${x + b}, so x = ${x}`);
    },
  },
  {
    id: "g9-systems", grade: 9, strand: "Equations", name: "Systems of equations",
    description: "Solve two equations in two unknowns by adding or substituting.",
    generate: (r) => {
      const x = int(r, -6, 10), y = int(r, -6, 10);
      return numberProblem(`x + y = ${x + y} and x − y = ${x - y}. What is x?`, x, "Add the two equations together; the y's cancel.", `2x = ${2 * x}, so x = ${x} (and y = ${y})`);
    },
  },
  {
    id: "g9-exponents", grade: 9, strand: "Expressions", name: "Exponent rules",
    description: "Multiply powers and raise powers to powers.",
    generate: (r) => {
      const a = int(r, 2, 9), b = int(r, 2, 6);
      if (r() < 0.5) return numberProblem(`x^${a} · x^${b} = x^?`, a + b, "Multiplying powers of the same base adds the exponents.", `x^${a} · x^${b} = x^${a + b}`);
      return numberProblem(`(x^${a})^${b} = x^?`, a * b, "A power of a power multiplies the exponents.", `(x^${a})^${b} = x^${a * b}`);
    },
  },
  {
    id: "g9-factor", grade: 9, strand: "Quadratics", name: "Solving by factoring",
    description: "Solve x² + bx + c = 0 by factoring.",
    generate: (r) => {
      const p = int(r, -9, 9), q = int(r, -9, 9);
      const b = -(p + q), c = p * q;
      const term = (v: number, t: string) => (v === 0 ? "" : v < 0 ? ` − ${v === -1 && t ? "" : -v}${t}` : ` + ${v === 1 && t ? "" : v}${t}`);
      return numberProblem(`x²${term(b, "x")}${term(c, "")} = 0. What is the larger solution?`, Math.max(p, q), "Find two numbers that multiply to the last number and add to the middle one.",
        `(x ${p < 0 ? "+" : "−"} ${Math.abs(p)})(x ${q < 0 ? "+" : "−"} ${Math.abs(q)}) = 0, so x = ${p} or x = ${q}`);
    },
  },
  {
    id: "g9-functions", grade: 9, strand: "Functions", name: "Evaluating functions",
    description: "Find f(k) for a quadratic or linear function.",
    generate: (r) => {
      const a = int(r, 1, 4), b = int(r, -6, 6), c = int(r, -9, 9), k = int(r, -4, 5);
      const f = `${a === 1 ? "" : a}x²${b < 0 ? ` − ${-b}x` : b ? ` + ${b}x` : ""}${c < 0 ? ` − ${-c}` : c ? ` + ${c}` : ""}`;
      const v = a * k * k + b * k + c;
      return numberProblem(`f(x) = ${f}. What is f(${k})?`, v, `Replace every x with ${k}. Square first.`, `${a}(${k})² + ${b}(${k}) + ${c} = ${v}`);
    },
  },
  // Grade 10 (Geometry)
  {
    id: "g10-polygon-angles", grade: 10, strand: "Geometry", name: "Polygon angles",
    description: "Interior angles of regular polygons.",
    generate: (r) => {
      const [n, name] = pick(r, [[3, "triangle"], [4, "square"], [5, "pentagon"], [6, "hexagon"], [8, "octagon"], [9, "nonagon"], [10, "decagon"], [12, "dodecagon"]] as [number, string][]);
      return numberProblem(`How many degrees is each interior angle of a regular ${name} (${n} sides)?`, ((n - 2) * 180) / n, "The angles add up to (sides − 2) × 180°.", `(${n} − 2) × 180 = ${(n - 2) * 180}; ÷ ${n} = ${((n - 2) * 180) / n}`);
    },
  },
  {
    id: "g10-similar", grade: 10, strand: "Geometry", name: "Similar triangles",
    description: "Use a scale factor to find a missing side.",
    generate: (r) => {
      const a = int(r, 2, 9), k = int(r, 2, 5);
      let b = int(r, 3, 12);
      if (b === a) b++;
      return numberProblem(`Two triangles are similar. A side of ${a} in the small one matches a side of ${a * k} in the big one. A side of ${b} in the small one matches what side in the big one?`,
        b * k, "Find the scale factor: big ÷ small.", `Scale factor ${a * k} ÷ ${a} = ${k}; ${b} × ${k} = ${b * k}`);
    },
  },
  {
    id: "g10-distance", grade: 10, strand: "Coordinate geometry", name: "Distance between points",
    description: "The distance formula.",
    generate: (r) => {
      const [dx, dy, d] = pick(r, [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [9, 12, 15]]);
      const x1 = int(r, -5, 5), y1 = int(r, -5, 5);
      const sx = r() < 0.5 ? 1 : -1, sy = r() < 0.5 ? 1 : -1;
      return numberProblem(`How far apart are (${x1}, ${y1}) and (${x1 + sx * dx}, ${y1 + sy * dy})?`, d, "d = √((x₂ − x₁)² + (y₂ − y₁)²)", `√(${dx}² + ${dy}²) = √${d * d} = ${d}`);
    },
  },
  {
    id: "g10-volume", grade: 10, strand: "Geometry", name: "Volume of solids",
    description: "Volume of prisms and cylinders.",
    generate: (r) => {
      const a = int(r, 2, 9), b = int(r, 2, 9), h = int(r, 2, 10);
      if (r() < 0.5) return numberProblem(`A box is ${a} by ${b} by ${h}. What is its volume?`, a * b * h, "Volume = length × width × height.", `${a} × ${b} × ${h} = ${a * b * h}`);
      return numberProblem(`A cylinder has radius ${a} and height ${h}. Using π ≈ 3.14, what is its volume?`, dec(3.14 * a * a * h), "Volume = π × radius² × height.", `3.14 × ${a}² × ${h} = ${dec(3.14 * a * a * h)}`);
    },
  },
  {
    id: "g10-trig-ratios", grade: 10, strand: "Trigonometry", name: "Trig ratios",
    description: "Sine, cosine and tangent in a right triangle.",
    generate: (r) => {
      const [a, b, c] = pick(r, [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25]]);
      const [fn, ans, rule] = pick(r, [["sin", fraction(a, c), "opposite ÷ hypotenuse"], ["cos", fraction(b, c), "adjacent ÷ hypotenuse"], ["tan", fraction(a, b), "opposite ÷ adjacent"]] as [string, string, string][]);
      return numberProblem(`A right triangle has legs ${a} and ${b} and hypotenuse ${c}. Angle A is opposite the side of ${a}. What is ${fn} A? (Give a fraction.)`, ans, `${fn} = ${rule}`, `${fn} A = ${rule} = ${ans}`);
    },
  },
  // Grade 11 (Algebra 2)
  {
    id: "g11-discriminant", grade: 11, strand: "Quadratics", name: "Number of solutions",
    description: "Use the discriminant b² − 4ac.",
    generate: (r) => {
      const sign = () => (r() < 0.5 ? -1 : 1);
      const a = int(r, 1, 3), b = sign() * int(r, 1, 8), c = sign() * int(r, 1, 8);
      const disc = b * b - 4 * a * c;
      return numberProblem(`How many real solutions does ${a === 1 ? "" : a}x² ${b < 0 ? "−" : "+"} ${Math.abs(b)}x ${c < 0 ? "−" : "+"} ${Math.abs(c)} = 0 have?`,
        disc > 0 ? 2 : disc === 0 ? 1 : 0, "Work out b² − 4ac: positive means 2, zero means 1, negative means 0.", `b² − 4ac = ${b * b} − ${4 * a * c} = ${disc}`);
    },
  },
  {
    id: "g11-logs", grade: 11, strand: "Exponents and logs", name: "Logarithms",
    description: "Evaluate logs of exact powers.",
    generate: (r) => {
      const base = pick(r, [2, 3, 5, 10]), k = int(r, 0, base === 2 ? 7 : base === 10 ? 5 : 4);
      return numberProblem(`log base ${base} of ${base ** k} = ?`, k, `What power of ${base} makes ${base ** k}?`, `${base}^${k} = ${base ** k}`);
    },
  },
  {
    id: "g11-growth", grade: 11, strand: "Exponents and logs", name: "Exponential growth",
    description: "Doubling and tripling over time.",
    generate: (r) => {
      const start = int(r, 2, 30) * 5, f = pick(r, [2, 3]), n = int(r, 2, f === 2 ? 6 : 4);
      return numberProblem(`A colony of ${start} bacteria ${f === 2 ? "doubles" : "triples"} every hour. How many are there after ${n} hours?`, start * f ** n, `Multiply by ${f} once for each hour: ${start} × ${f}^${n}.`, `${start} × ${f ** n} = ${start * f ** n}`);
    },
  },
  {
    id: "g11-sequences", grade: 11, strand: "Sequences", name: "Arithmetic and geometric sequences",
    description: "Find the nth term of a sequence.",
    generate: (r) => {
      const a = int(r, -5, 10), n = int(r, 6, 12);
      if (r() < 0.6) {
        const d = int(r, -4, 6) || 3;
        return numberProblem(`The sequence ${a}, ${a + d}, ${a + 2 * d}, ${a + 3 * d}, … What is term number ${n}?`, a + (n - 1) * d, `Each term adds ${d}. Term n = first + (n − 1) × ${d}.`, `${a} + ${n - 1} × ${d} = ${a + (n - 1) * d}`);
      }
      const g = int(r, 1, 3), q = 2, m = int(r, 5, 8);
      return numberProblem(`The sequence ${g}, ${g * q}, ${g * q * q}, ${g * q ** 3}, … What is term number ${m}?`, g * q ** (m - 1), `Each term doubles. Term n = first × 2^(n − 1).`, `${g} × 2^${m - 1} = ${g * q ** (m - 1)}`);
    },
  },
  {
    id: "g11-complex", grade: 11, strand: "Complex numbers", name: "Powers of i",
    description: "Simplify powers of the imaginary unit.",
    generate: (r) => {
      const n = int(r, 2, 40);
      const ans = ["1", "i", "-1", "-i"][n % 4];
      return { prompt: `Simplify i^${n}.`, answer: ans, answerKind: "choice", choices: ["1", "i", "-1", "-i"],
        hint: "The powers of i repeat every 4: i, −1, −i, 1.", explanation: `${n} ÷ 4 leaves ${n % 4}, so i^${n} = i^${n % 4} = ${ans}` };
    },
  },
  // Grade 12 (Precalculus and intro calculus)
  {
    id: "g12-unit-circle", grade: 12, strand: "Trigonometry", name: "Unit circle",
    description: "Exact sine and cosine values.",
    generate: (r) => {
      const [fn, deg, ans] = pick(r, [["sin", 0, "0"], ["sin", 30, "1/2"], ["sin", 90, "1"], ["sin", 150, "1/2"], ["sin", 210, "-1/2"], ["sin", 270, "-1"], ["cos", 0, "1"], ["cos", 60, "1/2"], ["cos", 120, "-1/2"], ["cos", 180, "-1"], ["cos", 300, "1/2"]] as [string, number, string][]);
      return numberProblem(`${fn}(${deg}°) = ?`, ans, `On the unit circle, cos is the x-coordinate and sin is the y-coordinate.`, `${fn}(${deg}°) = ${ans}`);
    },
  },
  {
    id: "g12-combinations", grade: 12, strand: "Probability", name: "Combinations",
    description: "Count ways to choose a group.",
    generate: (r) => {
      const n = int(r, 4, 10), k = int(r, 2, Math.min(4, n - 1));
      let c = 1;
      for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
      return numberProblem(`How many ways can you choose ${k} people from a group of ${n}?`, c, "n! ÷ (k! × (n − k)!) — order doesn't matter.", `${n} choose ${k} = ${c}`);
    },
  },
  {
    id: "g12-limits", grade: 12, strand: "Calculus", name: "Limits",
    description: "Limits that need factoring first.",
    generate: (r) => {
      const a = int(r, -6, 8) || 3;
      return numberProblem(`What is the limit of (x² − ${a * a}) / (x ${a < 0 ? "+" : "−"} ${Math.abs(a)}) as x approaches ${a}?`, 2 * a, "Factor the top as a difference of squares and cancel.", `The top factors so the bottom cancels, leaving x ${a < 0 ? "−" : "+"} ${Math.abs(a)}. Plug in ${a}: ${2 * a}`);
    },
  },
  {
    id: "g12-derivatives", grade: 12, strand: "Calculus", name: "Power rule",
    description: "Find the slope of a polynomial at a point.",
    generate: (r) => {
      const a = int(r, 1, 5), n = int(r, 2, 4), k = int(r, -3, 3);
      const v = a * n * k ** (n - 1);
      return numberProblem(`f(x) = ${a === 1 ? "" : a}x^${n}. What is f′(${k})?`, v, "Power rule: the derivative of axⁿ is n·a·xⁿ⁻¹.", `f′(x) = ${a * n}x^${n - 1}; f′(${k}) = ${a * n} × ${k}^${n - 1} = ${v}`);
    },
  },
];

export const SKILLS_BY_ID = new Map(SKILLS.map((s) => [s.id, s]));

export const GRADE_LABELS: Record<number, string> = {
  0: "Kindergarten", 1: "1st grade", 2: "2nd grade", 3: "3rd grade", 4: "4th grade",
  5: "5th grade", 6: "6th grade", 7: "7th grade", 8: "8th grade",
  9: "9th grade", 10: "10th grade", 11: "11th grade", 12: "12th grade",
};

export function skillsForGrade(grade: number): Skill[] {
  return SKILLS.filter((s) => s.grade === grade);
}

/** Skills in curriculum order, after the given skill. */
export function nextSkill(skillId: string): Skill | undefined {
  const i = SKILLS.findIndex((s) => s.id === skillId);
  return i >= 0 ? SKILLS[i + 1] : undefined;
}

/** Small deterministic PRNG so a seed reproduces the same problems. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
