const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

export function WeekTracker({ week }: { week: { date: string; done: boolean; isToday: boolean; future: boolean }[] }) {
  return (
    <div className="grid grid-cols-7 gap-2">
      {week.map((d, i) => (
        <div key={d.date} className="text-center">
          <div className={`mx-auto grid h-10 w-10 place-items-center rounded-full text-lg font-bold sm:h-12 sm:w-12 ${
            d.done ? "bg-emerald-500 text-white" : d.isToday ? "bg-white text-brand-600 ring-2 ring-brand-500" : d.future ? "bg-slate-50 text-slate-300" : "bg-slate-100 text-slate-400"
          }`}>
            {d.done ? "✓" : DAY_LABELS[i]}
          </div>
          <div className={`mt-1 text-xs font-semibold ${d.isToday ? "text-brand-600" : "text-slate-400"}`}>{d.isToday ? "Today" : DAY_LABELS[i]}</div>
        </div>
      ))}
    </div>
  );
}
