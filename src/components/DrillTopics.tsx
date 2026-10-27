type Topic = { name: string; count?: number; fromBook: boolean };

/** What a drill practices, as small chips: textbook lessons, skills and other practice. */
export function DrillTopics({ topics, heading, limit = Infinity }: { topics: Topic[]; heading?: string; limit?: number }) {
  if (!topics.length) return null;
  return (
    <div>
      {heading && <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">{heading}</div>}
      <ul className="flex flex-wrap gap-1.5">
        {topics.slice(0, limit).map((t) => (
          <li key={t.name} title={t.name}
            className={`max-w-full truncate rounded-full px-2.5 py-0.5 text-xs font-semibold ${t.fromBook ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-600"}`}>
            {t.fromBook ? "📖 " : ""}{t.name}{t.count && t.count > 1 ? ` ×${t.count}` : ""}
          </li>
        ))}
        {topics.length > limit && <li className="px-1 text-xs font-semibold text-slate-400">+{topics.length - limit} more</li>}
      </ul>
    </div>
  );
}
