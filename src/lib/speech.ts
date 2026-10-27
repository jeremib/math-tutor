// Pure helpers for voice mode: turning math into words to read aloud, and spoken answers into math.

const DENOMINATORS: Record<number, [string, string]> = {
  2: ["half", "halves"], 3: ["third", "thirds"], 4: ["fourth", "fourths"], 5: ["fifth", "fifths"], 6: ["sixth", "sixths"],
  7: ["seventh", "sevenths"], 8: ["eighth", "eighths"], 9: ["ninth", "ninths"], 10: ["tenth", "tenths"],
  11: ["eleventh", "elevenths"], 12: ["twelfth", "twelfths"], 100: ["hundredth", "hundredths"],
};

function fractionWords(n: string, d: string): string {
  const name = DENOMINATORS[Number(d)];
  if (!name) return `${n} over ${d}`;
  return `${n} ${Number(n) === 1 ? name[0] : name[1]}`;
}

/** Rewrites a problem like "3/4 + 1 1/2 = ?" so a speech synthesizer reads it naturally. */
export function speakableMath(text: string): string {
  return text
    .replace(/(\d+)\s+(\d+)\/(\d+)/g, (_, w, n, d) => `${w} and ${fractionWords(n, d)}`)
    .replace(/(\d+)\/(\d+)/g, (_, n, d) => fractionWords(n, d))
    .replace(/√\s*/g, "the square root of ")
    .replace(/\^2\b/g, " squared")
    .replace(/\^3\b/g, " cubed")
    .replace(/\^(\d+)/g, " to the power of $1")
    .replace(/(\d)\s*R\s*(\d)/g, "$1 remainder $2")
    .replace(/\s[−-]\s/g, " minus ")
    .replace(/(^|[\s(])[−-](?=\d)/g, "$1negative ")
    .replace(/×/g, " times ")
    .replace(/÷/g, " divided by ")
    .replace(/\+/g, " plus ")
    .replace(/=\s*\?/g, " equals what?")
    .replace(/=/g, " equals ")
    .replace(/☐/g, " box ")
    .replace(/(\d)\s*:\s*(?=[\d?])/g, "$1 to ")
    .replace(/[()]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const UNITS: Record<string, number> = {
  zero: 0, oh: 0, a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const DENOMINATOR_WORDS: Record<string, number> = Object.fromEntries([
  ...Object.entries(DENOMINATORS).flatMap(([d, [one, many]]) => [[one, Number(d)], [many, Number(d)]]),
  ["quarter", 4], ["quarters", 4],
]);

/** "one hundred twenty three" -> 123, "45" -> 45. Null if any word isn't part of a number. */
function wordsToNumber(words: string[]): number | null {
  if (!words.length) return null;
  let total = 0, current = 0, any = false;
  for (const w of words) {
    if (/^\d+(\.\d+)?$/.test(w)) { current += Number(w); any = true; }
    else if (w in UNITS) { current += UNITS[w]; any = true; }
    else if (w === "hundred") { current = (current || 1) * 100; any = true; }
    else if (w === "thousand") { total += (current || 1) * 1000; current = 0; any = true; }
    else if (w !== "and") return null;
  }
  return any ? total + current : null;
}

/** Parses a positive amount: whole numbers, decimals ("two point five"), fractions and mixed numbers. */
function parseAmount(words: string[]): string | null {
  const point = words.indexOf("point");
  if (point > 0) {
    const whole = wordsToNumber(words.slice(0, point));
    const digits = words.slice(point + 1).map((w) => (/^\d$/.test(w) ? Number(w) : UNITS[w])).filter((d) => d !== undefined && d < 10);
    if (whole === null || !digits.length || digits.length !== words.length - point - 1) return null;
    return `${whole}.${digits.join("")}`;
  }
  const over = words.indexOf("over");
  if (over > 0) {
    const n = wordsToNumber(words.slice(0, over)), d = wordsToNumber(words.slice(over + 1));
    return n !== null && d ? `${n}/${d}` : null;
  }
  const last = words.at(-1)!;
  if (last in DENOMINATOR_WORDS) {
    const d = DENOMINATOR_WORDS[last];
    const before = words.slice(0, -1);
    // "two and three fourths" / "two and a half"
    const and = before.lastIndexOf("and");
    if (and > 0) {
      const whole = wordsToNumber(before.slice(0, and)), n = wordsToNumber(before.slice(and + 1));
      if (whole !== null && n !== null) return `${whole} ${n}/${d}`;
    }
    const n = before.length ? wordsToNumber(before) : 1;
    return n !== null ? `${n}/${d}` : null;
  }
  const n = wordsToNumber(words);
  return n === null ? null : String(n);
}

/**
 * Turns what a child said ("three fourths", "seven remainder two", "negative five", "less than")
 * into an answer the checker understands. Returns the cleaned text if it can't be parsed.
 */
export function spokenToAnswer(spoken: string): string {
  let s = spoken.toLowerCase().trim()
    .replace(/(\w)-(\w)/g, "$1 $2")
    .replace(/[,!?]/g, " ")
    .replace(/\.$/, "")
    .replace(/^(the answer is|answer|it's|it is|i think it's|i think|is)\s+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (/^(less than|smaller than|is less than)$/.test(s)) return "<";
  if (/^(greater than|more than|bigger than|is greater than)$/.test(s)) return ">";
  if (/^(equal|equals|equal to|the same)$/.test(s)) return "=";

  // Speech recognition sometimes hands back digits and symbols already.
  s = s.replace(/(\d)\s*\/\s*(\d)/g, "$1/$2");
  if (/^-?\d+(\.\d+)?(\/\d+)?$/.test(s) || /^-?\d+ \d+\/\d+$/.test(s)) return s;

  const words = s.split(" ").filter(Boolean);
  const rem = words.findIndex((w) => w === "remainder" || w === "r" || w === "rem");
  if (rem > 0) {
    const q = wordsToNumber(words.slice(0, rem)), r = wordsToNumber(words.slice(rem + 1));
    if (q !== null && r !== null) return `${q} R ${r}`;
  }
  const negative = words[0] === "negative" || words[0] === "minus";
  const amount = parseAmount(negative ? words.slice(1) : words);
  if (amount === null) return spoken.trim();
  return negative ? `-${amount}` : amount;
}
