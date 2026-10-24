import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAnswer, parseRational } from "../src/lib/answers.ts";
import { SKILLS, seededRandom } from "../src/lib/curriculum.ts";
import { chooseDrillSkills, computeStreak, initialSkills, isMastered, skillsToUnlock, updateMastery, type SkillState } from "../src/lib/progress.ts";

test("parses numbers, decimals, fractions and mixed numbers", () => {
  assert.deepEqual(parseRational("0.5"), parseRational("1/2"));
  assert.deepEqual(parseRational("2/4"), parseRational("1/2"));
  assert.deepEqual(parseRational("1 1/2"), parseRational("3/2"));
  assert.deepEqual(parseRational("-1 1/2"), parseRational("-1.5"));
  assert.deepEqual(parseRational("1,200"), parseRational("1200"));
  assert.equal(parseRational("abc"), null);
  assert.equal(parseRational("1/0"), null);
});

test("checks each answer kind", () => {
  assert.ok(checkAnswer("number", "3/4", "0.75"));
  assert.ok(!checkAnswer("number", "3/4", "0.7"));
  assert.ok(checkAnswer("remainder", "7 R 2", "7r2"));
  assert.ok(checkAnswer("remainder", "7 R 0", "7"));
  assert.ok(!checkAnswer("remainder", "7 R 2", "7"));
  assert.ok(checkAnswer("choice", ">", ">"));
  assert.ok(!checkAnswer("number", "5", ""));
});

test("every skill generates problems its own checker accepts", () => {
  const rand = seededRandom(42);
  for (const skill of SKILLS) {
    for (let i = 0; i < 200; i++) {
      const p = skill.generate(rand);
      assert.ok(p.prompt && p.hint && p.explanation, `${skill.id} missing text`);
      assert.ok(checkAnswer(p.answerKind, p.answer, p.answer), `${skill.id}: "${p.answer}" for "${p.prompt}"`);
      assert.ok(!/NaN|undefined|Infinity/.test(p.prompt + p.answer), `${skill.id}: bad output "${p.prompt}" = ${p.answer}`);
    }
  }
});

test("skill ids are unique", () => {
  assert.equal(new Set(SKILLS.map((s) => s.id)).size, SKILLS.length);
});

test("mastery requires sustained accuracy", () => {
  let m = 0;
  for (let i = 0; i < 7; i++) m = updateMastery(m, true);
  assert.ok(!isMastered(m, 7));
  m = updateMastery(m, true);
  assert.ok(isMastered(m, 8));
  assert.ok(!isMastered(updateMastery(updateMastery(m, false), false), 10));
});

test("new students review earlier grades and start on their own", () => {
  const init = initialSkills(3);
  assert.ok(init.filter((s) => !s.mastered).every((s) => s.skillId.startsWith("g3")));
  assert.ok(init.filter((s) => s.mastered).every((s) => !s.skillId.startsWith("g3")));
});

test("mastering a skill unlocks the next one", () => {
  const states: SkillState[] = [
    { skillId: "g1-add-10", mastery: 0.9, attempts: 10, mastered: true, lastPracticedAt: 1 },
    { skillId: "g1-sub-10", mastery: 0.3, attempts: 4, mastered: false, lastPracticedAt: 1 },
  ];
  assert.deepEqual(skillsToUnlock(states), ["g1-add-20"]);
  assert.deepEqual(skillsToUnlock([...states, { ...states[1], skillId: "g1-add-20" }]), []);
});

test("drills mix learning and review and respect focus", () => {
  const states: SkillState[] = [
    { skillId: "g3-mult-facts", mastery: 0.2, attempts: 3, mastered: false, lastPracticedAt: null },
    { skillId: "g3-div-facts", mastery: 0.1, attempts: 1, mastered: false, lastPracticedAt: null },
    { skillId: "g2-add-100", mastery: 0.85, attempts: 20, mastered: true, lastPracticedAt: 5 },
  ];
  const drill = chooseDrillSkills(states, 10);
  assert.equal(drill.length, 10);
  assert.equal(drill.filter((s) => s === "g2-add-100").length, 3);
  for (let i = 1; i < drill.length; i++) assert.notEqual(drill[i], drill[i - 1]);

  const focused = chooseDrillSkills(states, 10, ["g4-long-div"]);
  assert.equal(focused.filter((s) => s === "g4-long-div").length, 7);
  assert.deepEqual(chooseDrillSkills([], 3).length, 3);

  // With equal mastery, review favors recent grades over kindergarten.
  const fresh = initialSkills(3).map((s) => ({ ...s, mastery: s.mastered ? 0.8 : 0, attempts: 0, lastPracticedAt: null }));
  const reviewed = chooseDrillSkills(fresh, 8).filter((id) => !id.startsWith("g3"));
  assert.ok(reviewed.length > 0 && reviewed.every((id) => id.startsWith("g2")), reviewed.join());
});

test("streak counts consecutive days", () => {
  assert.equal(computeStreak(["2026-10-22", "2026-10-23", "2026-10-24"], "2026-10-24"), 3);
  assert.equal(computeStreak(["2026-10-22", "2026-10-23"], "2026-10-24"), 2);
  assert.equal(computeStreak(["2026-10-21"], "2026-10-24"), 0);
});
