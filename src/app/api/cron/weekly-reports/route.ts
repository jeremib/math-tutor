import { NextResponse } from "next/server";
import { runWeeklyReports } from "@/lib/weekly";

// Writing every family's report can take a while.
export const maxDuration = 300;

/**
 * Builds and emails the weekly reports. Call it once a week from a scheduler, e.g. Sunday evening:
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/weekly-reports
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runWeeklyReports());
}
