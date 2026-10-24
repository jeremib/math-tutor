"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { familyStudent, requireParent } from "@/lib/auth";
import { SKILLS_BY_ID } from "@/lib/curriculum";
import { seedStudentSkills } from "@/lib/learning";
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

  const taken = db.select().from(schema.students)
    .where(and(eq(schema.students.familyId, family.id), eq(schema.students.username, data.username))).get();
  if (taken) return { error: "That username is already used in your family." };

  const student = db.insert(schema.students).values({
    familyId: family.id, name: data.name, username: data.username, grade: data.grade,
    avatar: data.avatar, pinHash: await bcrypt.hash(data.pin, 10),
  }).returning().get();
  seedStudentSkills(student.id, data.grade);
  revalidatePath("/parent");
  return {};
}

const settingsSchema = z.object({
  studentId: z.string(),
  dailyProblems: z.coerce.number().int().min(3).max(30),
  grade,
  homeworkEnabled: z.literal("on").optional(),
  newPin: z.union([pin, z.literal("")]).optional(),
});

export async function updateStudent(_: FormState, form: FormData): Promise<FormState> {
  const { family } = await requireParent();
  const parsed = settingsSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;
  const student = familyStudent(family.id, data.studentId);
  if (!student) return { error: "Student not found." };

  const focus = form.getAll("focus").map(String).filter((id) => SKILLS_BY_ID.has(id)).slice(0, 5);
  db.update(schema.students).set({
    dailyProblems: data.dailyProblems,
    grade: data.grade,
    homeworkEnabled: data.homeworkEnabled === "on",
    focusSkills: JSON.stringify(focus),
    ...(data.newPin ? { pinHash: await bcrypt.hash(data.newPin, 10) } : {}),
  }).where(eq(schema.students.id, student.id)).run();
  // Moving a child to a higher grade starts them on that grade's skills.
  if (data.grade > student.grade) seedStudentSkills(student.id, data.grade);

  revalidatePath(`/parent/students/${student.id}`);
  return { error: undefined };
}

export async function deleteStudent(form: FormData) {
  const { family } = await requireParent();
  const student = familyStudent(family.id, String(form.get("studentId")));
  if (student) db.delete(schema.students).where(eq(schema.students.id, student.id)).run();
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
  if (db.select().from(schema.parents).where(eq(schema.parents.email, email)).get()) {
    return { error: "An account with that email already exists." };
  }
  db.insert(schema.parents).values({ familyId: family.id, name, email, passwordHash: await bcrypt.hash(password, 10) }).run();
  revalidatePath("/parent");
  return {};
}
