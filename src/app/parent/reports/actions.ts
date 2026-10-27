"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireParent } from "@/lib/auth";
import { weekStart } from "@/lib/gamification";
import { localDate } from "@/lib/progress";
import { buildWeeklyReport } from "@/lib/weekly";

/** Writes a report for the week so far, so a parent can see it before the weekly email. */
export async function generateReportNow() {
  const { family } = await requireParent();
  await buildWeeklyReport(family.id, weekStart(localDate(family.timezone)));
  revalidatePath("/parent/reports");
}

export async function setWeeklyEmail(form: FormData) {
  const { parent } = await requireParent();
  await (await getDb()).update(schema.parents).set({ weeklyEmail: form.get("on") === "true" }).where(eq(schema.parents.id, parent.id));
  revalidatePath("/parent/reports");
}
