import { test } from "node:test";
import assert from "node:assert/strict";
import { splitFractions } from "../src/lib/math-text.ts";

test("splitFractions stacks fractions, mixed numbers and variable fractions", () => {
  assert.deepEqual(splitFractions("Solve for y: (-3/5)y = 9/10"), [
    { text: "Solve for y: (-" }, { num: "3", den: "5" }, { text: ")y = " }, { num: "9", den: "10" },
  ]);
  assert.deepEqual(splitFractions("1 1/2 + x/4"), [{ whole: "1", num: "1", den: "2" }, { text: " + " }, { num: "x", den: "4" }]);
});

test("splitFractions leaves dates, decimals, units and words alone", () => {
  for (const s of ["on 10/12/2025", "1.5/2", "60 km/h", "and/or", "w/o help"]) assert.deepEqual(splitFractions(s), [{ text: s }]);
});
