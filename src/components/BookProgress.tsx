import { SKILLS_BY_ID } from "@/lib/curriculum";
import type { textbookProgress } from "@/lib/textbook";
import { MasteryBar } from "@/components/ui";

type Progress = NonNullable<Awaited<ReturnType<typeof textbookProgress>>>;

/** Progress through a textbook: the current chapter's lessons and skills, then every chapter at a glance. */
export function BookProgress({ progress, forStudent }: { progress: Progress; forStudent?: boolean }) {
  const { book, chapters } = progress;
  const current = book.currentChapter !== null ? chapters[book.currentChapter] : undefined;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  // The current chapter and what comes after it first; earlier chapters below, most recent first.
  const at = book.currentChapter ?? -1;
  const indexed = chapters.map((c, i) => ({ c, i }));
  const groups = at < 0 ? [{ label: "Chapters", chapters: indexed }] : [
    { label: "Now and next", chapters: indexed.slice(at) },
    { label: "Earlier chapters", chapters: indexed.slice(0, at).reverse() },
  ];
  const items = current ? [
    ...current.lessons.map((l) => ({ id: l.skillId, name: l.title, progress: l.progress })),
    ...current.skills.map((s) => ({ id: s.skillId, name: SKILLS_BY_ID.get(s.skillId)?.name ?? s.skillId, progress: s.progress })),
  ] : [];

  return (
    <div className="space-y-5">
      {current ? (
        <div className="rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-100">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-bold">{current.title}</h3>
            <span className="text-sm font-semibold text-brand-700">{pct(current.percent)}</span>
          </div>
          <ul className="mt-3 space-y-2.5">
            {items.map((i) => (
              <li key={i.id}>
                <div className="mb-1 flex justify-between gap-3 text-sm">
                  <span className="font-semibold">{i.name} {i.progress?.mastered ? "⭐" : ""}</span>
                  <span className="shrink-0 text-slate-500">
                    {!i.progress?.attempts ? (forStudent ? "Coming up" : "Not started") : i.progress.mastered ? "Mastered" : pct(i.progress.mastery)}
                  </span>
                </div>
                <MasteryBar value={i.progress?.mastered ? 1 : i.progress?.mastery ?? 0} mastered={!!i.progress?.mastered} />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          {forStudent ? "Your grown-up will pick the chapter your class is on." : "Pick the chapter the class is on to start following the book."}
        </p>
      )}
      {groups.map((g) => g.chapters.length > 0 && (
        <div key={g.label}>
          <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">{g.label}</h4>
          <ol className="space-y-2">
            {g.chapters.map(({ c, i }) => (
              <li key={i} className="grid grid-cols-[1fr_6rem] items-center gap-3 text-sm">
                <span className={`truncate ${i === book.currentChapter ? "font-bold" : c.done ? "text-slate-500" : ""}`}>
                  {c.done ? "✅ " : i === book.currentChapter ? "👉 " : ""}{c.title}
                </span>
                {c.started || c.done ? <MasteryBar value={c.percent} mastered={c.done} /> : <span className="text-right text-xs text-slate-400">Not started</span>}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
