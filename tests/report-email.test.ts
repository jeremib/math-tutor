import { test } from "node:test";
import assert from "node:assert/strict";
import { renderReportEmail } from "../src/lib/report-email.ts";

test("renders the weekly email and escapes content", () => {
  const { subject, html, text } = renderReportEmail({
    students: [{
      studentId: "s1", name: "Ava <script>", headline: "A strong week with fractions.",
      stats: { drills: 5, accuracy: 82, xp: 410, mastered: ["Equivalent fractions"], homeworkSolved: 2, racesBest: 18 },
      wins: ["Mastered equivalent fractions"], watch: ["Adds the tops and the bottoms"], tryAtHome: "Cut a pizza into 8 & ask for 3/8.",
    }],
  }, { familyName: "Rivera", weekStart: "2026-10-19", appUrl: "https://mathbuddy.example.com/" });
  assert.equal(subject, "Math Buddy: Rivera's week of October 19");
  assert.ok(html.includes("Ava &lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("8 &amp; ask"));
  assert.ok(html.includes("https://mathbuddy.example.com/parent/reports"));
  assert.ok(text.includes("5 drills · 82% right on the first try · 410 XP · 2 homework problems solved · best race: 18"));
});
