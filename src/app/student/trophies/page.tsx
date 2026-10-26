import { requireStudent } from "@/lib/auth";
import { gameProfile } from "@/lib/achievements";
import { AVATARS, BADGES, levelTitle } from "@/lib/gamification";
import { XpBar } from "@/components/ui";
import { chooseAvatar } from "../actions";

export default async function TrophiesPage() {
  const { student, family } = await requireStudent();
  const game = await gameProfile(student, family.timezone);
  const earned = new Map(game.badges.map((b) => [b.id, b]));

  return (
    <div className="space-y-6">
      <section className="card text-center">
        <div className="text-6xl">{student.avatar}</div>
        <h1 className="mt-2 text-3xl font-extrabold">Level {game.level}</h1>
        <div className="font-semibold text-slate-500">{levelTitle(game.level)} · {game.xp} XP total · {game.xpThisWeek} XP this week</div>
        <div className="mx-auto mt-3 max-w-md"><XpBar into={game.intoLevel} size={game.levelSize} /></div>
        <div className="mt-1 text-sm text-slate-500">{game.toNext} XP to level {game.level + 1}</div>
      </section>

      <section className="card">
        <h2 className="mb-1 text-xl font-bold">Badges</h2>
        <p className="mb-4 text-sm text-slate-500">{game.badges.length} of {BADGES.length} earned</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {BADGES.map((b) => {
            const got = earned.get(b.id);
            return (
              <div key={b.id} className={`rounded-2xl p-3 text-center ring-1 ${got ? "bg-amber-50 ring-amber-200" : "bg-slate-50 ring-slate-200"}`}>
                <div className={`text-4xl ${got ? "" : "opacity-30 grayscale"}`}>{got ? b.emoji : "🔒"}</div>
                <div className={`mt-1 font-bold ${got ? "" : "text-slate-400"}`}>{b.name}</div>
                <div className="text-xs text-slate-500">{b.description}</div>
                {got && <div className="mt-1 text-xs font-semibold text-amber-700">{got.earnedAt.toLocaleDateString()}</div>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h2 className="mb-1 text-xl font-bold">Avatars</h2>
        <p className="mb-4 text-sm text-slate-500">Level up to unlock more.</p>
        <div className="flex flex-wrap gap-2">
          {AVATARS.map((a) => {
            const unlocked = a.level <= game.level;
            const current = a.emoji === student.avatar;
            return unlocked ? (
              <form key={a.emoji} action={chooseAvatar}>
                <input type="hidden" name="avatar" value={a.emoji} />
                <button aria-label={`Choose ${a.emoji}`} aria-pressed={current} className={`grid h-14 w-14 place-items-center rounded-2xl text-3xl ring-1 transition hover:scale-110 ${current ? "bg-brand-50 ring-2 ring-brand-500" : "bg-white ring-slate-200"}`}>
                  {a.emoji}
                </button>
              </form>
            ) : (
              <div key={a.emoji} title={`Unlocks at level ${a.level}`} className="relative grid h-14 w-14 place-items-center rounded-2xl bg-slate-50 text-3xl ring-1 ring-slate-200">
                <span className="opacity-20 grayscale">{a.emoji}</span>
                <span className="absolute bottom-0.5 text-[10px] font-bold text-slate-500">Lv {a.level}</span>
              </div>
            );
          })}
        </div>
      </section>

      {game.rewards.length > 0 && (
        <section className="card">
          <h2 className="mb-3 text-xl font-bold">🎁 Rewards</h2>
          <ul className="space-y-3">
            {game.rewards.map((r) => (
              <li key={r.id}>
                <div className="flex justify-between gap-2 font-semibold">
                  <span>{r.title}</span>
                  <span className={r.givenAt ? "text-slate-400" : r.unlocked ? "text-emerald-600" : "text-slate-500"}>
                    {r.givenAt ? "Claimed ✓" : r.unlocked ? "Unlocked! 🎉" : `${r.xpTarget - game.xp} XP to go`}
                  </span>
                </div>
                {!r.unlocked && <div className="mt-1"><XpBar into={game.xp} size={r.xpTarget} /></div>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
