import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStudent } from "@/lib/auth";
import { NewHomework } from "./NewHomework";

/** Photos from earlier sessions a student can reuse, newest first, one per photo. */
const MAX_PHOTOS = 6;

export default async function HomeworkPage({ searchParams }: { searchParams: Promise<{ photo?: string }> }) {
  const { photo } = await searchParams;
  const { student } = await requireStudent();
  if (!student.aiEnabled) redirect("/student");
  const db = await getDb();
  const sessions = await db.select().from(schema.homeworkSessions).where(eq(schema.homeworkSessions.studentId, student.id))
    .orderBy(desc(schema.homeworkSessions.updatedAt)).limit(20);
  const photoRows = await db.select({ id: schema.homeworkSessions.id, imagePath: schema.homeworkSessions.imagePath, title: schema.homeworkSessions.title })
    .from(schema.homeworkSessions)
    .where(and(eq(schema.homeworkSessions.studentId, student.id), isNotNull(schema.homeworkSessions.imagePath)))
    .orderBy(desc(schema.homeworkSessions.createdAt)).limit(50);
  const seen = new Set<string>();
  const photos = photoRows.filter((r) => !seen.has(r.imagePath!) && seen.add(r.imagePath!))
    .slice(0, MAX_PHOTOS).map((r) => ({ sessionId: r.id, url: `/api/uploads/${r.imagePath}`, title: r.title }));
  // A photo picked from a session page may be older than the ones listed.
  if (photo && !photos.some((p) => p.sessionId === photo)) {
    const picked = photoRows.find((r) => r.id === photo);
    if (picked) photos.unshift({ sessionId: picked.id, url: `/api/uploads/${picked.imagePath}`, title: picked.title });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">Homework help 🧭</h1>
        <p className="text-slate-600">I won&apos;t just tell you the answer, but I&apos;ll help you figure it out step by step.</p>
      </div>
      <NewHomework photos={photos} initialPhoto={photos.some((p) => p.sessionId === photo) ? photo : undefined} />
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
