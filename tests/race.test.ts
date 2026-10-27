import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_RACE_PROBLEMS, raceOpsFor, raceProblems, scoreRace } from "../src/lib/race.ts";

test("race problems are reproducible from the seed", () => {
  assert.deepEqual(raceProblems("mul", 7, 20), raceProblems("mul", 7, 20));
  assert.notDeepEqual(raceProblems("mul", 7, 20), raceProblems("mul", 8, 20));
  for (const op of ["add", "sub", "mul", "div"] as const) {
    const ps = raceProblems(op, 3, 200);
    assert.ok(ps.every((p) => Number.isInteger(p.answer) && p.answer >= 0), op);
    assert.ok(ps.every((p, i) => i === 0 || p.prompt !== ps[i - 1].prompt), `${op} repeats`);
  }
});

test("scores races on the server's copy of the problems", () => {
  const ps = raceProblems("add", 11, 5);
  const answers = ps.map((p) => String(p.answer));
  answers[1] = String(ps[1].answer + 1);
  answers[3] = "";
  assert.deepEqual(scoreRace("add", 11, answers), { attempted: 5, correct: 3 });
  const tooMany = raceProblems("add", 11, MAX_RACE_PROBLEMS + 50).map((p) => String(p.answer));
  assert.equal(scoreRace("add", 11, tooMany).correct, MAX_RACE_PROBLEMS);
});

test("offers operations by grade", () => {
  assert.deepEqual(raceOpsFor(0).map((o) => o.op), ["add"]);
  assert.deepEqual(raceOpsFor(2).map((o) => o.op), ["add", "sub"]);
  assert.deepEqual(raceOpsFor(5).map((o) => o.op), ["add", "sub", "mul", "div"]);
});
