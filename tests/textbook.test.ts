import { test } from "node:test";
import assert from "node:assert/strict";
import { chapterFocus, chapterProgress, cleanChapters, cleanGuide, needsChapterPractice, skillChoicesFor, MAX_CHAPTERS } from "../src/lib/textbook-plan.ts";

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

import { beforeLesson, chapterLessons, inLesson, laterLessonSkills, needsSkillLessons, lessonSkillId, parseLessonSkill, refillBelow, splitLessonSlots, spreadByLesson, textbookShare } from "../src/lib/textbook-plan.ts";

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
  assert.equal(textbookShare(10, 20, false), 8);
  assert.equal(textbookShare(8, 20, true), 4);
  assert.equal(textbookShare(8, 3, false), 3);
  assert.equal(textbookShare(8, 0, false), 0);
  assert.equal(refillBelow(8, false), 12);
  assert.equal(refillBelow(8, true), 8);
});

test("spreadByLesson alternates lessons, most recent first", () => {
  const [a, b, c] = [0, 1, 2].map((l) => lessonSkillId("b", 0, l));
  const ps = [a, a, a, b, c, c].map((skillId, i) => ({ skillId, i }));
  assert.deepEqual(spreadByLesson(ps).map((p) => p.skillId), [c, b, a, c, a, a]);
});

test("drills review a few earlier lessons and hammer the current one", () => {
  assert.deepEqual(splitLessonSlots(8, 20, 20), { current: 6, review: 2 });
  assert.deepEqual(splitLessonSlots(8, 20, 0), { current: 8, review: 0 });
  // Short on current-lesson problems: review fills in.
  assert.deepEqual(splitLessonSlots(8, 3, 20), { current: 3, review: 5 });
  assert.deepEqual(splitLessonSlots(2, 5, 5), { current: 2, review: 0 });
  assert.equal(inLesson(lessonSkillId("b", 1, 2), 1, 2), true);
  assert.equal(inLesson(lessonSkillId("b", 1, 3), 1, 2), false);
  assert.equal(beforeLesson(lessonSkillId("b", 1, 1), 1, 2), true);
  assert.equal(beforeLesson(lessonSkillId("b", 0, 9), 1, 0), true);
  assert.equal(beforeLesson(lessonSkillId("b", 1, 2), 1, 2), false);
  assert.equal(beforeLesson(lessonSkillId("b", 1, 3), 1, 2), false);
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

test("skipping ahead leaves earlier lessons out of progress", () => {
  const ch = { title: "Ch", lessons: ["A", "B", "C"], skillIds: [], coverage: "none" as const };
  const p = chapterProgress("b", 0, ch, new Map([[lessonSkillId("b", 0, 2), { mastery: 0.6, attempts: 3, mastered: false }]]), 1);
  assert.deepEqual(p.lessons.map((l) => [l.skipped, l.current]), [[true, false], [false, true], [false, false]]);
  assert.equal(p.percent, 0.6 / 2);
});

test("cleanGuide drops check questions whose answer isn't a choice and caps lengths", () => {
  const guide = cleanGuide({
    bigIdea: " Fractions name parts of a whole. ",
    sections: [{ heading: "Parts", body: "A fraction has a top and a bottom." }, { heading: "Empty", body: "  " }],
    examples: [{ problem: "What is 1/2 of 8?", steps: ["Split 8 into 2 equal groups.", " "], answer: "4" }],
    watchOut: ["Don't add the bottoms.", "", "a", "b", "c"],
    check: [
      { question: "Which is bigger?", choices: ["1/2", "1/3"], answer: 0, why: "Halves are bigger pieces." },
      { question: "Bad index", choices: ["a", "b"], answer: 2, why: "" },
      { question: "One choice", choices: ["a"], answer: 0, why: "" },
    ],
    videoSearch: "  what is a fraction ",
  });
  assert.equal(guide.bigIdea, "Fractions name parts of a whole.");
  assert.equal(guide.sections.length, 1);
  assert.deepEqual(guide.examples[0].steps, ["Split 8 into 2 equal groups."]);
  assert.equal(guide.watchOut.length, 3);
  assert.deepEqual(guide.check.map((c) => c.question), ["Which is bigger?"]);
  assert.equal(guide.videoSearch, "what is a fraction");
});

test("skills taught in later lessons stay out of drills", () => {
  const ch = {
    title: "Ch 5", lessons: ["5.1", "5.2", "5.3", "5.4 Multiply fractions", "5.5 Divide fractions"],
    skillIds: ["mult", "div", "other"], coverage: "partial" as const,
  };
  assert.equal(needsSkillLessons(ch), true);
  // Not placed yet: nothing is held back.
  assert.deepEqual(laterLessonSkills(ch, 3), []);
  const placed = { ...ch, skillLessons: { mult: 3, div: 4, other: -1 } };
  assert.equal(needsSkillLessons(placed), false);
  assert.deepEqual(laterLessonSkills(placed, 3), ["div"]);
  assert.deepEqual(laterLessonSkills(placed, 4), []);
  assert.deepEqual(laterLessonSkills(placed, 0), ["mult", "div"]);
  // A chapter with one lesson (or none listed) has nothing to place.
  assert.equal(needsSkillLessons({ ...ch, lessons: [] }), false);
});
