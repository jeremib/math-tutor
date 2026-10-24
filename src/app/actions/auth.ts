"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, type Db } from "@/db";
import { createSession, destroySession } from "@/lib/auth";
import { clearAttempts, tooManyAttempts } from "@/lib/rate-limit";

export type FormState = { error?: string } | undefined;

const CODE_WORDS = ["OWL", "FOX", "BEE", "CAT", "ELK", "YAK", "EMU", "APE", "BAT", "COD", "JAY", "RAM"];

async function newFamilyCode(db: Db) {
  for (;;) {
    const code = `${CODE_WORDS[Math.floor(Math.random() * CODE_WORDS.length)]}-${Math.floor(1000 + Math.random() * 9000)}`;
    const [taken] = await db.select({ id: schema.families.id }).from(schema.families).where(eq(schema.families.code, code));
    if (!taken) return code;
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

  const db = await getDb();
  const exists = async () => (await db.select({ id: schema.parents.id }).from(schema.parents).where(eq(schema.parents.email, email))).length > 0;
  const taken = { error: "An account with that email already exists. Try logging in." };
  if (await exists()) return taken;
  const passwordHash = await bcrypt.hash(password, 10);
  const code = await newFamilyCode(db);
  let parentId: string;
  try {
    parentId = await db.transaction(async (tx) => {
      const [family] = await tx.insert(schema.families).values({
        name: familyName, code, timezone: timezone || "America/New_York",
      }).returning();
      const [parent] = await tx.insert(schema.parents).values({ familyId: family.id, name, email, passwordHash }).returning();
      return parent.id;
    });
  } catch (error) {
    // A simultaneous signup with the same email loses on the unique index.
    if (await exists()) return taken;
    throw error;
  }
  await createSession("parent", parentId);
  redirect("/parent");
}

export async function parentLogin(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const key = `parent:${email}`;
  if (tooManyAttempts(key)) return { error: "Too many attempts. Please wait a few minutes." };

  const db = await getDb();
  const [parent] = await db.select().from(schema.parents).where(eq(schema.parents.email, email));
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

  const db = await getDb();
  const [student] = await db.select({ id: schema.students.id, pinHash: schema.students.pinHash })
    .from(schema.students).innerJoin(schema.families, eq(schema.families.id, schema.students.familyId))
    .where(and(eq(schema.families.code, code), eq(schema.students.username, username)));
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
