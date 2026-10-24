import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { getDb, schema } from "@/db";

const COOKIE = "mt_session";
const PARENT_DAYS = 30;
const STUDENT_DAYS = 14;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(kind: "parent" | "student", subjectId: string) {
  const db = await getDb();
  const token = randomBytes(32).toString("base64url");
  const days = kind === "parent" ? PARENT_DAYS : STUDENT_DAYS;
  const expiresAt = new Date(Date.now() + days * 86400_000);
  await db.insert(schema.sessions).values({ id: hash(token), kind, subjectId, expiresAt });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const db = await getDb();
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.id, hash(token)));
  jar.delete(COOKIE);
}

// Cached per request so layouts and pages share one lookup.
const currentSession = cache(async () => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const [session] = await db.select().from(schema.sessions)
    .where(and(eq(schema.sessions.id, hash(token)), gt(schema.sessions.expiresAt, new Date())));
  return session ?? null;
});

export const getParent = cache(async () => {
  const s = await currentSession();
  if (s?.kind !== "parent") return null;
  const db = await getDb();
  const [row] = await db.select({ parent: schema.parents, family: schema.families })
    .from(schema.parents).innerJoin(schema.families, eq(schema.families.id, schema.parents.familyId))
    .where(eq(schema.parents.id, s.subjectId));
  return row ?? null;
});

export const getStudent = cache(async () => {
  const s = await currentSession();
  if (s?.kind !== "student") return null;
  const db = await getDb();
  const [row] = await db.select({ student: schema.students, family: schema.families })
    .from(schema.students).innerJoin(schema.families, eq(schema.families.id, schema.students.familyId))
    .where(eq(schema.students.id, s.subjectId));
  return row ?? null;
});

export async function requireParent() {
  const p = await getParent();
  if (!p) redirect("/login");
  return p;
}

export async function requireStudent() {
  const s = await getStudent();
  if (!s) redirect("/student-login");
  return s;
}

/** Loads a student only if they belong to the parent's family. */
export async function familyStudent(familyId: string, studentId: string) {
  const db = await getDb();
  const [student] = await db.select().from(schema.students)
    .where(and(eq(schema.students.id, studentId), eq(schema.students.familyId, familyId)));
  return student ?? null;
}
