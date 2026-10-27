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
