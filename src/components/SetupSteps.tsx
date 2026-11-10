/** The steps of setting up a new student, with the current one highlighted. */
export const SETUP_STEPS = ["About them", "Textbook", "Starting lesson", "Daily plan", "Ready"] as const;

export function SetupSteps({ at }: { at: number }) {
  return (
    <ol className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold" aria-label="Setup steps">
      {SETUP_STEPS.map((label, i) => (
        <li key={label} aria-current={i === at ? "step" : undefined}
          className={`flex items-center gap-1.5 ${i === at ? "text-brand-700" : i < at ? "text-emerald-700" : "text-slate-400"}`}>
          <span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${i === at ? "bg-brand-600 text-white" : i < at ? "bg-emerald-100" : "bg-slate-100"}`}>
            {i < at ? "✓" : i + 1}
          </span>
          {label}
        </li>
      ))}
    </ol>
  );
}
