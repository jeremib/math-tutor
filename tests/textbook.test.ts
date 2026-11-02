import { test } from "node:test";
import assert from "node:assert/strict";
import { chapterFocus, chapterProgress, cleanChapters, needsChapterPractice, skillChoicesFor, MAX_CHAPTERS } from "../src/lib/textbook-plan.ts";

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

import { chapterLessons, fromLesson, lessonSkillId, parseLessonSkill, refillBelow, spreadByLesson, textbookShare } from "../src/lib/textbook-plan.ts";

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

test("chapterProgress tracks skills, and lessons when Claude writes problems for them", () => {
  const partial = { title: "Fractions", lessons: ["Equivalent fractions", "Compare fractions"], skillIds: ["g4-decimals"], coverage: "partial" as const };
  const rows = new Map([
    ["g4-decimals", { mastery: 0.9, attempts: 10, mastered: true }],
    [lessonSkillId("b1", 2, 0), { mastery: 0.5, attempts: 4, mastered: false }],
  ]);
  const p = chapterProgress("b1", 2, partial, rows);
  assert.deepEqual(p.lessons.map((l) => l.title), ["Equivalent fractions", "Compare fractions"]);
  assert.equal(p.percent, (1 + 0.5 + 0) / 3);
  assert.equal(p.started, true);
  assert.equal(p.done, false);

  // Fully covered chapters are tracked by their skills alone.
  const full = chapterProgress("b1", 0, { ...partial, coverage: "full" }, rows);
  assert.equal(full.lessons.length, 0);
  assert.equal(full.done, true);
  assert.equal(chapterProgress("b1", 5, partial, new Map()).started, false);
});

test("skipping ahead leaves earlier lessons out of drills and progress", () => {
  assert.equal(fromLesson(lessonSkillId("b", 1, 0), 2), false);
  assert.equal(fromLesson(lessonSkillId("b", 1, 3), 2), true);
  const ch = { title: "Ch", lessons: ["A", "B", "C"], skillIds: [], coverage: "none" as const };
  const p = chapterProgress("b", 0, ch, new Map([[lessonSkillId("b", 0, 2), { mastery: 0.6, attempts: 3, mastered: false }]]), 1);
  assert.deepEqual(p.lessons.map((l) => [l.skipped, l.current]), [[true, false], [false, true], [false, false]]);
  assert.equal(p.percent, 0.6 / 2);
  // Later lessons come first in a drill only after the current one.
  const ps = [2, 2, 1].map((l) => ({ skillId: lessonSkillId("b", 0, l) }));
  assert.deepEqual(spreadByLesson(ps).map((x) => parseLessonSkill(x.skillId)!.lesson), [1, 2, 2]);
});
