// Pure rules for chapter test prep: what a student can pick, how problems are ordered, and how readiness is scored.
import type { ChapterTestResult, TextbookChapter } from "../db/schema.ts";
import { chapterLessons } from "./textbook-plan.ts";

/** Lessons one test prep can cover, so the set stays a sitting's worth of work. */
export const MAX_TEST_LESSONS = 12;
export const MAX_CONCEPTS = 8;
/** Problems kept per concept. */
export const PER_CONCEPT = 3;
/** Score at or above which a concept or test counts as ready. */
export const READY_AT = 0.8;
export const ALMOST_AT = 0.6;

export type LessonRef = { chapter: number; lesson: number };

/** Keeps real lessons of the book, once each, in book order, up to MAX_TEST_LESSONS. */
export function cleanSelection(picked: LessonRef[], chapters: TextbookChapter[]): LessonRef[] {
  const seen = new Set<string>();
  return picked
    .filter((p) => Number.isInteger(p.chapter) && Number.isInteger(p.lesson) && chapters[p.chapter] && p.lesson >= 0 && p.lesson < chapterLessons(chapters[p.chapter]).length)
    .filter((p) => { const k = `${p.chapter}:${p.lesson}`; return !seen.has(k) && !!seen.add(k); })
    .sort((a, b) => a.chapter - b.chapter || a.lesson - b.lesson)
    .slice(0, MAX_TEST_LESSONS);
}

/** A short name for what was picked: the chapter, or the chapters. */
export function testTitle(lessons: LessonRef[], chapters: TextbookChapter[]): string {
  const ids = [...new Set(lessons.map((l) => l.chapter))];
  if (ids.length === 1) {
    const chapter = chapters[ids[0]];
    const all = chapterLessons(chapter).length;
    return lessons.length < all ? `${chapter.title} (${lessons.length} of ${all} lessons)` : chapter.title;
  }
  return `${ids.length} chapters: ${ids.map((i) => chapters[i].title).join(", ")}`.slice(0, 120);
}

/** Takes one problem from each concept in turn, so practice mixes ideas the way a test does. */
export function interleave<P>(byConcept: P[][]): P[] {
  const out: P[] = [];
  for (let round = 0; byConcept.some((ps) => ps.length > round); round++) {
    for (const ps of byConcept) if (ps[round] !== undefined) out.push(ps[round]);
  }
  return out;
}

type Answered = { concept: number; solved: boolean | null; firstTryCorrect: boolean | null };

/** Full credit for right on the first try without a hint, half for getting there with help. */
export const problemCredit = (p: Answered) => (p.firstTryCorrect ? 1 : p.solved ? 0.5 : 0);

export function readinessLevel(score: number): ChapterTestResult["level"] {
  return score >= READY_AT ? "ready" : score >= ALMOST_AT ? "almost" : "review";
}

/** Scores each concept and the whole test, weighting every concept the same. */
export function scoreTest(conceptCount: number, problems: Answered[]): Omit<ChapterTestResult, "advice"> {
  const concepts = Array.from({ length: conceptCount }, (_, i) => {
    const mine = problems.filter((p) => p.concept === i);
    const credit = mine.reduce((n, p) => n + problemCredit(p), 0);
    return { score: mine.length ? credit / mine.length : 0, right: mine.filter((p) => p.firstTryCorrect).length, total: mine.length };
  });
  const scored = concepts.filter((c) => c.total > 0);
  const score = scored.length ? scored.reduce((n, c) => n + c.score, 0) / scored.length : 0;
  return { score, level: readinessLevel(score), concepts };
}

/** The lessons behind concepts that aren't ready yet, for a follow-up test prep. */
export function weakLessons(concepts: LessonRef[], result: Pick<ChapterTestResult, "concepts">): LessonRef[] {
  return concepts.filter((_, i) => (result.concepts[i]?.score ?? 0) < READY_AT).map(({ chapter, lesson }) => ({ chapter, lesson }));
}

/** Names of the ideas that aren't ready yet. */
export function weakConceptNames(concepts: { name: string }[], result: Pick<ChapterTestResult, "concepts">): string[] {
  return concepts.filter((_, i) => result.concepts[i]?.total && result.concepts[i].score < READY_AT).map((c) => c.name);
}
