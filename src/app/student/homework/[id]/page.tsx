import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStudent } from "@/lib/auth";
import { sessionMessages } from "@/lib/tutor";
import { HomeworkChat } from "./HomeworkChat";

export default async function HomeworkSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { student } = await requireStudent();
  if (!student.aiEnabled) redirect("/student");
  const db = await getDb();
  const [session] = await db.select().from(schema.homeworkSessions)
    .where(and(eq(schema.homeworkSessions.id, id), eq(schema.homeworkSessions.studentId, student.id)));
  if (!session) notFound();

  return (
    <div className="space-y-4">
      <Link href="/student/homework" className="text-sm font-semibold text-brand-600">← Homework help</Link>
      {session.imagePath && (
        <div className="space-y-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/uploads/${session.imagePath}`} alt="Your homework problem" className="max-h-72 rounded-xl ring-1 ring-slate-200" />
          <Link href={`/student/homework?photo=${session.id}`} className="text-sm font-semibold text-brand-600">📷 Start another problem from this photo</Link>
        </div>
      )}
      <HomeworkChat
        sessionId={session.id}
        studentName={student.name}
        initialSolved={session.status === "solved"}
        hasPhoto={!!session.imagePath}
        initialMessages={(await sessionMessages(session.id)).map((m) => ({ id: m.id, role: m.role, content: m.content, imageUrl: m.imagePath ? `/api/uploads/${m.imagePath}` : null }))}
      />
    </div>
  );
}
