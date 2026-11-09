import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSelection, interleave, scoreTest, testTitle, weakLessons, MAX_TEST_LESSONS } from "../src/lib/chapter-test-plan.ts";

const CH = (title: string, lessons: string[]) => ({ title, lessons, skillIds: [], coverage: "none" as const });
const chapters = [CH("Chapter 1: Integers", ["1.1 Add", "1.2 Subtract", "1.3 Multiply"]), CH("Chapter 2: Fractions", []), CH("Chapter 3: Big", Array.from({ length: 20 }, (_, i) => `L${i}`))];

test("cleanSelection keeps real lessons once, in book order, capped", () => {
  assert.deepEqual(cleanSelection([{ chapter: 1, lesson: 0 }, { chapter: 0, lesson: 2 }, { chapter: 0, lesson: 2 }, { chapter: 0, lesson: 3 }, { chapter: 1, lesson: 1 }, { chapter: 9, lesson: 0 }], chapters),
    [{ chapter: 0, lesson: 2 }, { chapter: 1, lesson: 0 }]);
  assert.equal(cleanSelection(Array.from({ length: 20 }, (_, i) => ({ chapter: 2, lesson: i })), chapters).length, MAX_TEST_LESSONS);
});

test("testTitle names the chapter, a part of it, or several", () => {
  assert.equal(testTitle([0, 1, 2].map((lesson) => ({ chapter: 0, lesson })), chapters), "Chapter 1: Integers");
  assert.equal(testTitle([{ chapter: 0, lesson: 1 }], chapters), "Chapter 1: Integers (1 of 3 lessons)");
  assert.equal(testTitle([{ chapter: 0, lesson: 1 }, { chapter: 1, lesson: 0 }], chapters), "2 chapters: Chapter 1: Integers, Chapter 2: Fractions");
});

test("interleave mixes concepts round by round", () => {
  assert.deepEqual(interleave([["a1", "a2", "a3"], ["b1"], ["c1", "c2"]]), ["a1", "b1", "c1", "a2", "c2", "a3"]);
});

test("scoreTest gives half credit for help and weights concepts equally", () => {
  const r = scoreTest(3, [
    { concept: 0, solved: true, firstTryCorrect: true }, { concept: 0, solved: true, firstTryCorrect: true },
    { concept: 1, solved: true, firstTryCorrect: false }, { concept: 1, solved: false, firstTryCorrect: false },
  ]);
  assert.deepEqual(r.concepts, [{ score: 1, right: 2, total: 2 }, { score: 0.25, right: 0, total: 2 }, { score: 0, right: 0, total: 0 }]);
  assert.equal(r.score, 0.625);
  assert.equal(r.level, "almost");
  assert.deepEqual(weakLessons([{ chapter: 0, lesson: 0 }, { chapter: 0, lesson: 1 }], r), [{ chapter: 0, lesson: 1 }]);
});
