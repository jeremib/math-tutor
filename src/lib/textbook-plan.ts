// Pure helpers for turning a textbook's chapter list into a practice plan.
import { SKILLS, SKILLS_BY_ID } from "./curriculum.ts";
import type { LessonGuide, TextbookChapter } from "../db/schema.ts";

export const MAX_CHAPTERS = 24;
export const MAX_LESSONS = 20;
export const MAX_CHAPTER_SKILLS = 4;
/** Skills a student can focus on at once (matches the settings form). */
export const MAX_FOCUS = 5;

type RawChapter = { title: string; lessons: string[]; skillIds: string[]; coverage: TextbookChapter["coverage"] };

const tidy = (text: string, max: number) => text.replace(/\s+/g, " ").trim().slice(0, max);

/** Trims Claude's chapter list to sane sizes and drops skills that aren't in the curriculum. */
export function cleanChapters(raw: RawChapter[]): TextbookChapter[] {
  return raw.flatMap((c) => {
    const title = tidy(c.title, 120);
    if (!title) return [];
    const skillIds = [...new Set(c.skillIds)].filter((id) => SKILLS_BY_ID.has(id)).slice(0, MAX_CHAPTER_SKILLS);
    return [{
      title,
      lessons: c.lessons.map((l) => tidy(l, 120)).filter(Boolean).slice(0, MAX_LESSONS),
      skillIds,
      coverage: skillIds.length ? c.coverage : "none",
    }];
  }).slice(0, MAX_CHAPTERS);
}

/** The focus skills a chapter sets for daily drills. */
export function chapterFocus(chapter: TextbookChapter): string[] {
  return chapter.skillIds.slice(0, MAX_FOCUS);
}

/**
 * The chapter's skills that belong to lessons after the current one, so drills leave them out until
 * the class gets there. Skills no lesson teaches (-1) or not yet placed are kept.
 */
export function laterLessonSkills(chapter: TextbookChapter, lesson: number): string[] {
  const at = chapter.skillLessons ?? {};
  return chapter.skillIds.filter((id) => (at[id] ?? -1) > lesson);
}

/** Whether the chapter's skills still need placing into its lessons. */
export function needsSkillLessons(chapter: TextbookChapter): boolean {
  return chapter.skillIds.length > 0 && chapter.lessons.length > 1 && chapter.skillIds.some((id) => chapter.skillLessons?.[id] === undefined);
}

/** Whether the chapter has lessons the curriculum's skills don't cover, so Claude writes problems for them. */
export function needsChapterPractice(chapter: TextbookChapter): boolean {
  return chapter.coverage !== "full" || chapter.skillIds.length === 0;
}

/** Skills a parent can pick from for a chapter: the book's grade and one on either side. */
export function skillChoicesFor(grade: number) {
  return SKILLS.filter((s) => Math.abs(s.grade - grade) <= 1);
}

/**
 * Claude-written problems for a textbook lesson are filed under a skill id like
 * "tb:<textbook id>:<chapter>:<lesson>", so each lesson's progress can be tracked.
 */
export const lessonSkillId = (textbookId: string, chapter: number, lesson: number) => `tb:${textbookId}:${chapter}:${lesson}`;
export const chapterSkillPrefix = (textbookId: string, chapter: number) => `tb:${textbookId}:${chapter}:`;

export function parseLessonSkill(skillId: string): { textbookId: string; chapter: number; lesson: number } | null {
  const m = /^tb:([^:]+):(\d+):(\d+)$/.exec(skillId);
  return m ? { textbookId: m[1], chapter: Number(m[2]), lesson: Number(m[3]) } : null;
}

/** The lessons problems are written for; a chapter with none listed is one lesson. */
export function chapterLessons(chapter: TextbookChapter): string[] {
  return (chapter.lessons.length ? chapter.lessons : [chapter.title]).slice(0, MAX_LESSONS);
}

/**
 * How many of a drill's problems come from the textbook's written problems. With no built-in
 * skills for the chapter they're most of the drill; otherwise they share it with those skills.
 */
export function textbookShare(count: number, available: number, chapterHasSkills: boolean): number {
  if (available <= 0 || count <= 0) return 0;
  const want = chapterHasSkills ? Math.max(1, Math.floor(count / 2)) : Math.round(count * 0.8);
  return Math.min(available, want);
}

/** Time to write more once fewer than this many are left: about two drills' worth. */
export function refillBelow(dailyProblems: number, chapterHasSkills: boolean): number {
  return 2 * textbookShare(dailyProblems, Infinity, chapterHasSkills);
}

/** Whether a lesson problem is for exactly this lesson. */
export function inLesson(skillId: string, chapter: number, lesson: number): boolean {
  const at = parseLessonSkill(skillId);
  return !!at && at.chapter === chapter && at.lesson === lesson;
}

/** Whether a lesson problem is for a lesson before this one: earlier in the chapter, or an earlier chapter. */
export function beforeLesson(skillId: string, chapter: number, lesson: number): boolean {
  const at = parseLessonSkill(skillId);
  return !!at && (at.chapter < chapter || (at.chapter === chapter && at.lesson < lesson));
}

/**
 * Splits a drill's textbook slots: a few review problems from earlier lessons (about a quarter),
 * the rest on the current lesson. Whichever runs short is made up by the other.
 */
export function splitLessonSlots(slots: number, currentAvailable: number, reviewAvailable: number) {
  const wantReview = slots >= 3 ? Math.max(1, Math.round(slots / 4)) : 0;
  const current = Math.min(currentAvailable, slots - Math.min(wantReview, reviewAvailable));
  const review = Math.min(reviewAvailable, slots - current);
  return { current, review };
}

/** Takes problems one lesson at a time in turn, most recent lesson first, so review mixes the lessons before this one. */
export function spreadByLesson<P extends { skillId: string }>(problems: P[]): P[] {
  const byLesson = new Map<string, P[]>();
  for (const p of problems) byLesson.set(p.skillId, [...(byLesson.get(p.skillId) ?? []), p]);
  const order = (q: P[]) => { const at = parseLessonSkill(q[0].skillId); return at ? at.chapter * 1000 + at.lesson : 0; };
  const queues = [...byLesson.values()].sort((a, b) => order(b) - order(a));
  const out: P[] = [];
  while (out.length < problems.length) for (const q of queues) if (q.length) out.push(q.shift()!);
  return out;
}

export type ItemProgress = { mastery: number; attempts: number; mastered: boolean };

export type ChapterProgress = {
  /** The chapter's built-in drill skills. */
  skills: { skillId: string; progress: ItemProgress | null }[];
  /** Lessons tracked through written problems; empty when the skills cover the whole chapter. */
  lessons: { title: string; skillId: string; progress: ItemProgress | null; skipped: boolean; current: boolean }[];
  /** 0–1: mastered items count fully, others by their mastery. */
  percent: number;
  started: boolean;
  done: boolean;
};

/** How far a student is through a chapter, from their skill and lesson mastery. */
export function chapterProgress(textbookId: string, index: number, chapter: TextbookChapter, rows: Map<string, ItemProgress>, startLesson = 0): ChapterProgress {
  const skills = chapter.skillIds.map((skillId) => ({ skillId, progress: rows.get(skillId) ?? null }));
  const lessons = needsChapterPractice(chapter)
    ? chapterLessons(chapter).map((title, j) => {
      const skillId = lessonSkillId(textbookId, index, j);
      const progress = rows.get(skillId) ?? null;
      // Lessons the parent skipped past don't count against the chapter, unless they were practiced anyway.
      return { title, skillId, progress, skipped: j < startLesson && !progress?.attempts, current: startLesson > 0 && j === startLesson };
    })
    : [];
  const items = [...skills, ...lessons.filter((l) => !l.skipped)].map((i) => i.progress);
  const value = (p: ItemProgress | null) => (!p ? 0 : p.mastered ? 1 : p.mastery);
  return {
    skills, lessons,
    percent: items.length ? items.reduce((n, p) => n + value(p), 0) / items.length : 0,
    started: items.some((p) => (p?.attempts ?? 0) > 0),
    done: items.length > 0 && items.every((p) => p?.mastered),
  };
}

type RawGuide = Omit<LessonGuide, "check"> & { check: { question: string; choices: string[]; answer: number; why: string }[] };

/** Drops check questions whose answer isn't one of their choices and caps a lesson guide's lengths. */
export function cleanGuide(raw: RawGuide): LessonGuide {
  return {
    bigIdea: raw.bigIdea.trim().slice(0, 600),
    sections: raw.sections.filter((s) => s.body.trim()).slice(0, 5).map((s) => ({ heading: tidy(s.heading, 80), body: s.body.trim().slice(0, 2000) })),
    examples: raw.examples.filter((e) => e.problem.trim() && e.steps.length).slice(0, 3)
      .map((e) => ({ problem: e.problem.trim().slice(0, 400), steps: e.steps.map((s) => s.trim()).filter(Boolean).slice(0, 8), answer: tidy(e.answer, 120) })),
    watchOut: raw.watchOut.map((w) => w.trim()).filter(Boolean).slice(0, 3),
    check: raw.check
      .map((c) => ({ ...c, choices: c.choices.map((x) => tidy(x, 120)) }))
      .filter((c) => c.question.trim() && c.choices.length >= 2 && c.choices.length <= 5 && Number.isInteger(c.answer) && c.answer >= 0 && c.answer < c.choices.length)
      .slice(0, 3)
      .map((c) => ({ question: c.question.trim().slice(0, 400), choices: c.choices, answer: c.answer, why: c.why.trim().slice(0, 400) })),
    videoSearch: tidy(raw.videoSearch, 80),
  };
}
