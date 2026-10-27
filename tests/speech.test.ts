import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAnswer } from "../src/lib/answers.ts";
import { speakableMath, spokenToAnswer } from "../src/lib/speech.ts";

test("reads math aloud naturally", () => {
  assert.equal(speakableMath("3/4 + 1/2 = ?"), "3 fourths plus 1 half equals what?");
  assert.equal(speakableMath("12 − 9 = ?"), "12 minus 9 equals what?");
  assert.equal(speakableMath("-5 + (−3) = ?"), "negative 5 plus negative 3 equals what?");
  assert.equal(speakableMath("261 × 4 = ?"), "261 times 4 equals what?");
  assert.equal(speakableMath("56 ÷ 7 = ?"), "56 divided by 7 equals what?");
  assert.equal(speakableMath("1 1/2 + 1/4"), "1 and 1 half plus 1 fourth");
  assert.equal(speakableMath("√49 = ?"), "the square root of 49 equals what?");
  assert.equal(speakableMath("5^2 = ?"), "5 squared equals what?");
  assert.equal(speakableMath("2^5 = ?"), "2 to the power of 5 equals what?");
  assert.equal(speakableMath("Write the remainder like 7 R 2"), "Write the remainder like 7 remainder 2");
  assert.equal(speakableMath("3 : 4 = 9 : ?"), "3 to 4 equals 9 to ?");
  assert.equal(speakableMath("2/13"), "2 over 13");
});

test("understands spoken answers", () => {
  const cases: [string, string, "number" | "remainder" | "choice", string][] = [
    ["twelve", "12", "number", "12"],
    ["one hundred twenty-three", "123", "number", "123"],
    ["two thousand five hundred and six", "2506", "number", "2506"],
    ["three fourths", "3/4", "number", "3/4"],
    ["three quarters", "3/4", "number", "3/4"],
    ["a half", "1/2", "number", "1/2"],
    ["two and a half", "2 1/2", "number", "5/2"],
    ["one and three eighths", "1 3/8", "number", "11/8"],
    ["five over twelve", "5/12", "number", "5/12"],
    ["two point five", "2.5", "number", "5/2"],
    ["negative seven", "-7", "number", "-7"],
    ["The answer is 42.", "42", "number", "42"],
    ["seven remainder two", "7 R 2", "remainder", "7 R 2"],
    ["7 r 2", "7 R 2", "remainder", "7 R 2"],
    ["3 / 4", "3/4", "number", "3/4"],
    ["less than", "<", "choice", "<"],
  ];
  for (const [spoken, expected, kind, key] of cases) {
    const got = spokenToAnswer(spoken);
    assert.equal(got, expected, spoken);
    assert.ok(checkAnswer(kind, key, got), `${spoken} should check against ${key}`);
  }
  assert.equal(spokenToAnswer("banana"), "banana");
});
