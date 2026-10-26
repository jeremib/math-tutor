import Link from "next/link";
import { logout } from "@/app/actions/auth";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-xl font-extrabold text-brand-700">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white">÷</span>
      Math Buddy
    </Link>
  );
}

export function AppHeader({ who, links, extra }: { who: string; links: { href: string; label: string }[]; extra?: React.ReactNode }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Logo />
        <nav className="flex flex-wrap items-center gap-1 text-sm font-semibold">
          {extra}
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100">{l.label}</Link>
          ))}
          <span className="hidden px-2 text-slate-400 sm:inline">{who}</span>
          <form action={logout}>
            <button className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100">Log out</button>
          </form>
        </nav>
      </div>
    </header>
  );
}

export function MasteryBar({ value, mastered }: { value: number; mastered: boolean }) {
  const pct = Math.round(value * 100);
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100" title={`${pct}% mastery`}>
      <div className={`h-full rounded-full ${mastered ? "bg-emerald-500" : "bg-brand-500"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 text-center">
      <div className="text-2xl font-extrabold text-slate-800">{value}</div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

export function XpBar({ into, size }: { into: number; size: number }) {
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={into} aria-valuemax={size}>
      <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${Math.round((100 * into) / size)}%` }} />
    </div>
  );
}
