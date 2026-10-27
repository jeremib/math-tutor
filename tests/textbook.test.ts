import { test } from "node:test";
import assert from "node:assert/strict";
import { chapterFocus, cleanChapters, needsChapterPractice, skillChoicesFor, MAX_CHAPTERS } from "../src/lib/textbook-plan.ts";

test("cleanChapters drops unknown skills, blank titles and extra chapters", () => {
  const chapters = cleanChapters([
    { title: "  Chapter 1:\n Place Value ", lessons: ["Read numbers", " ", "Round numbers"], skillIds: ["g4-decimals", "made-up", "g4-decimals"], coverage: "full" },
    { title: "   ", lessons: [], skillIds: [], coverage: "none" },
    { title: "Measurement", lessons: ["Customary units"], skillIds: ["nope"], coverage: "partial" },
  ]);
  assert.equal(chapters.length, 2);
  assert.deepEqual(chapters[0], { title: "Chapter 1: Place Value", lessons: ["Read numbers", "Round numbers"], skillIds: ["g4-decimals"], coverage: "full" });
  // No matching skills means nothing is covered, whatever Claude said.
  assert.equal(chapters[1].coverage, "none");

  const many = cleanChapters(Array.from({ length: 40 }, (_, i) => ({ title: `Ch ${i}`, lessons: [], skillIds: [], coverage: "none" as const })));
  assert.equal(many.length, MAX_CHAPTERS);
});

test("chapters that aren't fully covered get written practice", () => {
  assert.equal(needsChapterPractice({ title: "a", lessons: [], skillIds: ["g3-area"], coverage: "full" }), false);
  assert.equal(needsChapterPractice({ title: "a", lessons: [], skillIds: ["g3-area"], coverage: "partial" }), true);
  assert.equal(needsChapterPractice({ title: "a", lessons: [], skillIds: [], coverage: "none" }), true);
});

test("chapterFocus and skill choices", () => {
  assert.deepEqual(chapterFocus({ title: "a", lessons: [], skillIds: ["g3-area", "g3-rounding"], coverage: "full" }), ["g3-area", "g3-rounding"]);
  const grades = new Set(skillChoicesFor(4).map((s) => s.grade));
  assert.deepEqual([...grades].sort(), [3, 4, 5]);
});

import { chapterLessons, lessonSkillId, parseLessonSkill, refillBelow, spreadByLesson, textbookShare } from "../src/lib/textbook-plan.ts";

test("lesson skill ids round-trip", () => {
  const id = lessonSkillId("abc-123", 12, 3);
  assert.equal(id, "tb:abc-123:12:3");
  assert.deepEqual(parseLessonSkill(id), { textbookId: "abc-123", chapter: 12, lesson: 3 });
  assert.equal(parseLessonSkill("g4-decimals"), null);
});

test("a chapter without lessons is practiced as one lesson", () => {
  assert.deepEqual(chapterLessons({ title: "Ch 2", lessons: [], skillIds: [], coverage: "none" }), ["Ch 2"]);
});

test("written problems fill most of a drill only when no built-in skill fits", () => {
  assert.equal(textbookShare(8, 20, false), 6);
  assert.equal(textbookShare(8, 20, true), 2);
  assert.equal(textbookShare(8, 3, false), 3);
  assert.equal(textbookShare(8, 0, false), 0);
  assert.equal(refillBelow(8, false), 12);
  assert.equal(refillBelow(8, true), 4);
});

test("spreadByLesson alternates lessons", () => {
  const ps = ["a", "a", "a", "b", "c", "c"].map((skillId, i) => ({ skillId, i }));
  assert.deepEqual(spreadByLesson(ps).map((p) => p.skillId), ["a", "b", "c", "a", "c", "a"]);
});
