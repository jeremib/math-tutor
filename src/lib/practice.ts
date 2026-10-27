// Pure rules for practice problems Claude writes: validation, drill mixing and misconception resolution.
import { checkAnswer, parseRational } from "./answers.ts";

/** Targeted practice problems a student must get right on the first try to clear a misconception. */
export const RESOLVE_AFTER = 2;
/** Most unused practice problems queued for one misconception at a time. */
export const MAX_QUEUED_PER_MISCONCEPTION = 2;

export type GeneratedProblem = {
  prompt: string;
  answer: string;
  answerKind: "number" | "remainder";
  hint: string;
  explanation: string;
};

/**
 * Checks that a problem Claude wrote can be graded by our answer checker, and tidies it.
 * Returns null for anything we can't grade reliably.
 */
export function validateGenerated(p: GeneratedProblem): GeneratedProblem | null {
  const prompt = p.prompt.trim();
  const answer = p.answer.trim();
  const hint = p.hint.trim();
  const explanation = p.explanation.trim();
  if (!prompt || prompt.length > 300 || !hint || !explanation) return null;
  if (p.answerKind === "number") {
    if (!parseRational(answer)) return null;
    return { prompt, answer: answer.replace(/,/g, ""), answerKind: "number", hint, explanation };
  }
  const m = /^(\d+)\s*R\s*(\d+)$/i.exec(answer);
  if (!m) return null;
  return { prompt, answer: `${Number(m[1])} R ${Number(m[2])}`, answerKind: "remainder", hint, explanation };
}

/**
 * Keeps only problems whose answer key matches an independent solve of the same problem.
 * `solved[i]` is the second solver's answer to `problems[i]` (or missing if it couldn't solve it).
 */
export function keepVerified<P extends GeneratedProblem>(problems: P[], solved: (string | null | undefined)[]): P[] {
  return problems.filter((p, i) => {
    const answer = solved[i];
    return !!answer && checkAnswer(p.answerKind, p.answer, answer);
  });
}

/**
 * How many slots in a drill of `count` problems go to queued practice problems:
 * up to a third, or up to half while a quiz is coming up.
 */
export function practiceSlots(count: number, available: number, quizComing = false): number {
  if (available <= 0 || count <= 0) return 0;
  return Math.min(available, Math.max(1, Math.floor(count / (quizComing ? 2 : 3))));
}

/**
 * Splits a drill's practice slots between quiz prep and other practice. Quiz problems are
 * paced so they're spread over the days left before the quiz, rather than all on day one.
 */
export function choosePractice(count: number, quizAvailable: number, daysToQuiz: number, otherAvailable: number) {
  const cap = practiceSlots(count, quizAvailable + otherAvailable, quizAvailable > 0);
  const pace = Math.ceil(quizAvailable / Math.max(1, daysToQuiz + 1));
  const quiz = Math.min(quizAvailable, cap, Math.max(1, pace) * (quizAvailable > 0 ? 1 : 0));
  const other = Math.min(otherAvailable, cap - quiz, practiceSlots(count, otherAvailable));
  return { quiz, other };
}

/** Spreads practice problems through the drill instead of bunching them at the end. */
export function mixIntoDrill<T, P>(curriculum: T[], practice: P[]): (T | P)[] {
  const keep = curriculum.slice(0, Math.max(0, curriculum.length - practice.length));
  const out: (T | P)[] = [...keep];
  practice.forEach((p, i) => {
    // Evenly spaced, never first, so the drill starts on familiar ground.
    const at = Math.min(out.length, Math.round(((i + 1) * (keep.length + practice.length)) / (practice.length + 1)));
    out.splice(at, 0, p);
  });
  return out;
}

/** Kebab-case, short, so Claude's tags match across calls. */
export function normalizeTag(tag: string): string {
  return tag.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "unnamed";
}
