import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStudent } from "@/lib/auth";
import { NewHomework } from "./NewHomework";

export default async function HomeworkPage() {
  const { student } = await requireStudent();
  if (!student.homeworkEnabled) redirect("/student");
  const db = await getDb();
  const sessions = await db.select().from(schema.homeworkSessions).where(eq(schema.homeworkSessions.studentId, student.id))
    .orderBy(desc(schema.homeworkSessions.updatedAt)).limit(20);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">Homework help 🧭</h1>
        <p className="text-slate-600">I won&apos;t just tell you the answer, but I&apos;ll help you figure it out step by step.</p>
      </div>
      <NewHomework />
      {sessions.length > 0 && (
        <section className="card">
          <h2 className="mb-3 text-xl font-bold">Earlier problems</h2>
          <ul className="space-y-1">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link href={`/student/homework/${s.id}`} className="flex justify-between gap-2 rounded-lg p-2 hover:bg-slate-50">
                  <span className="truncate font-semibold">{s.title}</span>
                  <span className={s.status === "solved" ? "text-emerald-600" : "text-slate-400"}>{s.status === "solved" ? "Solved ✓" : "Keep going"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
