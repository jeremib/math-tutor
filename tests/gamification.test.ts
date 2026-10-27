import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AVATARS, BADGES, avatarUnlocked, checkInXp, levelInfo, longestStreak, newBadges, streakEndingOn, weekDates, weekStart, xpForLevel,
  type BadgeStats,
} from "../src/lib/gamification.ts";

test("levels grow with XP and report progress to the next one", () => {
  assert.equal(xpForLevel(1), 0);
  assert.equal(xpForLevel(2), 50);
  assert.equal(xpForLevel(5), 500);
  assert.deepEqual(levelInfo(0), { level: 1, xp: 0, intoLevel: 0, levelSize: 50, toNext: 50 });
  assert.equal(levelInfo(49).level, 1);
  assert.equal(levelInfo(50).level, 2);
  const mid = levelInfo(200);
  assert.equal(mid.level, 3);
  assert.equal(mid.intoLevel + mid.toNext, mid.levelSize);
});

test("check-in XP grows with the streak but is capped", () => {
  assert.equal(checkInXp(1), 5);
  assert.equal(checkInXp(3), 7);
  assert.equal(checkInXp(30), 10);
});

test("streak helpers", () => {
  assert.equal(longestStreak(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-10", "2026-10-11"]), 3);
  assert.equal(longestStreak([]), 0);
  assert.equal(streakEndingOn(["2026-10-24", "2026-10-25", "2026-10-26"], "2026-10-26"), 3);
  assert.equal(streakEndingOn(["2026-10-24"], "2026-10-26"), 0);
  // Month and year boundaries.
  assert.equal(longestStreak(["2026-12-31", "2027-01-01"]), 2);
});

test("weeks start on Monday", () => {
  assert.equal(weekStart("2026-10-26"), "2026-10-26"); // Monday
  assert.equal(weekStart("2026-11-01"), "2026-10-26"); // Sunday
  assert.deepEqual(weekDates("2026-10-28").slice(0, 2), ["2026-10-26", "2026-10-27"]);
});

test("badges are awarded once when their condition is met", () => {
  const zero: BadgeStats = {
    drillsCompleted: 0, perfectDrills: 0, hintFreeDrills: 0, bestStreak: 0, bestCheckInStreak: 0,
    problemsCorrect: 0, skillsMastered: 0, homeworkSolved: 0, weeklyGoalsMet: 0, level: 1,
  };
  assert.deepEqual(newBadges(zero, new Set()), []);
  const firstDay = { ...zero, drillsCompleted: 1, perfectDrills: 1, hintFreeDrills: 1, bestStreak: 1, problemsCorrect: 8 };
  assert.deepEqual(newBadges(firstDay, new Set()).map((b) => b.id), ["first-drill", "perfect", "no-hints"]);
  assert.deepEqual(newBadges(firstDay, new Set(["first-drill", "perfect", "no-hints"])), []);
  assert.equal(new Set(BADGES.map((b) => b.id)).size, BADGES.length);
});

test("avatars unlock by level", () => {
  assert.ok(avatarUnlocked("🦊", 1));
  assert.ok(!avatarUnlocked("🐲", 4));
  assert.ok(avatarUnlocked("🐲", 5));
  assert.ok(!avatarUnlocked("not-an-avatar", 99));
  assert.equal(new Set(AVATARS.map((a) => a.emoji)).size, AVATARS.length);
});

test("weekly reports cover the week just ending", async () => {
  const { reportWeek } = await import("../src/lib/gamification.ts");
  assert.equal(reportWeek("2026-10-25"), "2026-10-19"); // Sunday: this week
  assert.equal(reportWeek("2026-10-26"), "2026-10-19"); // Monday: last week
  assert.equal(reportWeek("2026-10-28"), "2026-10-26"); // midweek: this week so far
});
