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
