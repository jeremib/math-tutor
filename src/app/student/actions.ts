"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStudent } from "@/lib/auth";
import { totalXp } from "@/lib/achievements";
import { avatarUnlocked, levelInfo } from "@/lib/gamification";

export async function chooseAvatar(form: FormData) {
  const { student } = await requireStudent();
  const avatar = String(form.get("avatar") ?? "");
  const db = await getDb();
  const { level } = levelInfo(await totalXp(db, student.id));
  if (!avatarUnlocked(avatar, level)) return;
  await db.update(schema.students).set({ avatar }).where(eq(schema.students.id, student.id));
  revalidatePath("/student", "layout");
}
