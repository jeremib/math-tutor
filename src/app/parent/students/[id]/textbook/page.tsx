import Link from "next/link";
import { notFound } from "next/navigation";
import { and, count, eq, isNull, like, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { TextbookChapter } from "@/db/schema";
import { familyStudent, requireParent } from "@/lib/auth";
import { GRADE_LABELS, SKILLS_BY_ID } from "@/lib/curriculum";
import { chaptersBeingWritten, textbookFor } from "@/lib/textbook";
import { needsChapterPractice, parseLessonSkill, skillChoicesFor } from "@/lib/textbook-plan";
import { TextbookForm } from "@/components/TextbookForm";
import { RefreshWhilePending } from "@/components/TestPrep";
import { PendingButton } from "@/components/PendingButton";
import { removeTextbook, setChapterSkills, startChapter, writeChapterProblems } from "./actions";

export default async function TextbookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { family } = await requireParent();
  const student = await familyStudent(family.id, id);
  if (!student) notFound();
  const book = await textbookFor(student.id);
  const db = await getDb();
  const [queued, answered] = book ? await Promise.all([
    db.select({ skillId: schema.practiceProblems.skillId, n: count() }).from(schema.practiceProblems)
      .where(and(eq(schema.practiceProblems.textbookId, book.id), isNull(schema.practiceProblems.usedAt)))
      .groupBy(schema.practiceProblems.skillId),
    db.select({
      skillId: schema.drillProblems.skillId,
      done: sql<number>`count(*) filter (where ${schema.drillProblems.solved} is not null)`.mapWith(Number),
      right: sql<number>`count(*) filter (where ${schema.drillProblems.firstTryCorrect})`.mapWith(Number),
    }).from(schema.drillProblems).where(like(schema.drillProblems.skillId, `tb:${book.id}:%`)).groupBy(schema.drillProblems.skillId),
  ]) : [[], []];
  // Written problems waiting per chapter, and results per lesson ("chapter:lesson").
  const waiting = new Map<number, number>();
  const lessonWaiting = new Map<string, number>();
  for (const q of queued) {
    const at = parseLessonSkill(q.skillId);
    if (at) {
      waiting.set(at.chapter, (waiting.get(at.chapter) ?? 0) + q.n);
      lessonWaiting.set(`${at.chapter}:${at.lesson}`, q.n);
    }
  }
  const results = new Map(answered.flatMap((a) => {
    const at = parseLessonSkill(a.skillId);
    return at && a.done ? [[`${at.chapter}:${at.lesson}`, a] as const] : [];
  }));
  const writing = book ? chaptersBeingWritten(book) : new Set<number>();

  const header = (
    <>
      <Link href={`/parent/students/${student.id}`} className="text-sm font-semibold text-brand-600">← {student.name}</Link>
      <h1 className="text-3xl font-extrabold">📖 {student.name}&apos;s textbook</h1>
    </>
  );

  if (!student.aiEnabled && !book) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {header}
        <p className="card text-slate-600">Turn on the AI tutor in {student.name}&apos;s settings to set up a textbook.</p>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {header}
        <section className="card space-y-4">
          <p className="text-slate-600">
            Tell Math Buddy which math book {student.name} uses at school. It looks up the book&apos;s chapters, matches each one to practice skills,
            and then you pick the chapter the class is on. Daily drills follow along, and Math Buddy writes extra problems for lessons the built-in skills don&apos;t cover.
          </p>
          <TextbookForm studentId={student.id} mode="book" submit="Find the chapters" />
        </section>
      </div>
    );
  }

  const removeForm = (label: string) => (
    <form action={removeTextbook}>
      <input type="hidden" name="studentId" value={student.id} />
      <button className="text-sm font-semibold text-red-600 hover:underline">{label}</button>
    </form>
  );
  const cover = book.images.find((i) => i.kind === "cover");
  const current = book.currentChapter;
  const next = current !== null && current + 1 < book.chapters.length ? current + 1 : null;
  const choices = skillChoicesFor(book.grade ?? student.grade);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {header}
      <RefreshWhilePending pending={book.status === "pending" || writing.size > 0} />

      <section className="card flex gap-4">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/uploads/${cover.path}`} alt="Book cover" className="h-28 rounded-lg ring-1 ring-slate-200" />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="text-xl font-bold">{book.title || "Your textbook"}</h2>
          <p className="text-sm text-slate-500">
            {[book.publisher, book.grade !== null ? GRADE_LABELS[book.grade] : null].filter(Boolean).join(" · ")}
          </p>
          {book.status === "ready" && (
            <p className="text-sm text-slate-500">
              {book.source === "photos" ? "Chapters read from your table-of-contents photos." : "Chapters found online"}
              {book.sources.length > 0 && <>{" from "}{book.sources.map((url, i) => (
                <span key={url}>{i > 0 && ", "}<a href={url} target="_blank" rel="noreferrer" className="font-semibold text-brand-600 hover:underline">{hostOf(url)}</a></span>
              ))}</>}
              {book.source === "web" && "."}
            </p>
          )}
          {book.note && book.status !== "pending" && <p className="text-sm text-slate-700">{book.note}</p>}
          {book.grade !== null && book.grade !== student.grade && book.status === "ready" && (
            <p className="text-sm text-amber-700">This book is for {GRADE_LABELS[book.grade]}; {student.name} is set to {GRADE_LABELS[student.grade]}.</p>
          )}
        </div>
      </section>

      {book.status === "pending" && (
        <p className="card animate-pulse text-slate-600">
          {book.images.some((i) => i.kind === "toc") ? "Reading the table of contents…" : "Looking up the book's chapters…"} This takes about a minute.
        </p>
      )}

      {(book.status === "needs_toc" || book.status === "failed") && (
        <section className="card space-y-3">
          <h2 className="text-lg font-bold">
            {book.status === "needs_toc" ? "Couldn't find this book's chapters online" : "Couldn't read the chapters from those photos"}
          </h2>
          <p className="text-slate-600">
            {book.status === "needs_toc"
              ? "Take photos of the table of contents pages and Math Buddy will read the chapters from them."
              : "Try again with clear, straight-on photos of each table of contents page, in order."}
          </p>
          <TextbookForm studentId={student.id} mode="toc" submit="Read the table of contents" />
          {removeForm("Start over with a different book")}
        </section>
      )}

      {book.status === "ready" && (
        <>
          <section className="card space-y-2">
            {current !== null ? (
              <>
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Working on now</p>
                <p className="text-lg font-bold">{book.chapters[current].title}</p>
                <p className="text-sm text-slate-600">
                  <CurrentPlan chapter={book.chapters[current]} aiEnabled={student.aiEnabled} waiting={waiting.get(current) ?? 0} writing={writing.has(current)} />
                  {" "}If today&apos;s drill has already started, changes begin tomorrow.
                </p>
                {next !== null && (
                  <form action={startChapter}>
                    <input type="hidden" name="studentId" value={student.id} />
                    <input type="hidden" name="chapter" value={next} />
                    <PendingButton className="btn mt-2" pendingText="Moving on…">Move on to {book.chapters[next].title} →</PendingButton>
                  </form>
                )}
              </>
            ) : (
              <p className="text-slate-700"><b>Pick the chapter {student.name}&apos;s class is on</b> and drills will follow it.</p>
            )}
          </section>

          <ol className="space-y-3">
            {book.chapters.map((c, i) => (
              <ChapterRow key={i} index={i} chapter={c} current={i === current} studentId={student.id} aiEnabled={student.aiEnabled}
                waiting={waiting.get(i) ?? 0} writing={writing.has(i)} results={results} lessonWaiting={lessonWaiting} choices={choices} />
            ))}
          </ol>

          <details className="card">
            <summary className="cursor-pointer font-semibold text-slate-700">Chapters look wrong? Use the table of contents instead</summary>
            <div className="mt-3 space-y-3">
              <p className="text-sm text-slate-600">Math Buddy will read the chapters from your photos and replace this list. You&apos;ll pick the current chapter again.</p>
              <TextbookForm studentId={student.id} mode="toc" submit="Read the table of contents" />
            </div>
          </details>
          {removeForm("Remove this textbook")}
        </>
      )}
    </div>
  );
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const COVERAGE = {
  full: "Drills cover this chapter",
  partial: "Drills cover part of it; Math Buddy writes problems for the other lessons",
  none: "No built-in skills match; Math Buddy writes problems for each lesson",
} as const;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** What daily drills do while this chapter is the current one. */
function CurrentPlan({ chapter, aiEnabled, waiting, writing }: { chapter: TextbookChapter; aiEnabled: boolean; waiting: number; writing: boolean }) {
  const hasSkills = chapter.skillIds.length > 0;
  if (!needsChapterPractice(chapter)) return <>Its skills make up most of each drill.</>;
  if (!aiEnabled) {
    return <>{hasSkills ? "Its skills make up most of each drill." : "Drills keep to the regular skill path."} Turn on the AI tutor to get problems written for its lessons.</>;
  }
  return (
    <>
      {hasSkills
        ? "Its skills make up most of each drill, along with problems Math Buddy writes for its other lessons."
        : "Math Buddy writes problems for each of its lessons, and they make up most of each drill."}
      {writing ? " Writing more problems now…" : waiting > 0 ? ` ${plural(waiting, "problem")} ready.` : ""}
      {" "}More are written as they&apos;re used up, a little harder or easier depending on how it&apos;s going.
    </>
  );
}

function ChapterRow({ index, chapter, current, studentId, aiEnabled, waiting, writing, results, lessonWaiting, choices }: {
  index: number; chapter: TextbookChapter; current: boolean; studentId: string; aiEnabled: boolean; waiting: number; writing: boolean;
  results: Map<string, { done: number; right: number }>; lessonWaiting: Map<string, number>; choices: ReturnType<typeof skillChoicesFor>;
}) {
  const picked = new Set(chapter.skillIds);
  // Skills already on the chapter stay pickable even if they're outside the book's grade range.
  const options = [...chapter.skillIds.map((id) => SKILLS_BY_ID.get(id)!).filter((s) => !choices.includes(s)), ...choices];
  const coverage = !aiEnabled && needsChapterPractice(chapter)
    ? (chapter.skillIds.length ? "Drills cover part of it" : "No matching drill skills")
    : COVERAGE[chapter.coverage];
  return (
    <li className={`rounded-2xl bg-white p-4 ring-1 ${current ? "ring-2 ring-brand-500" : "ring-slate-200"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-bold">{chapter.title}</h3>
          <p className="text-xs text-slate-500">
            {coverage}
            {aiEnabled && needsChapterPractice(chapter) && waiting > 0 && ` · ${plural(waiting, "problem")} ready`}
          </p>
          {aiEnabled && needsChapterPractice(chapter) && (writing ? (
            <p className="mt-2 animate-pulse text-sm font-semibold text-brand-700">✍️ Writing problems for each lesson… about a minute.</p>
          ) : (
            <form action={writeChapterProblems} className="mt-2">
              <input type="hidden" name="studentId" value={studentId} />
              <input type="hidden" name="chapter" value={index} />
              <PendingButton className="btn-secondary py-1 text-sm" pendingText="Starting…">
                ✍️ {waiting > 0 ? "Write more problems" : "Write practice problems"}
              </PendingButton>
            </form>
          ))}
        </div>
        {current ? (
          <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700">Working on now</span>
        ) : (
          <form action={startChapter}>
            <input type="hidden" name="studentId" value={studentId} />
            <input type="hidden" name="chapter" value={index} />
            <PendingButton className="btn-secondary py-1.5 text-sm" pendingText="Starting…">Work on this chapter</PendingButton>
          </form>
        )}
      </div>
      {chapter.skillIds.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chapter.skillIds.map((id) => (
            <span key={id} className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">{SKILLS_BY_ID.get(id)?.name}</span>
          ))}
        </div>
      )}
      {chapter.lessons.length > 0 && (
        <details className="mt-2 text-sm" open={current}>
          <summary className="cursor-pointer text-slate-500">{plural(chapter.lessons.length, "lesson")}</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-600">
            {chapter.lessons.map((l, j) => {
              const r = results.get(`${index}:${j}`);
              const ready = lessonWaiting.get(`${index}:${j}`);
              return (
                <li key={j}>
                  {l}
                  {(ready || r) && (
                    <span className="text-xs text-slate-400">
                      {ready ? ` · ${ready} ready` : ""}{r ? ` · ${r.done} done, ${Math.round((100 * r.right) / r.done)}% right first try` : ""}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}
      <details className="mt-1 text-sm">
        <summary className="cursor-pointer text-slate-500">Change skills</summary>
        <form action={setChapterSkills} className="mt-2 space-y-2">
          <input type="hidden" name="studentId" value={studentId} />
          <input type="hidden" name="chapter" value={index} />
          <div className="grid gap-1 rounded-xl p-3 ring-1 ring-slate-200 sm:grid-cols-2">
            {options.map((s) => (
              <label key={s.id} className="flex items-center gap-2">
                <input type="checkbox" name="skill" value={s.id} defaultChecked={picked.has(s.id)} />
                {s.name} <span className="text-xs text-slate-400">{GRADE_LABELS[s.grade]}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-slate-500">Up to 4. Leave all unchecked if none fit; lessons these don&apos;t cover get problems written for them.</p>
          <PendingButton className="btn-secondary py-1.5 text-sm" pendingText="Saving…">Save skills</PendingButton>
        </form>
      </details>
    </li>
  );
}
