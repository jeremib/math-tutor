import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStudent } from "@/lib/auth";
import { bookLesson, savedGuide } from "@/lib/lesson-guide";
import { LessonGuideView } from "./LessonGuideView";
import { WriteGuide } from "./WriteGuide";

export default async function LearnPage({ params }: { params: Promise<{ chapter: string; lesson: string }> }) {
  const { chapter, lesson: lessonParam } = await params;
  const c = Number(chapter), l = Number(lessonParam);
  if (!Number.isInteger(c) || !Number.isInteger(l) || c < 0 || l < 0) notFound();
  const { student } = await requireStudent();
  const lesson = await bookLesson(student.id, c, l);
  if (!lesson) notFound();
  const guide = await savedGuide(lesson.skillId);
  const classIsHere = lesson.book.currentChapter === c && (lesson.book.currentLesson ?? 0) === l && lesson.lessons.length > 1;
  const href = (j: number) => `/student/learn/${c}/${j}`;

  return (
    <div className="space-y-5">
      <Link href="/student" className="text-sm font-semibold text-brand-600">← Home</Link>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">📖 {lesson.chapter.title}</p>
        <h1 className="mt-1 text-2xl font-extrabold">{lesson.title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {lesson.lessons.length > 1 && `Lesson ${l + 1} of ${lesson.lessons.length}`}{classIsHere && " · 👉 Your class is here"}
        </p>
      </div>
      {guide ? <LessonGuideView guide={guide} />
        : student.aiEnabled ? <WriteGuide chapter={c} lesson={l} />
        : <p className="card text-slate-600">Ask a grown-up to turn on the AI tutor to read lessons here.</p>}
      <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 text-sm font-semibold">
        {l > 0 ? <Link href={href(l - 1)} className="text-brand-600">← {lesson.lessons[l - 1]}</Link> : <span />}
        {l + 1 < lesson.lessons.length ? <Link href={href(l + 1)} className="text-right text-brand-600">{lesson.lessons[l + 1]} →</Link> : <Link href="/student/drill" className="text-brand-600">Practice in today&apos;s drill →</Link>}
      </nav>
    </div>
  );
}
