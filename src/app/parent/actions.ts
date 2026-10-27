"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { familyStudent, requireParent } from "@/lib/auth";
import { SKILLS_BY_ID } from "@/lib/curriculum";
import { seedStudentSkills } from "@/lib/learning";
import { totalXp } from "@/lib/achievements";
import type { FormState } from "@/app/actions/auth";

const pin = z.string().trim().regex(/^\d{4,8}$/, "PIN must be 4–8 digits");
const grade = z.coerce.number().int().min(0).max(8);

const studentSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(40),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{2,20}$/, "Username: 2–20 letters, numbers or _"),
  pin,
  grade,
  avatar: z.string().max(8).default("🦊"),
});

export async function addStudent(_: FormState, form: FormData): Promise<FormState> {
  const { family } = await requireParent();
  const parsed = studentSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;

  const db = await getDb();
  const pinHash = await bcrypt.hash(data.pin, 10);
  const added = await db.transaction(async (tx) => {
    const [student] = await tx.insert(schema.students).values({
      familyId: family.id, name: data.name, username: data.username, grade: data.grade, avatar: data.avatar, pinHash,
      voiceEnabled: data.grade <= 2,
    }).onConflictDoNothing().returning();
    if (student) await seedStudentSkills(student.id, data.grade, tx);
    return !!student;
  });
  if (!added) return { error: "That username is already used in your family." };
  revalidatePath("/parent");
  return {};
}

const settingsSchema = z.object({
  studentId: z.string(),
  dailyProblems: z.coerce.number().int().min(3).max(30),
  weeklyGoal: z.coerce.number().int().min(1).max(7),
  grade,
  aiEnabled: z.literal("on").optional(),
  voiceEnabled: z.literal("on").optional(),
  newPin: z.union([pin, z.literal("")]).optional(),
});

export async function updateStudent(_: FormState, form: FormData): Promise<FormState> {
  const { family } = await requireParent();
  const parsed = settingsSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;
  const student = await familyStudent(family.id, data.studentId);
  if (!student) return { error: "Student not found." };
  const db = await getDb();

  const focus = form.getAll("focus").map(String).filter((id) => SKILLS_BY_ID.has(id)).slice(0, 5);
  await db.update(schema.students).set({
    dailyProblems: data.dailyProblems,
    weeklyGoal: data.weeklyGoal,
    grade: data.grade,
    aiEnabled: data.aiEnabled === "on",
    voiceEnabled: data.voiceEnabled === "on",
    focusSkills: focus,
    ...(data.newPin ? { pinHash: await bcrypt.hash(data.newPin, 10) } : {}),
  }).where(eq(schema.students.id, student.id));
  // Moving a child to a higher grade starts them on that grade's skills.
  if (data.grade > student.grade) await seedStudentSkills(student.id, data.grade);

  revalidatePath(`/parent/students/${student.id}`);
  return { error: undefined };
}

export async function deleteStudent(form: FormData) {
  const { family } = await requireParent();
  const student = await familyStudent(family.id, String(form.get("studentId")));
  if (student) await (await getDb()).delete(schema.students).where(eq(schema.students.id, student.id));
  redirect("/parent");
}

const coParentSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(60),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export async function addCoParent(_: FormState, form: FormData): Promise<FormState> {
  const { family } = await requireParent();
  const parsed = coParentSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, email, password } = parsed.data;
  const db = await getDb();
  const [added] = await db.insert(schema.parents)
    .values({ familyId: family.id, name, email, passwordHash: await bcrypt.hash(password, 10) })
    .onConflictDoNothing().returning({ id: schema.parents.id });
  if (!added) return { error: "An account with that email already exists." };
  revalidatePath("/parent");
  return {};
}

const rewardSchema = z.object({
  studentId: z.string(),
  title: z.string().trim().min(1, "Describe the reward").max(80),
  xpNeeded: z.coerce.number().int().min(10, "At least 10 XP").max(100000),
});

/** Adds a reward that unlocks once the student earns `xpNeeded` more XP from now. */
export async function addReward(_: FormState, form: FormData): Promise<FormState> {
  const { family } = await requireParent();
  const parsed = rewardSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const student = await familyStudent(family.id, parsed.data.studentId);
  if (!student) return { error: "Student not found." };
  const db = await getDb();
  const xpTarget = (await totalXp(db, student.id)) + parsed.data.xpNeeded;
  await db.insert(schema.rewards).values({ studentId: student.id, title: parsed.data.title, xpTarget });
  revalidatePath(`/parent/students/${student.id}`);
  return {};
}

async function familyReward(familyId: string, rewardId: string) {
  const db = await getDb();
  const [row] = await db.select({ reward: schema.rewards }).from(schema.rewards)
    .innerJoin(schema.students, eq(schema.students.id, schema.rewards.studentId))
    .where(and(eq(schema.rewards.id, rewardId), eq(schema.students.familyId, familyId)));
  return row?.reward ?? null;
}

export async function markRewardGiven(form: FormData) {
  const { family } = await requireParent();
  const reward = await familyReward(family.id, String(form.get("rewardId")));
  if (!reward) return;
  await (await getDb()).update(schema.rewards).set({ givenAt: new Date() }).where(eq(schema.rewards.id, reward.id));
  revalidatePath(`/parent/students/${reward.studentId}`);
}

export async function deleteReward(form: FormData) {
  const { family } = await requireParent();
  const reward = await familyReward(family.id, String(form.get("rewardId")));
  if (!reward) return;
  await (await getDb()).delete(schema.rewards).where(eq(schema.rewards.id, reward.id));
  revalidatePath(`/parent/students/${reward.studentId}`);
}

export async function deleteTestPrep(form: FormData) {
  const { family } = await requireParent();
  const db = await getDb();
  const [row] = await db.select({ prep: schema.testPreps }).from(schema.testPreps)
    .innerJoin(schema.students, eq(schema.students.id, schema.testPreps.studentId))
    .where(and(eq(schema.testPreps.id, String(form.get("prepId"))), eq(schema.students.familyId, family.id)));
  if (!row) return;
  // Its unused practice problems go with it (cascade); answered drill problems stay.
  await db.delete(schema.testPreps).where(eq(schema.testPreps.id, row.prep.id));
  revalidatePath(`/parent/students/${row.prep.studentId}`);
}
