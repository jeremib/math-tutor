// Pure gamification rules: XP amounts, levels, badges, avatars and weekly goals.

export const XP = {
  checkIn: 5,
  /** Extra check-in XP per consecutive day, up to CHECK_IN_MAX_BONUS. */
  checkInStreakBonus: 1,
  checkInMaxBonus: 5,
  firstTryCorrect: 10,
  secondTryCorrect: 5,
  drillComplete: 25,
  perfectDrill: 25,
  skillMastered: 50,
  homeworkSolved: 30,
  weeklyGoal: 50,
} as const;

/** Homework XP is capped per day so kids can't farm it with easy problems. */
export const HOMEWORK_XP_PER_DAY = 3;

export function checkInXp(consecutiveDays: number): number {
  return XP.checkIn + Math.min(Math.max(consecutiveDays - 1, 0) * XP.checkInStreakBonus, XP.checkInMaxBonus);
}

/** Total XP needed to reach a level: 0, 50, 150, 300, 500, 750, ... */
export function xpForLevel(level: number): number {
  return 25 * (level - 1) * level;
}

export function levelInfo(xp: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, xp, intoLevel: xp - floor, levelSize: next - floor, toNext: next - xp };
}

export const LEVEL_TITLES = [
  "Number Explorer", "Number Explorer", "Counting Champ", "Pattern Finder", "Problem Solver",
  "Math Detective", "Equation Ace", "Fraction Wizard", "Number Ninja", "Math Hero", "Math Legend",
];
export const levelTitle = (level: number) => LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length - 1)];

export const AVATARS: { emoji: string; level: number }[] = [
  { emoji: "🦊", level: 1 }, { emoji: "🐼", level: 1 }, { emoji: "🐯", level: 1 }, { emoji: "🐸", level: 1 },
  { emoji: "🐧", level: 1 }, { emoji: "🐙", level: 1 },
  { emoji: "🦉", level: 2 }, { emoji: "🐝", level: 2 },
  { emoji: "🦄", level: 3 }, { emoji: "🐬", level: 3 },
  { emoji: "🦖", level: 4 }, { emoji: "🦈", level: 4 },
  { emoji: "🐲", level: 5 }, { emoji: "🦅", level: 6 },
  { emoji: "🤖", level: 7 }, { emoji: "🧙", level: 8 },
  { emoji: "🦸", level: 10 }, { emoji: "👑", level: 12 },
];
export const STARTER_AVATARS = AVATARS.filter((a) => a.level === 1).map((a) => a.emoji);

export function avatarUnlocked(emoji: string, level: number): boolean {
  const a = AVATARS.find((x) => x.emoji === emoji);
  return !!a && a.level <= level;
}

export type BadgeStats = {
  drillsCompleted: number;
  perfectDrills: number;
  hintFreeDrills: number;
  bestStreak: number;
  bestCheckInStreak: number;
  problemsCorrect: number;
  skillsMastered: number;
  homeworkSolved: number;
  weeklyGoalsMet: number;
  level: number;
};

export type Badge = { id: string; emoji: string; name: string; description: string; earned: (s: BadgeStats) => boolean };

export const BADGES: Badge[] = [
  { id: "first-drill", emoji: "🎯", name: "First Steps", description: "Finish your first daily drill", earned: (s) => s.drillsCompleted >= 1 },
  { id: "drills-25", emoji: "📚", name: "Hard Worker", description: "Finish 25 daily drills", earned: (s) => s.drillsCompleted >= 25 },
  { id: "perfect", emoji: "💯", name: "Perfect Score", description: "Get every problem right on the first try", earned: (s) => s.perfectDrills >= 1 },
  { id: "perfect-5", emoji: "🌟", name: "Superstar", description: "Get 5 perfect drills", earned: (s) => s.perfectDrills >= 5 },
  { id: "no-hints", emoji: "🧠", name: "Brain Power", description: "Finish a drill without any hints", earned: (s) => s.hintFreeDrills >= 1 },
  { id: "streak-3", emoji: "🔥", name: "On Fire", description: "Do your drill 3 days in a row", earned: (s) => s.bestStreak >= 3 },
  { id: "streak-7", emoji: "⚡", name: "Week Warrior", description: "Do your drill 7 days in a row", earned: (s) => s.bestStreak >= 7 },
  { id: "streak-30", emoji: "🏆", name: "Unstoppable", description: "Do your drill 30 days in a row", earned: (s) => s.bestStreak >= 30 },
  { id: "checkin-7", emoji: "📅", name: "Regular", description: "Check in 7 days in a row", earned: (s) => s.bestCheckInStreak >= 7 },
  { id: "correct-100", emoji: "🧮", name: "Century", description: "Answer 100 problems right on the first try", earned: (s) => s.problemsCorrect >= 100 },
  { id: "correct-500", emoji: "🚀", name: "Rocket Brain", description: "Answer 500 problems right on the first try", earned: (s) => s.problemsCorrect >= 500 },
  { id: "skill-1", emoji: "⭐", name: "Skill Unlocked", description: "Master your first skill", earned: (s) => s.skillsMastered >= 1 },
  { id: "skill-10", emoji: "🎓", name: "Scholar", description: "Master 10 skills", earned: (s) => s.skillsMastered >= 10 },
  { id: "homework-1", emoji: "🧭", name: "Problem Solver", description: "Solve a homework problem with Math Buddy", earned: (s) => s.homeworkSolved >= 1 },
  { id: "homework-10", emoji: "🗺️", name: "Pathfinder", description: "Solve 10 homework problems with Math Buddy", earned: (s) => s.homeworkSolved >= 10 },
  { id: "weekly-goal", emoji: "🎉", name: "Goal Getter", description: "Reach your weekly goal", earned: (s) => s.weeklyGoalsMet >= 1 },
  { id: "level-5", emoji: "🥇", name: "Level 5", description: "Reach level 5", earned: (s) => s.level >= 5 },
  { id: "level-10", emoji: "👑", name: "Level 10", description: "Reach level 10", earned: (s) => s.level >= 10 },
];
export const BADGES_BY_ID = new Map(BADGES.map((b) => [b.id, b]));

/** Badges whose conditions are met but which haven't been awarded yet. */
export function newBadges(stats: BadgeStats, earned: Set<string>): Badge[] {
  return BADGES.filter((b) => !earned.has(b.id) && b.earned(stats));
}

function shiftDate(date: string, days: number): string {
  const t = new Date(date + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

/** The Monday starting the week that contains `date` (YYYY-MM-DD). */
export function weekStart(date: string): string {
  const day = new Date(date + "T00:00:00Z").getUTCDay(); // 0 = Sunday
  return shiftDate(date, -((day + 6) % 7));
}

export function weekDates(date: string): string[] {
  const start = weekStart(date);
  return Array.from({ length: 7 }, (_, i) => shiftDate(start, i));
}

/** Longest run of consecutive days in a set of dates. */
export function longestStreak(dates: string[]): number {
  const days = new Set(dates);
  let best = 0;
  for (const d of days) {
    if (days.has(shiftDate(d, -1))) continue; // only count from the start of a run
    let run = 1;
    while (days.has(shiftDate(d, run))) run++;
    best = Math.max(best, run);
  }
  return best;
}

/** Consecutive days ending on `date` (inclusive). */
export function streakEndingOn(dates: string[], date: string): number {
  const days = new Set(dates);
  let n = 0;
  while (days.has(shiftDate(date, -n))) n++;
  return n;
}
