// Pure rules for 60-second math facts races. Problems come from a seed so the server can re-check scores.
import { seededRandom } from "./curriculum.ts";

export const RACE_SECONDS = 60;
/** Most problems anyone could answer in a race; anything past this is ignored. */
export const MAX_RACE_PROBLEMS = 120;

export type RaceOp = "add" | "sub" | "mul" | "div";

export const RACE_OPS: { op: RaceOp; name: string; symbol: string; minGrade: number }[] = [
  { op: "add", name: "Addition", symbol: "+", minGrade: 0 },
  { op: "sub", name: "Subtraction", symbol: "−", minGrade: 1 },
  { op: "mul", name: "Multiplication", symbol: "×", minGrade: 3 },
  { op: "div", name: "Division", symbol: "÷", minGrade: 3 },
];

export const raceOpsFor = (grade: number) => RACE_OPS.filter((o) => o.minGrade <= grade);

export type RaceProblem = { prompt: string; answer: number };

/** The race's problems, in order. The same op and seed always give the same list. */
export function raceProblems(op: RaceOp, seed: number, count = MAX_RACE_PROBLEMS): RaceProblem[] {
  const rand = seededRandom(seed);
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const out: RaceProblem[] = [];
  let last = "";
  while (out.length < count) {
    let p: RaceProblem;
    switch (op) {
      case "add": { const a = int(0, 10), b = int(0, 10); p = { prompt: `${a} + ${b}`, answer: a + b }; break; }
      case "sub": { const b = int(0, 10), c = int(0, 10); p = { prompt: `${b + c} − ${b}`, answer: c }; break; }
      case "mul": { const a = int(2, 12), b = int(1, 12); p = { prompt: `${a} × ${b}`, answer: a * b }; break; }
      case "div": { const a = int(2, 12), b = int(1, 12); p = { prompt: `${a * b} ÷ ${a}`, answer: b }; break; }
    }
    // Avoid the same fact twice in a row.
    if (p.prompt === last) continue;
    last = p.prompt;
    out.push(p);
  }
  return out;
}

/** Scores a race: answers[i] is the student's answer to problem i, in order. */
export function scoreRace(op: RaceOp, seed: number, answers: string[]): { attempted: number; correct: number } {
  const problems = raceProblems(op, seed, Math.min(answers.length, MAX_RACE_PROBLEMS));
  let correct = 0;
  problems.forEach((p, i) => {
    if (answers[i].trim() !== "" && Number(answers[i]) === p.answer) correct++;
  });
  return { attempted: problems.length, correct };
}
