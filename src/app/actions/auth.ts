"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { createSession, destroySession } from "@/lib/auth";
import { clearAttempts, tooManyAttempts } from "@/lib/rate-limit";

export type FormState = { error?: string } | undefined;

const CODE_WORDS = ["OWL", "FOX", "BEE", "CAT", "ELK", "YAK", "EMU", "APE", "BAT", "COD", "JAY", "RAM"];

function newFamilyCode() {
  for (;;) {
    const code = `${CODE_WORDS[Math.floor(Math.random() * CODE_WORDS.length)]}-${Math.floor(1000 + Math.random() * 9000)}`;
    if (!db.select().from(schema.families).where(eq(schema.families.code, code)).get()) return code;
  }
}

const signupSchema = z.object({
  familyName: z.string().trim().min(1, "Enter a family name").max(60),
  name: z.string().trim().min(1, "Enter your name").max(60),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  timezone: z.string().max(60).optional(),
});

export async function signup(_: FormState, form: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { familyName, name, email, password, timezone } = parsed.data;

  if (db.select().from(schema.parents).where(eq(schema.parents.email, email)).get()) {
    return { error: "An account with that email already exists. Try logging in." };
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const parentId = db.transaction((tx) => {
    const family = tx.insert(schema.families).values({
      name: familyName, code: newFamilyCode(), timezone: timezone || "America/New_York",
    }).returning().get();
    return tx.insert(schema.parents).values({ familyId: family.id, name, email, passwordHash }).returning().get().id;
  });
  await createSession("parent", parentId);
  redirect("/parent");
}

export async function parentLogin(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const key = `parent:${email}`;
  if (tooManyAttempts(key)) return { error: "Too many attempts. Please wait a few minutes." };

  const parent = db.select().from(schema.parents).where(eq(schema.parents.email, email)).get();
  if (!parent || !(await bcrypt.compare(password, parent.passwordHash))) {
    return { error: "Email or password is incorrect." };
  }
  clearAttempts(key);
  await createSession("parent", parent.id);
  redirect("/parent");
}

export async function studentLogin(_: FormState, form: FormData): Promise<FormState> {
  const code = String(form.get("code") ?? "").trim().toUpperCase();
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const pin = String(form.get("pin") ?? "").trim();
  const key = `student:${code}:${username}`;
  if (tooManyAttempts(key, 10)) return { error: "Too many tries. Ask a grown-up for help, or wait a few minutes." };

  const family = db.select().from(schema.families).where(eq(schema.families.code, code)).get();
  const student = family && db.select().from(schema.students)
    .where(and(eq(schema.students.familyId, family.id), eq(schema.students.username, username))).get();
  if (!student || !(await bcrypt.compare(pin, student.pinHash))) {
    return { error: "That didn't match. Check your family code, name and PIN." };
  }
  clearAttempts(key);
  await createSession("student", student.id);
  redirect("/student");
}

export async function logout() {
  await destroySession();
  redirect("/");
}
