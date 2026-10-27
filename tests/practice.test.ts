import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAnswer } from "../src/lib/answers.ts";
import { mixIntoDrill, normalizeTag, practiceSlots, validateGenerated } from "../src/lib/practice.ts";

const base = { prompt: "What is 2/3 + 1/6?", hint: "Find a common denominator.", explanation: "4/6 + 1/6 = 5/6" };

test("accepts generated problems the answer checker can grade", () => {
  const p = validateGenerated({ ...base, answer: " 5/6 ", answerKind: "number" });
  assert.equal(p?.answer, "5/6");
  assert.ok(checkAnswer("number", p!.answer, "10/12"));
  assert.equal(validateGenerated({ ...base, answer: "1,250", answerKind: "number" })?.answer, "1250");
  const r = validateGenerated({ ...base, answer: "7r2", answerKind: "remainder" });
  assert.equal(r?.answer, "7 R 2");
  assert.ok(checkAnswer("remainder", r!.answer, "7 R 2"));
});

test("rejects generated problems we can't grade", () => {
  assert.equal(validateGenerated({ ...base, answer: "five sixths", answerKind: "number" }), null);
  assert.equal(validateGenerated({ ...base, answer: "5/6 cups", answerKind: "number" }), null);
  assert.equal(validateGenerated({ ...base, answer: "7", answerKind: "remainder" }), null);
  assert.equal(validateGenerated({ ...base, prompt: " ", answer: "1", answerKind: "number" }), null);
  assert.equal(validateGenerated({ ...base, hint: "", answer: "1", answerKind: "number" }), null);
});

test("gives practice problems up to a third of the drill", () => {
  assert.equal(practiceSlots(8, 0), 0);
  assert.equal(practiceSlots(8, 1), 1);
  assert.equal(practiceSlots(8, 10), 2);
  assert.equal(practiceSlots(30, 10), 10);
  assert.equal(practiceSlots(3, 5), 1);
});

test("mixes practice through the drill without changing its length", () => {
  const mixed = mixIntoDrill(["a", "b", "c", "d", "e", "f"], [1, 2]);
  assert.equal(mixed.length, 6);
  assert.deepEqual(mixed.filter((x) => typeof x === "number"), [1, 2]);
  assert.equal(typeof mixed[0], "string");
  assert.notEqual(typeof mixed.at(-1), typeof mixed.at(-2));
  assert.deepEqual(mixIntoDrill(["a", "b"], []), ["a", "b"]);
});

test("normalizes misconception tags", () => {
  assert.equal(normalizeTag("Adds Denominators!"), "adds-denominators");
  assert.equal(normalizeTag("--forgets_to_carry--"), "forgets-to-carry");
  assert.equal(normalizeTag("???"), "unnamed");
});

test("paces quiz practice over the days before the quiz", async () => {
  const { choosePractice } = await import("../src/lib/practice.ts");
  // 20 quiz problems, quiz in 4 days: 4 a day, within half of an 8-problem drill.
  assert.deepEqual(choosePractice(8, 20, 4, 0), { quiz: 4, other: 0 });
  // Quiz tomorrow: as many as fit in half the drill.
  assert.deepEqual(choosePractice(8, 20, 1, 3), { quiz: 4, other: 0 });
  // Quiz far away: at least one a day, leaving room for other practice.
  assert.deepEqual(choosePractice(9, 4, 30, 5), { quiz: 1, other: 3 });
  // No quiz: the usual third.
  assert.deepEqual(choosePractice(9, 0, 0, 5), { quiz: 0, other: 3 });
});
