// Pure helpers for turning a textbook's chapter list into a practice plan.
import { SKILLS, SKILLS_BY_ID } from "./curriculum.ts";
import type { TextbookChapter } from "../db/schema.ts";

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
 * How many of a drill's problems come from the current chapter's written problems. With no built-in
 * skills for the chapter they're most of the drill; otherwise they share it, like other practice.
 */
export function textbookShare(count: number, available: number, chapterHasSkills: boolean): number {
  if (available <= 0 || count <= 0) return 0;
  const want = chapterHasSkills ? Math.max(1, Math.floor(count / 3)) : Math.round(count * 0.7);
  return Math.min(available, want);
}

/** Time to write more once fewer than this many are left: about two drills' worth. */
export function refillBelow(dailyProblems: number, chapterHasSkills: boolean): number {
  return 2 * textbookShare(dailyProblems, Infinity, chapterHasSkills);
}

/** Takes problems one lesson at a time in turn, so a drill mixes the chapter's lessons. */
export function spreadByLesson<P extends { skillId: string }>(problems: P[]): P[] {
  const byLesson = new Map<string, P[]>();
  for (const p of problems) byLesson.set(p.skillId, [...(byLesson.get(p.skillId) ?? []), p]);
  const queues = [...byLesson.values()];
  const out: P[] = [];
  while (out.length < problems.length) for (const q of queues) if (q.length) out.push(q.shift()!);
  return out;
}

export type ItemProgress = { mastery: number; attempts: number; mastered: boolean };

export type ChapterProgress = {
  /** The chapter's built-in drill skills. */
  skills: { skillId: string; progress: ItemProgress | null }[];
  /** Lessons tracked through written problems; empty when the skills cover the whole chapter. */
  lessons: { title: string; skillId: string; progress: ItemProgress | null }[];
  /** 0–1: mastered items count fully, others by their mastery. */
  percent: number;
  started: boolean;
  done: boolean;
};

/** How far a student is through a chapter, from their skill and lesson mastery. */
export function chapterProgress(textbookId: string, index: number, chapter: TextbookChapter, rows: Map<string, ItemProgress>): ChapterProgress {
  const skills = chapter.skillIds.map((skillId) => ({ skillId, progress: rows.get(skillId) ?? null }));
  const lessons = needsChapterPractice(chapter)
    ? chapterLessons(chapter).map((title, j) => {
      const skillId = lessonSkillId(textbookId, index, j);
      return { title, skillId, progress: rows.get(skillId) ?? null };
    })
    : [];
  const items = [...skills, ...lessons].map((i) => i.progress);
  const value = (p: ItemProgress | null) => (!p ? 0 : p.mastered ? 1 : p.mastery);
  return {
    skills, lessons,
    percent: items.length ? items.reduce((n, p) => n + value(p), 0) / items.length : 0,
    started: items.some((p) => (p?.attempts ?? 0) > 0),
    done: items.length > 0 && items.every((p) => p?.mastered),
  };
}
