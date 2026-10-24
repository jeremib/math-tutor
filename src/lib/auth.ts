import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";

const COOKIE = "mt_session";
const PARENT_DAYS = 30;
const STUDENT_DAYS = 14;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(kind: "parent" | "student", subjectId: string) {
  const token = randomBytes(32).toString("base64url");
  const days = kind === "parent" ? PARENT_DAYS : STUDENT_DAYS;
  const expiresAt = new Date(Date.now() + days * 86400_000);
  db.insert(schema.sessions).values({ id: hash(token), kind, subjectId, expiresAt }).run();
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) db.delete(schema.sessions).where(eq(schema.sessions.id, hash(token))).run();
  jar.delete(COOKIE);
}

async function currentSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  return db.select().from(schema.sessions)
    .where(and(eq(schema.sessions.id, hash(token)), gt(schema.sessions.expiresAt, new Date())))
    .get() ?? null;
}

export async function getParent() {
  const s = await currentSession();
  if (s?.kind !== "parent") return null;
  const parent = db.select().from(schema.parents).where(eq(schema.parents.id, s.subjectId)).get();
  if (!parent) return null;
  const family = db.select().from(schema.families).where(eq(schema.families.id, parent.familyId)).get()!;
  return { parent, family };
}

export async function getStudent() {
  const s = await currentSession();
  if (s?.kind !== "student") return null;
  const student = db.select().from(schema.students).where(eq(schema.students.id, s.subjectId)).get();
  if (!student) return null;
  const family = db.select().from(schema.families).where(eq(schema.families.id, student.familyId)).get()!;
  return { student, family };
}

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
export function familyStudent(familyId: string, studentId: string) {
  return db.select().from(schema.students)
    .where(and(eq(schema.students.id, studentId), eq(schema.students.familyId, familyId)))
    .get() ?? null;
}
