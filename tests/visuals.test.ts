import { test } from "node:test";
import assert from "node:assert/strict";
import { SKILLS, seededRandom } from "../src/lib/curriculum.ts";
import { placeParts, validVisual } from "../src/lib/visuals.ts";

test("every curriculum visual is valid", () => {
  const rand = seededRandom(42);
  let withVisual = 0;
  for (const skill of SKILLS) {
    for (let i = 0; i < 200; i++) {
      const p = skill.generate(rand);
      if (!p.visual) continue;
      withVisual++;
      assert.ok(validVisual(p.visual), `${skill.id}: ${JSON.stringify(p.visual)}`);
    }
  }
  assert.ok(withVisual > 2000);
});

test("rejects malformed visuals", () => {
  assert.ok(!validVisual(null));
  assert.ok(!validVisual({ type: "pie" }));
  assert.ok(!validVisual({ type: "fractions", bars: [{ n: 1, d: 0 }] }));
  assert.ok(!validVisual({ type: "numberline", min: 0, max: 1000, step: 1, points: [] }));
  assert.ok(!validVisual({ type: "numberline", min: 0, max: 10, step: 1, points: [{ value: 11 }] }));
  assert.ok(!validVisual({ type: "array", rows: 13, cols: 2 }));
  assert.ok(!validVisual({ type: "dots", groups: [21] }));
  assert.ok(validVisual({ type: "fractions", bars: [{ n: 3, d: 4, label: "3/4" }] }));
  assert.ok(validVisual({ type: "area", a: 23, b: 14 }));
});

test("splits numbers into place-value parts", () => {
  assert.deepEqual(placeParts(234), [200, 30, 4]);
  assert.deepEqual(placeParts(205), [200, 5]);
  assert.deepEqual(placeParts(7), [7]);
  assert.deepEqual(placeParts(0), [0]);
});

test("pulls visuals out of tutor messages", async () => {
  const { splitVisuals, withoutVisuals } = await import("../src/lib/visuals.ts");
  const msg = 'Look at these bars.\n[[VISUAL {"type":"fractions","bars":[{"n":1,"d":3},{"n":1,"d":4}]}]]\nWhich is bigger?';
  const parts = splitVisuals(msg);
  assert.equal(parts.length, 3);
  assert.deepEqual(parts[0], { text: "Look at these bars." });
  assert.ok("visual" in parts[1]);
  assert.deepEqual(parts[2], { text: "Which is bigger?" });
  assert.deepEqual(splitVisuals('Hi [[VISUAL {"type":"pie"}]] there'), [{ text: "Hi" }, { text: "there" }]);
  assert.deepEqual(splitVisuals("[[VISUAL {not json}]]"), []);
  assert.equal(withoutVisuals(msg), "Look at these bars. Which is bigger?");
});
