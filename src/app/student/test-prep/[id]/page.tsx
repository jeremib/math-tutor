import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStudent } from "@/lib/auth";
import { loadChapterTest, testProblemView } from "@/lib/chapter-test";
import { RefreshWhilePending } from "@/components/TestPrep";
import { ReadinessReport } from "@/components/ReadinessReport";
import { StartTestPrepButton } from "@/components/StartTestPrep";
import { TestPrepRunner } from "./TestPrepRunner";

export default async function TestPrepSession({ params }: { params: Promise<{ id: string }> }) {
  const { student } = await requireStudent();
  if (!student.aiEnabled) redirect("/student");
  const loaded = await loadChapterTest(student.id, (await params).id);
  if (!loaded) notFound();
  const { test, problems } = loaded;

  return (
    <div className="space-y-5">
      <Link href="/student/test-prep" className="text-sm font-semibold text-brand-600">← Test prep</Link>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">🎯 Test prep</p>
        <h1 className="mt-1 text-2xl font-extrabold">{test.title}</h1>
      </div>
      {test.status === "pending" ? (
        <div className="card flex items-center gap-4" role="status">
          <span className="animate-bounce text-4xl">✏️</span>
          <div>
            <p className="font-bold">Math Buddy is writing your test prep…</p>
            <p className="text-sm text-slate-500">Picking the big ideas, writing problems and double-checking every answer. This takes a minute or two.</p>
          </div>
          <RefreshWhilePending pending />
        </div>
      ) : test.status === "failed" ? (
        <div className="card space-y-3">
          <p className="text-slate-700">Math Buddy couldn&apos;t write this test prep. Please try again.</p>
          <StartTestPrepButton lessons={test.lessons} label="Try again" />
        </div>
      ) : test.result ? (
        <ReadinessReport concepts={test.concepts} result={test.result} lessons={test.lessons} />
      ) : (
        <TestPrepRunner testId={test.id} concepts={test.concepts} initialProblems={problems.map(testProblemView)} lessons={test.lessons} />
      )}
    </div>
  );
}
