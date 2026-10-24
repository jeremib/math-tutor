import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { familyStudent, requireParent } from "@/lib/auth";
import { sessionMessages } from "@/lib/tutor";
import { ChatLog } from "@/components/ChatLog";

export default async function HomeworkTranscript({ params }: { params: Promise<{ id: string; sessionId: string }> }) {
  const { id, sessionId } = await params;
  const { family } = await requireParent();
  const student = familyStudent(family.id, id);
  if (!student) notFound();
  const session = db.select().from(schema.homeworkSessions)
    .where(and(eq(schema.homeworkSessions.id, sessionId), eq(schema.homeworkSessions.studentId, student.id))).get();
  if (!session) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={`/parent/students/${student.id}`} className="text-sm font-semibold text-brand-600">← {student.name}</Link>
      <h1 className="text-2xl font-extrabold">{session.title}</h1>
      <p className="text-sm text-slate-500">
        {session.createdAt.toLocaleString()} · {session.status === "solved" ? "Solved by " + student.name : "In progress"}
      </p>
      {session.imagePath && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/uploads/${session.imagePath}`} alt="Homework problem" className="max-h-96 rounded-xl ring-1 ring-slate-200" />
      )}
      <ChatLog messages={sessionMessages(session.id).map((m) => ({ id: m.id, role: m.role, content: m.content }))} studentName={student.name} />
    </div>
  );
}
