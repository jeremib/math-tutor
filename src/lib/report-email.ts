// Renders a weekly report as an email. Pure, so it can be unit-tested.
import type { WeeklyReport } from "../db/schema.ts";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const friendlyDate = (date: string) =>
  new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });

function statLine(s: WeeklyReport["students"][number]["stats"]): string {
  const parts = [`${s.drills} drill${s.drills === 1 ? "" : "s"}`];
  if (s.accuracy !== null) parts.push(`${s.accuracy}% right on the first try`);
  parts.push(`${s.xp} XP`);
  if (s.homeworkSolved) parts.push(`${s.homeworkSolved} homework problem${s.homeworkSolved === 1 ? "" : "s"} solved`);
  if (s.racesBest !== null) parts.push(`best race: ${s.racesBest}`);
  return parts.join(" · ");
}

export function renderReportEmail(report: WeeklyReport, opts: { familyName: string; weekStart: string; appUrl: string }) {
  const subject = `Math Buddy: ${opts.familyName}'s week of ${friendlyDate(opts.weekStart)}`;
  const link = `${opts.appUrl.replace(/\/$/, "")}/parent/reports`;

  const textParts = [`${opts.familyName}'s week in math (week of ${friendlyDate(opts.weekStart)})`, ""];
  const htmlParts: string[] = [];
  for (const s of report.students) {
    textParts.push(`${s.name}: ${s.headline}`, statLine(s.stats));
    if (s.wins.length) textParts.push("Wins:", ...s.wins.map((w) => `- ${w}`));
    if (s.watch.length) textParts.push("Keep an eye on:", ...s.watch.map((w) => `- ${w}`));
    textParts.push(`Try at home: ${s.tryAtHome}`, "");

    const list = (items: string[]) => `<ul style="margin:6px 0 0;padding-left:20px">${items.map((i) => `<li style="margin:3px 0">${escape(i)}</li>`).join("")}</ul>`;
    htmlParts.push(`
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:20px;margin:0 0 16px">
        <h2 style="margin:0;font-size:20px;color:#13264a">${escape(s.name)}</h2>
        <p style="margin:6px 0 0;font-size:16px;color:#1e293b">${escape(s.headline)}</p>
        <p style="margin:8px 0 0;font-size:13px;color:#64748b">${escape(statLine(s.stats))}</p>
        ${s.wins.length ? `<h3 style="margin:16px 0 0;font-size:14px;color:#15803d">🎉 Wins</h3>${list(s.wins)}` : ""}
        ${s.watch.length ? `<h3 style="margin:16px 0 0;font-size:14px;color:#6d28d9">🔍 Keep an eye on</h3>${list(s.watch)}` : ""}
        <div style="margin:16px 0 0;background:#fff6c7;border-radius:10px;padding:12px">
          <strong style="font-size:14px">🏠 Try at home:</strong> <span style="font-size:14px">${escape(s.tryAtHome)}</span>
        </div>
      </div>`);
  }
  textParts.push(`See more: ${link}`);

  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1e293b">
    <div style="max-width:600px;margin:0 auto;padding:24px 16px">
      <p style="margin:0 0 4px;font-weight:800;color:#1d4ed8;font-size:18px">÷ Math Buddy</p>
      <h1 style="margin:0 0 20px;font-size:24px;color:#13264a">${escape(opts.familyName)}&#39;s week in math</h1>
      ${htmlParts.join("")}
      <p style="text-align:center;margin:24px 0"><a href="${escape(link)}" style="background:#2563eb;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:12px;display:inline-block">Open the parent dashboard</a></p>
      <p style="text-align:center;font-size:12px;color:#94a3b8">You can turn these emails off on the Weekly reports page.</p>
    </div></body></html>`;
  return { subject, html, text: textParts.join("\n") };
}
