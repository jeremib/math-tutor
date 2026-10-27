import { redirect } from "next/navigation";
import { requireStudent } from "@/lib/auth";
import { localDate } from "@/lib/progress";
import { testPrepsFor } from "@/lib/testprep";
import { RefreshWhilePending, TestPrepForm } from "@/components/TestPrep";
import { TestPrepList } from "@/components/TestPrepList";

export default async function QuizPrepPage() {
  const { student, family } = await requireStudent();
  if (!student.aiEnabled) redirect("/student");
  const today = localDate(family.timezone);
  const preps = await testPrepsFor(student.id, today);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">Quiz prep 📝</h1>
        <p className="text-slate-600">Got a quiz coming up? Snap the study guide. Math Buddy writes practice problems and spreads them through your daily drills until quiz day.</p>
      </div>
      <section className="card">
        <h2 className="mb-3 text-xl font-bold">New quiz</h2>
        <TestPrepForm today={today} />
      </section>
      {preps.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-bold">Your quizzes</h2>
          <TestPrepList preps={preps} />
        </section>
      )}
      <RefreshWhilePending pending={preps.some((p) => p.status === "pending")} />
    </div>
  );
}
