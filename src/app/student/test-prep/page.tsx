import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStudent } from "@/lib/auth";
import { chapterTestsFor } from "@/lib/chapter-test";
import { MAX_TEST_LESSONS } from "@/lib/chapter-test-plan";
import { textbookFor } from "@/lib/textbook";
import { chapterLessons } from "@/lib/textbook-plan";
import { READINESS_LABELS } from "@/components/ReadinessReport";
import { TestPrepPicker } from "./TestPrepPicker";

export default async function TestPrepPage() {
  const { student } = await requireStudent();
  if (!student.aiEnabled) redirect("/student");
  const [book, tests] = await Promise.all([textbookFor(student.id), chapterTestsFor(student.id)]);
  const ready = book?.status === "ready" && book.chapters.length > 0;
  const chapters = ready ? book.chapters.map((c) => ({ title: c.title, lessons: chapterLessons(c) })) : [];
  // Start with what the class has covered in the current chapter.
  const at = ready ? book.currentChapter : null;
  const initial = at !== null && chapters[at]
    ? chapters[at].lessons.slice(0, Math.min((book!.currentLesson ?? chapters[at].lessons.length - 1) + 1, MAX_TEST_LESSONS)).map((_, j) => `${at}:${j}`)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">Test prep 🎯</h1>
        <p className="text-slate-600">Pick what your test covers. Math Buddy reviews the big ideas, drills you with test-style problems, gives tips when you&apos;re stuck, and tells you how ready you are.</p>
      </div>
      {ready ? (
        <section className="card">
          <h2 className="mb-1 text-xl font-bold">What&apos;s on your test?</h2>
          <p className="mb-3 text-sm text-slate-500">From {book!.title}. Tick whole chapters or open one to pick lessons.</p>
          <TestPrepPicker chapters={chapters} initial={initial} max={MAX_TEST_LESSONS} />
        </section>
      ) : (
        <section className="card text-slate-600">Test prep uses your math textbook. Ask a grown-up to add it on their page.</section>
      )}
      {tests.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-bold">Your test preps</h2>
          <ul className="space-y-2">
            {tests.map((t) => (
              <li key={t.id}>
                <Link href={`/student/test-prep/${t.id}`} className="card flex items-center justify-between gap-3 py-3 transition hover:-translate-y-0.5">
                  <span>
                    <span className="block font-semibold">{t.title}</span>
                    <span className="text-xs text-slate-500">{t.createdAt.toLocaleDateString()}</span>
                  </span>
                  <span className="shrink-0 text-sm font-bold">
                    {t.result ? `${READINESS_LABELS[t.result.level].emoji} ${Math.round(t.result.score * 100)}%`
                      : t.status === "pending" ? "✏️ Writing…" : t.status === "failed" ? "Didn't work" : "▶ Keep going"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Link href="/student/quiz" className="card flex items-center gap-3 transition hover:-translate-y-0.5">
        <span className="text-3xl">📝</span>
        <span><span className="block font-bold">Have a study guide?</span><span className="text-sm text-slate-500">Snap it in Quiz prep, and practice goes into your daily drills until quiz day.</span></span>
      </Link>
    </div>
  );
}
