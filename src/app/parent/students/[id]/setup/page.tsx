import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { familyStudent, requireParent } from "@/lib/auth";
import { GRADE_LABELS } from "@/lib/curriculum";
import { textbookFor } from "@/lib/textbook";
import { chapterLessons, needsChapterPractice } from "@/lib/textbook-plan";
import { headerOrigin, qrSvg } from "@/lib/handoff";
import { ActionForm } from "@/components/ActionForm";
import { LoginLink } from "@/components/LoginLink";
import { PendingButton } from "@/components/PendingButton";
import { SetupSteps } from "@/components/SetupSteps";
import { TextbookForm } from "@/components/TextbookForm";
import { RefreshWhilePending } from "@/components/TestPrep";
import { saveSetupPlan } from "../../../actions";
import { removeTextbook, startChapter } from "../textbook/actions";

const STEPS = { book: 1, lesson: 2, plan: 3, done: 4 } as const;
type Step = keyof typeof STEPS;

/** A drill size that fits the grade: shorter for little kids. */
const suggestedProblems = (grade: number) => (grade <= 2 ? 5 : grade <= 5 ? 8 : 10);

/** Setting up a new student, one step at a time: textbook, starting lesson, daily plan, then how to log in. */
export default async function SetupPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const [{ id }, { step: rawStep }] = await Promise.all([params, searchParams]);
  const { family } = await requireParent();
  const student = await familyStudent(family.id, id);
  if (!student) notFound();
  const step: Step = rawStep && rawStep in STEPS ? (rawStep as Step) : "book";
  const book = await textbookFor(student.id);
  const href = (s: Step) => `/parent/students/${student.id}/setup?step=${s}`;
  const name = student.name;

  const shell = (body: React.ReactNode) => (
    <div className="mx-auto max-w-2xl space-y-5">
      {step !== "done" && <Link href={`/parent/students/${student.id}`} className="text-sm font-semibold text-brand-600">Skip setup, go to {name}&apos;s page</Link>}
      <h1 className="flex items-center gap-3 text-3xl font-extrabold"><span className="text-4xl">{student.avatar}</span> Setting up {name}</h1>
      <SetupSteps at={STEPS[step]} />
      {body}
    </div>
  );
  const skip = (to: Step, label: string) => (
    <Link href={href(to)} className="text-sm font-semibold text-slate-500 hover:underline">{label}</Link>
  );

  if (step === "book") {
    if (!student.aiEnabled && !book) {
      return shell(
        <section className="card space-y-3">
          <h2 className="text-xl font-bold">📖 Their math textbook</h2>
          <p className="text-slate-600">Matching drills to a textbook uses the AI tutor, which is off for {name}. You can turn it on in the daily plan step.</p>
          <Link href={href("plan")} className="btn">Next: daily plan →</Link>
        </section>,
      );
    }
    if (!book) {
      return shell(
        <section className="card space-y-4">
          <h2 className="text-xl font-bold">📖 Which math book does {name} use at school?</h2>
          <p className="text-slate-600">
            Math Buddy finds the book&apos;s chapters and lessons, so daily drills practice what the class is learning, and {name} can read a short lesson before each one.
            The title is usually on the cover or the school&apos;s supply list. A photo of the cover helps find the right edition.
          </p>
          <TextbookForm studentId={student.id} mode="book" submit="Find the chapters" />
          <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 pt-3">
            {skip("plan", "No textbook, or not sure yet? Skip this step")}
          </div>
          <p className="text-xs text-slate-500">Without a book, drills follow Math Buddy&apos;s own {GRADE_LABELS[student.grade]} skill path. You can add the book later from {name}&apos;s page.</p>
        </section>,
      );
    }
    if (book.status === "pending") {
      return shell(
        <section className="card space-y-3">
          <RefreshWhilePending pending />
          <h2 className="text-xl font-bold">📖 {book.title || "Your textbook"}</h2>
          <p className="animate-pulse text-slate-600">
            {book.images.some((i) => i.kind === "toc") ? "Reading the table of contents…" : "Looking up the book's chapters…"} This takes about a minute.
          </p>
          <p className="text-sm text-slate-500">This page updates by itself. You can also set up the daily plan now and pick the lesson later from the textbook page.</p>
          {skip("plan", "Keep going while it looks →")}
        </section>,
      );
    }
    if (book.status !== "ready") {
      return shell(
        <section className="card space-y-3">
          <h2 className="text-xl font-bold">
            {book.status === "needs_toc" ? `Couldn't find ${book.title || "this book"}'s chapters online` : "Couldn't read the chapters from those photos"}
          </h2>
          <p className="text-slate-600">
            Take clear, straight-on photos of the table of contents pages, in order, and Math Buddy will read the chapters from them.
          </p>
          <TextbookForm studentId={student.id} mode="toc" submit="Read the table of contents" />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 pt-3">
            <form action={removeTextbook}>
              <input type="hidden" name="studentId" value={student.id} />
              <button className="text-sm font-semibold text-slate-500 hover:underline">Try a different book</button>
            </form>
            {skip("plan", "Skip for now")}
          </div>
        </section>,
      );
    }
    const lessons = book.chapters.reduce((n, c) => n + c.lessons.length, 0);
    return shell(
      <section className="card space-y-3">
        <h2 className="text-xl font-bold">📖 Found {book.title || "the book"}</h2>
        <p className="text-slate-600">
          {book.chapters.length} chapters{lessons ? ` and ${lessons} lessons` : ""}. Next, pick where {name}&apos;s class is right now.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <Link href={href("lesson")} className="btn">Next: starting lesson →</Link>
          <form action={removeTextbook}>
            <input type="hidden" name="studentId" value={student.id} />
            <button className="text-sm font-semibold text-slate-500 hover:underline">Wrong book? Start over</button>
          </form>
        </div>
      </section>,
    );
  }

  if (step === "lesson") {
    if (book?.status !== "ready") redirect(href(book ? "book" : "plan"));
    const current = book.currentChapter;
    return shell(
      <section className="card space-y-4">
        <h2 className="text-xl font-bold">👉 Where is {name}&apos;s class right now?</h2>
        <p className="text-slate-600">
          Pick the lesson they&apos;re on. Check their latest homework or ask them. Drills practice this lesson plus a few problems reviewing earlier ones,
          and you move them ahead as the class goes. Starting a little behind is fine: it builds confidence.
        </p>
        <ol className="space-y-2">
          {book.chapters.map((c, i) => {
            const lessons = needsChapterPractice(c) ? chapterLessons(c) : [];
            const here = i === current;
            return (
              <li key={i}>
                <details open={here || (current === null && i === 0)} className={`rounded-xl p-3 ring-1 ${here ? "ring-2 ring-brand-500" : "ring-slate-200"}`}>
                  <summary className="cursor-pointer font-bold">{c.title}{here && <span className="ml-2 text-sm font-semibold text-brand-700">· picked</span>}</summary>
                  <div className="mt-2 space-y-1">
                    {lessons.length > 1 ? lessons.map((l, j) => (
                      <StartForm key={j} studentId={student.id} chapter={i} lesson={j} label={l}
                        picked={here && (book.currentLesson ?? 0) === j} />
                    )) : (
                      <>
                        {c.lessons.length > 0 && <p className="text-sm text-slate-500">{c.lessons.join(" · ")}</p>}
                        <StartForm studentId={student.id} chapter={i} label="Start this chapter" picked={here} />
                      </>
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 pt-3">
          {current !== null && <Link href={href("plan")} className="btn">Keep {book.chapters[current].title} →</Link>}
          {current === null && skip("plan", "Not sure? Skip and pick it later")}
        </div>
      </section>,
    );
  }

  if (step === "plan") {
    const suggested = suggestedProblems(student.grade);
    const sizes = [...new Set([Math.max(3, suggested - 3), suggested, suggested + 4])];
    return shell(
      <section className="card space-y-4">
        <h2 className="text-xl font-bold">📅 {name}&apos;s daily plan</h2>
        <p className="text-slate-600">Short and steady works best. A small drill most days beats a big one once a week. You can change all of this later.</p>
        <ActionForm action={saveSetupPlan} submit="Next: how to log in →">
          <input type="hidden" name="studentId" value={student.id} />
          <fieldset>
            <legend className="label">Problems in each daily drill</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {sizes.map((n) => (
                <Choice key={n} name="dailyProblems" value={n} checked={n === suggested}
                  title={`${n} problems`} note={`About ${Math.round(n * 1.25)} minutes${n === suggested ? " · suggested" : ""}`} />
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="label">Days a week to aim for</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              <Choice name="weeklyGoal" value={3} checked={false} title="3 days" note="A gentle start" />
              <Choice name="weeklyGoal" value={5} checked title="5 days" note="School days · suggested" />
              <Choice name="weeklyGoal" value={7} checked={false} title="Every day" note="For the keen ones" />
            </div>
          </fieldset>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="aiEnabled" defaultChecked={student.aiEnabled} className="mt-1 h-4 w-4" />
            <span>
              <span className="font-semibold">Allow the AI tutor</span>
              <span className="block text-sm text-slate-500">
                Homework help that coaches without giving answers, short lessons, mistake explanations and test prep. You can read every chat. Needed for the textbook.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="voiceEnabled" defaultChecked={student.voiceEnabled} className="mt-1 h-4 w-4" />
            <span>
              <span className="font-semibold">Read aloud and listen</span>
              <span className="block text-sm text-slate-500">Reads problems aloud and lets {name} say answers. Turned on for early readers.</span>
            </span>
          </label>
          <fieldset className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-100">
            <legend className="sr-only">First reward</legend>
            <h3 className="font-bold">🎁 Something to work toward (optional)</h3>
            <p className="mb-3 text-sm text-slate-600">{name} earns XP for every drill. Kids try harder when they can see a reward getting closer.</p>
            <div className="grid gap-2 sm:grid-cols-[1fr_15rem]">
              <div>
                <label className="label" htmlFor="rewardTitle">Reward</label>
                <input id="rewardTitle" name="rewardTitle" maxLength={80} className="input" placeholder="Pick Friday's movie" />
              </div>
              <div>
                <label className="label" htmlFor="rewardXp">Unlocks after</label>
                <select id="rewardXp" name="rewardXp" defaultValue="500" className="input">
                  <option value="500">500 XP · about a week</option>
                  <option value="1000">1,000 XP · about 2 weeks</option>
                  <option value="2000">2,000 XP · about a month</option>
                </select>
              </div>
            </div>
          </fieldset>
        </ActionForm>
      </section>,
    );
  }

  const path = `/student-login?${new URLSearchParams({ code: family.code, u: student.username })}`;
  const qr = await qrSvg(headerOrigin(await headers()) + path);
  const chapter = book?.status === "ready" && book.currentChapter !== null ? book.chapters[book.currentChapter] : null;
  const lesson = chapter ? (needsChapterPractice(chapter) ? chapterLessons(chapter)[book!.currentLesson ?? 0] : null) ?? chapter.title : null;
  return shell(
    <>
      <section className="card space-y-4">
        <h2 className="text-xl font-bold">🎉 {name} is ready</h2>
        <div className="flex flex-wrap items-start gap-5">
          <div className="h-36 w-36 shrink-0 rounded-lg bg-white p-1 ring-1 ring-slate-200 [&>svg]:h-full [&>svg]:w-full" role="img"
            aria-label={`QR code for ${name}'s login link`} dangerouslySetInnerHTML={{ __html: qr }} />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-slate-600">
              Scan this with {name}&apos;s tablet or phone camera, or open the link below on their computer. It fills in the family code and username, so they only type their PIN.
              Then bookmark it or add it to the home screen.
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 text-sm">
              <dt className="text-slate-500">Family code</dt><dd className="font-mono font-bold">{family.code}</dd>
              <dt className="text-slate-500">Username</dt><dd className="font-mono font-bold">{student.username}</dd>
              <dt className="text-slate-500">PIN</dt><dd>The one you just chose</dd>
            </dl>
          </div>
        </div>
        <LoginLink code={family.code} username={student.username} />
      </section>
      <section className="card space-y-2">
        <h2 className="text-lg font-bold">Their first day</h2>
        <ul className="list-disc space-y-1 pl-5 text-slate-600">
          {chapter && student.aiEnabled && <li>Tap <b>Learn the lesson</b> to read a short lesson on <b>{lesson}</b> with pictures and worked examples.</li>}
          <li>Do <b>today&apos;s drill</b>: {student.dailyProblems} problems. Hints explain why they work, and missed problems get a mistake coach.</li>
          {student.aiEnabled && <li>Stuck on homework? <b>Homework help</b> takes a photo of the worksheet and coaches one step at a time.</li>}
          <li>Check back here to see their progress, read their tutor chats, and move them to the next lesson as the class goes.</li>
        </ul>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href={`/parent/students/${student.id}`} className="btn">Go to {name}&apos;s page</Link>
          <Link href="/parent/students/new" className="btn-secondary">Add another student</Link>
        </div>
      </section>
    </>,
  );
}

function StartForm({ studentId, chapter, lesson, label, picked }: { studentId: string; chapter: number; lesson?: number; label: string; picked: boolean }) {
  return (
    <form action={startChapter} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1 hover:bg-slate-50">
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="chapter" value={chapter} />
      {lesson !== undefined && <input type="hidden" name="lesson" value={lesson} />}
      <input type="hidden" name="then" value="setup" />
      <span className={`text-sm ${picked ? "font-semibold text-brand-700" : "text-slate-700"}`}>{picked ? "👉 " : ""}{lesson !== undefined ? label : ""}</span>
      <PendingButton className="btn-secondary shrink-0 py-1 text-sm" pendingText="Starting…">{lesson !== undefined ? "Start here" : label}</PendingButton>
    </form>
  );
}

function Choice({ name, value, checked, title, note }: { name: string; value: number; checked: boolean; title: string; note: string }) {
  return (
    <label className="cursor-pointer">
      <input type="radio" name={name} value={value} defaultChecked={checked} className="peer sr-only" />
      <span className="block rounded-xl p-3 ring-1 ring-slate-200 peer-checked:bg-brand-50 peer-checked:ring-2 peer-checked:ring-brand-500 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-700">
        <span className="block font-bold">{title}</span>
        <span className="block text-xs text-slate-500">{note}</span>
      </span>
    </label>
  );
}
